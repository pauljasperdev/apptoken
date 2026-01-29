import { describe, expect, test, afterEach } from "bun:test";
import { Effect, Exit, Scope } from "effect";
import { makeSocketServer } from "../src/services/SocketServer.ts";
import { makeSocketClient } from "../src/services/SocketClient.ts";
import { makeTokenService } from "../src/services/TokenService.ts";
import { DaemonNotRunning, SocketError } from "../src/errors.ts";
import { existsSync, unlinkSync } from "fs";
import * as net from "net";

const MOCK_TOKEN = "ghs_xxxxxxxxxxxxxxxxxxxx";
const MOCK_EXPIRES = new Date(Date.now() + 60 * 60 * 1000);

let socketCounter = 0;
function makeTestSocketPath(): string {
  return `/tmp/at-client-test-${process.pid}-${socketCounter++}.sock`;
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

describe("SocketClient", () => {
  test("requestToken connects to server and returns installation token", async () => {
    const socketPath = makeTestSocketPath();
    cleanupPaths.push(socketPath);

    const tokenService = makeMockTokenService();
    const scope = Effect.runSync(Scope.make());

    await Effect.runPromise(
      makeSocketServer({ socketPath, tokenService }).pipe(
        Scope.extend(scope)
      )
    );

    const client = makeSocketClient(socketPath);
    const token = await Effect.runPromise(client.requestToken());

    expect(token.token).toBe(MOCK_TOKEN);
    expect(token.expiresAt).toBeInstanceOf(Date);

    await Effect.runPromise(Scope.close(scope, Exit.void));
  });

  test("ping connects to server and succeeds", async () => {
    const socketPath = makeTestSocketPath();
    cleanupPaths.push(socketPath);

    const tokenService = makeMockTokenService();
    const scope = Effect.runSync(Scope.make());

    await Effect.runPromise(
      makeSocketServer({ socketPath, tokenService }).pipe(
        Scope.extend(scope)
      )
    );

    const client = makeSocketClient(socketPath);
    await Effect.runPromise(client.ping());

    // If we get here without error, ping succeeded
    expect(true).toBe(true);

    await Effect.runPromise(Scope.close(scope, Exit.void));
  });

  test("returns DaemonNotRunning when socket does not exist", async () => {
    const socketPath = `/tmp/at-nonexistent-${process.pid}.sock`;

    const client = makeSocketClient(socketPath);
    const result = await Effect.runPromise(
      Effect.either(client.requestToken())
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DaemonNotRunning);
    }
  });

  test("returns DaemonNotRunning when connection is refused", async () => {
    // Create a socket file that no one is listening on
    const socketPath = makeTestSocketPath();
    cleanupPaths.push(socketPath);

    // Create a server, get the socket file created, then close it
    // to simulate a stale socket file
    const server = net.createServer();
    await new Promise<void>((resolve) => {
      server.listen(socketPath, () => resolve());
    });
    server.close();
    await new Promise((r) => setTimeout(r, 100));

    const client = makeSocketClient(socketPath);
    const result = await Effect.runPromise(
      Effect.either(client.requestToken())
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DaemonNotRunning);
    }
  });

  test("returns SocketError for malformed server response", async () => {
    const socketPath = makeTestSocketPath();
    cleanupPaths.push(socketPath);

    // Create a mock server that returns invalid JSON
    const server = net.createServer((socket) => {
      socket.on("data", () => {
        socket.write("this is not json\n");
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(socketPath, () => resolve());
    });

    try {
      const client = makeSocketClient(socketPath);
      const result = await Effect.runPromise(
        Effect.either(client.requestToken())
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(SocketError);
      }
    } finally {
      server.close();
    }
  });

  test("returns SocketError when server returns ok:false", async () => {
    const socketPath = makeTestSocketPath();
    cleanupPaths.push(socketPath);

    // Create a mock server that returns an error response
    const server = net.createServer((socket) => {
      socket.on("data", () => {
        socket.write(JSON.stringify({ ok: false, error: "internal error" }) + "\n");
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(socketPath, () => resolve());
    });

    try {
      const client = makeSocketClient(socketPath);
      const result = await Effect.runPromise(
        Effect.either(client.requestToken())
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(SocketError);
      }
    } finally {
      server.close();
    }
  });

  test("ping returns DaemonNotRunning when socket does not exist", async () => {
    const socketPath = `/tmp/at-nonexistent-ping-${process.pid}.sock`;

    const client = makeSocketClient(socketPath);
    const result = await Effect.runPromise(
      Effect.either(client.ping())
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DaemonNotRunning);
    }
  });
});
