import { describe, expect, test, afterEach } from "bun:test";
import { Effect, Exit, Scope } from "effect";
import { makeSocketServer } from "../src/services/SocketServer.ts";
import { makeTokenService } from "../src/services/TokenService.ts";
import { existsSync, statSync, unlinkSync } from "fs";
import * as net from "net";

const MOCK_TOKEN = "ghs_xxxxxxxxxxxxxxxxxxxx";
const MOCK_EXPIRES = new Date(Date.now() + 60 * 60 * 1000);

let socketCounter = 0;
function makeTestSocketPath(): string {
  // Use /tmp directly with short names to stay under macOS 104-byte socket path limit
  return `/tmp/at-test-${process.pid}-${socketCounter++}.sock`;
}

function makeMockTokenService() {
  return makeTokenService({
    pem: "test-pem",
    appId: "12345",
    installationId: "67890",
    generateJwt: () => Effect.succeed("mock-jwt"),
    requestInstallationToken: () =>
      Effect.succeed({ token: MOCK_TOKEN, expiresAt: MOCK_EXPIRES }),
  });
}

function sendRequest(
  socketPath: string,
  request: object
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection({ path: socketPath }, () => {
      client.write(JSON.stringify(request) + "\n");
    });

    let data = "";
    client.on("data", (chunk) => {
      data += chunk.toString();
      if (data.includes("\n")) {
        client.end();
        try {
          resolve(JSON.parse(data.trim()) as Record<string, unknown>);
        } catch (e) {
          reject(e);
        }
      }
    });

    client.on("error", reject);

    setTimeout(() => {
      client.destroy();
      reject(new Error("Timeout waiting for response"));
    }, 5000);
  });
}

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const p of cleanupPaths) {
    try {
      if (existsSync(p)) unlinkSync(p);
    } catch {
      // ignore
    }
  }
  cleanupPaths.length = 0;
});

describe("SocketServer", () => {
  test("starts and creates socket file", async () => {
    const socketPath = makeTestSocketPath();
    cleanupPaths.push(socketPath);

    const tokenService = makeMockTokenService();
    const scope = Effect.runSync(Scope.make());

    const handle = await Effect.runPromise(
      makeSocketServer({ socketPath, tokenService }).pipe(
        Scope.extend(scope)
      )
    );

    expect(existsSync(socketPath)).toBe(true);
    const mode = statSync(socketPath).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(handle.socketPath).toBe(socketPath);

    await Effect.runPromise(Scope.close(scope, Exit.void));
  });

  test("handles ping request", async () => {
    const socketPath = makeTestSocketPath();
    cleanupPaths.push(socketPath);

    const tokenService = makeMockTokenService();
    const scope = Effect.runSync(Scope.make());

    await Effect.runPromise(
      makeSocketServer({ socketPath, tokenService }).pipe(
        Scope.extend(scope)
      )
    );

    const response = await sendRequest(socketPath, { action: "ping" });

    expect(response["ok"]).toBe(true);
    expect(response["pong"]).toBe(true);

    await Effect.runPromise(Scope.close(scope, Exit.void));
  });

  test("handles getToken request and returns installation token", async () => {
    const socketPath = makeTestSocketPath();
    cleanupPaths.push(socketPath);

    const tokenService = makeMockTokenService();
    const scope = Effect.runSync(Scope.make());

    await Effect.runPromise(
      makeSocketServer({ socketPath, tokenService }).pipe(
        Scope.extend(scope)
      )
    );

    const response = await sendRequest(socketPath, { action: "getToken" });

    expect(response["ok"]).toBe(true);
    expect(response["token"]).toBe(MOCK_TOKEN);
    expect(response["expiresAt"]).toBeDefined();

    await Effect.runPromise(Scope.close(scope, Exit.void));
  });

  test("removes socket file on stop", async () => {
    const socketPath = makeTestSocketPath();

    const tokenService = makeMockTokenService();
    const scope = Effect.runSync(Scope.make());

    await Effect.runPromise(
      makeSocketServer({ socketPath, tokenService }).pipe(
        Scope.extend(scope)
      )
    );

    expect(existsSync(socketPath)).toBe(true);

    await Effect.runPromise(Scope.close(scope, Exit.void));

    // Give a moment for cleanup
    await new Promise((r) => setTimeout(r, 100));

    expect(existsSync(socketPath)).toBe(false);
  });

  test("returns error for unknown action", async () => {
    const socketPath = makeTestSocketPath();
    cleanupPaths.push(socketPath);

    const tokenService = makeMockTokenService();
    const scope = Effect.runSync(Scope.make());

    await Effect.runPromise(
      makeSocketServer({ socketPath, tokenService }).pipe(
        Scope.extend(scope)
      )
    );

    const response = await sendRequest(socketPath, {
      action: "unknownAction",
    });

    expect(response["ok"]).toBe(false);
    expect(response["error"]).toBeDefined();

    await Effect.runPromise(Scope.close(scope, Exit.void));
  });
});
