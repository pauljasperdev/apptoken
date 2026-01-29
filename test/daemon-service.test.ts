import { describe, expect, test, afterEach } from "bun:test";
import { Effect } from "effect";
import {
  existsSync,
  unlinkSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  statSync,
} from "fs";
import { join } from "path";
import * as net from "net";
import {
  makeDaemonService,
  type DaemonStatus,
} from "../src/services/DaemonService.ts";
import {
  DaemonAlreadyRunning,
  DaemonNotRunning,
} from "../src/errors.ts";
import { makeTokenService } from "../src/services/TokenService.ts";

const MOCK_TOKEN = "ghs_xxxxxxxxxxxxxxxxxxxx";
const MOCK_EXPIRES = new Date(Date.now() + 60 * 60 * 1000);

let testCounter = 0;
function makeTestDir(): string {
  const dir = `/tmp/at-daemon-test-${process.pid}-${testCounter++}`;
  mkdirSync(dir, { recursive: true });
  return dir;
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

const cleanupDirs: string[] = [];

afterEach(() => {
  for (const dir of cleanupDirs) {
    try {
      // Clean up socket and pid files
      const socketPath = join(dir, "apptoken.sock");
      const pidPath = join(dir, "apptoken.pid");
      if (existsSync(socketPath)) unlinkSync(socketPath);
      if (existsSync(pidPath)) unlinkSync(pidPath);
      // Remove the directory
      if (existsSync(dir)) {
        const { rmSync } = require("fs");
        rmSync(dir, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup errors
    }
  }
  cleanupDirs.length = 0;
});

describe("DaemonService", () => {
  describe("start", () => {
    test("starts daemon, creates socket file and PID file", async () => {
      const testDir = makeTestDir();
      cleanupDirs.push(testDir);

      const socketPath = join(testDir, "apptoken.sock");
      const pidPath = join(testDir, "apptoken.pid");

      const daemon = makeDaemonService({
        socketPath,
        pidPath,
        tokenService: makeMockTokenService(),
      });

      await Effect.runPromise(daemon.start());

      // Socket file should exist
      expect(existsSync(socketPath)).toBe(true);
      const mode = statSync(socketPath).mode & 0o777;
      expect(mode).toBe(0o600);

      // PID file should exist and contain a valid PID
      expect(existsSync(pidPath)).toBe(true);
      const pidContent = readFileSync(pidPath, "utf8").trim();
      const pid = parseInt(pidContent, 10);
      expect(Number.isNaN(pid)).toBe(false);
      expect(pid).toBeGreaterThan(0);

      // Clean up
      await Effect.runPromise(daemon.stop());
    });

    test("returns DaemonAlreadyRunning if daemon is already started", async () => {
      const testDir = makeTestDir();
      cleanupDirs.push(testDir);

      const socketPath = join(testDir, "apptoken.sock");
      const pidPath = join(testDir, "apptoken.pid");

      const daemon = makeDaemonService({
        socketPath,
        pidPath,
        tokenService: makeMockTokenService(),
      });

      await Effect.runPromise(daemon.start());

      // Second start should fail
      const result = await Effect.runPromise(Effect.either(daemon.start()));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(DaemonAlreadyRunning);
      }

      // Clean up
      await Effect.runPromise(daemon.stop());
    });

    test("cleans up stale socket and PID files before starting", async () => {
      const testDir = makeTestDir();
      cleanupDirs.push(testDir);

      const socketPath = join(testDir, "apptoken.sock");
      const pidPath = join(testDir, "apptoken.pid");

      // Write a stale PID file with a non-existent PID
      writeFileSync(pidPath, "999999999", "utf8");

      const daemon = makeDaemonService({
        socketPath,
        pidPath,
        tokenService: makeMockTokenService(),
      });

      // Should succeed despite stale PID file (process doesn't exist)
      await Effect.runPromise(daemon.start());

      expect(existsSync(socketPath)).toBe(true);
      expect(existsSync(pidPath)).toBe(true);

      await Effect.runPromise(daemon.stop());
    });
  });

  describe("stop", () => {
    test("stops running daemon, removes socket and PID files", async () => {
      const testDir = makeTestDir();
      cleanupDirs.push(testDir);

      const socketPath = join(testDir, "apptoken.sock");
      const pidPath = join(testDir, "apptoken.pid");

      const daemon = makeDaemonService({
        socketPath,
        pidPath,
        tokenService: makeMockTokenService(),
      });

      await Effect.runPromise(daemon.start());
      expect(existsSync(socketPath)).toBe(true);
      expect(existsSync(pidPath)).toBe(true);

      await Effect.runPromise(daemon.stop());

      // After a short delay for cleanup
      await new Promise((r) => setTimeout(r, 100));

      // Socket file should be removed
      expect(existsSync(socketPath)).toBe(false);
      // PID file should be removed
      expect(existsSync(pidPath)).toBe(false);
    });

    test("returns DaemonNotRunning if daemon is not started", async () => {
      const testDir = makeTestDir();
      cleanupDirs.push(testDir);

      const socketPath = join(testDir, "apptoken.sock");
      const pidPath = join(testDir, "apptoken.pid");

      const daemon = makeDaemonService({
        socketPath,
        pidPath,
        tokenService: makeMockTokenService(),
      });

      const result = await Effect.runPromise(Effect.either(daemon.stop()));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(DaemonNotRunning);
      }
    });
  });

  describe("status", () => {
    test("returns 'running' when daemon is active", async () => {
      const testDir = makeTestDir();
      cleanupDirs.push(testDir);

      const socketPath = join(testDir, "apptoken.sock");
      const pidPath = join(testDir, "apptoken.pid");

      const daemon = makeDaemonService({
        socketPath,
        pidPath,
        tokenService: makeMockTokenService(),
      });

      await Effect.runPromise(daemon.start());

      const status: DaemonStatus = await Effect.runPromise(daemon.status());

      expect(status.running).toBe(true);
      expect(status.pid).toBeDefined();
      expect(typeof status.pid).toBe("number");
      expect(status.pid!).toBeGreaterThan(0);

      await Effect.runPromise(daemon.stop());
    });

    test("returns 'stopped' when daemon is not running", async () => {
      const testDir = makeTestDir();
      cleanupDirs.push(testDir);

      const socketPath = join(testDir, "apptoken.sock");
      const pidPath = join(testDir, "apptoken.pid");

      const daemon = makeDaemonService({
        socketPath,
        pidPath,
        tokenService: makeMockTokenService(),
      });

      const status: DaemonStatus = await Effect.runPromise(daemon.status());

      expect(status.running).toBe(false);
      expect(status.pid).toBeUndefined();
    });

    test("returns 'stopped' when PID file exists but process is dead", async () => {
      const testDir = makeTestDir();
      cleanupDirs.push(testDir);

      const socketPath = join(testDir, "apptoken.sock");
      const pidPath = join(testDir, "apptoken.pid");

      // Write a PID file for a non-existent process
      writeFileSync(pidPath, "999999999", "utf8");

      const daemon = makeDaemonService({
        socketPath,
        pidPath,
        tokenService: makeMockTokenService(),
      });

      const status: DaemonStatus = await Effect.runPromise(daemon.status());

      expect(status.running).toBe(false);
      expect(status.pid).toBeUndefined();
    });
  });

  describe("graceful shutdown", () => {
    test("socket server responds to requests while running", async () => {
      const testDir = makeTestDir();
      cleanupDirs.push(testDir);

      const socketPath = join(testDir, "apptoken.sock");
      const pidPath = join(testDir, "apptoken.pid");

      const daemon = makeDaemonService({
        socketPath,
        pidPath,
        tokenService: makeMockTokenService(),
      });

      await Effect.runPromise(daemon.start());

      // Verify socket is accepting connections by sending a ping
      const response = await new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const client = net.createConnection({ path: socketPath }, () => {
            client.write(JSON.stringify({ action: "ping" }) + "\n");
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
            reject(new Error("Timeout"));
          }, 5000);
        }
      );

      expect(response["ok"]).toBe(true);
      expect(response["pong"]).toBe(true);

      await Effect.runPromise(daemon.stop());
    });

    test("stop cleans up all resources", async () => {
      const testDir = makeTestDir();
      cleanupDirs.push(testDir);

      const socketPath = join(testDir, "apptoken.sock");
      const pidPath = join(testDir, "apptoken.pid");

      const daemon = makeDaemonService({
        socketPath,
        pidPath,
        tokenService: makeMockTokenService(),
      });

      await Effect.runPromise(daemon.start());

      // Verify resources exist
      expect(existsSync(socketPath)).toBe(true);
      expect(existsSync(pidPath)).toBe(true);

      await Effect.runPromise(daemon.stop());

      // Allow cleanup time
      await new Promise((r) => setTimeout(r, 100));

      // Verify all resources cleaned up
      expect(existsSync(socketPath)).toBe(false);
      expect(existsSync(pidPath)).toBe(false);

      // Verify socket is no longer accepting connections
      const connectResult = await new Promise<string>((resolve) => {
        const client = net.createConnection({ path: socketPath });
        client.on("error", (err: NodeJS.ErrnoException) => {
          resolve(err.code ?? "UNKNOWN");
        });
        client.on("connect", () => {
          client.destroy();
          resolve("CONNECTED");
        });
        setTimeout(() => {
          client.destroy();
          resolve("TIMEOUT");
        }, 1000);
      });

      expect(connectResult).toBe("ENOENT");
    });
  });
});
