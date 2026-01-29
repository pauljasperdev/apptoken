import { Effect } from "effect";
import { createServer, type Server } from "net";
import {
  chmodSync,
  existsSync,
  unlinkSync,
  writeFileSync,
  readFileSync,
} from "fs";
import type { TokenService } from "./TokenService.ts";
import {
  DaemonAlreadyRunning,
  DaemonNotRunning,
  DaemonError,
} from "../errors.ts";

export interface DaemonStatus {
  readonly running: boolean;
  readonly pid?: number;
}

export interface DaemonServiceConfig<E1, E2> {
  readonly socketPath: string;
  readonly pidPath: string;
  readonly tokenService: TokenService<E1, E2>;
}

export interface DaemonService {
  readonly start: () => Effect.Effect<void, DaemonAlreadyRunning | DaemonError>;
  readonly stop: () => Effect.Effect<void, DaemonNotRunning | DaemonError>;
  readonly status: () => Effect.Effect<DaemonStatus>;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function handleRequest<E1, E2>(
  raw: string,
  tokenService: TokenService<E1, E2>
): Effect.Effect<string, never> {
  return Effect.gen(function* () {
    let parsed: { action?: string };
    try {
      parsed = JSON.parse(raw.trim()) as { action?: string };
    } catch {
      return JSON.stringify({ ok: false, error: "Invalid JSON" });
    }

    if (parsed.action === "ping") {
      return JSON.stringify({ ok: true, pong: true });
    }

    if (parsed.action === "getToken") {
      const result = yield* Effect.either(
        tokenService.getInstallationToken()
      );

      if (result._tag === "Right") {
        return JSON.stringify({
          ok: true,
          token: result.right.token,
          expiresAt: result.right.expiresAt.toISOString(),
        });
      }

      return JSON.stringify({
        ok: false,
        error: String(result.left),
      });
    }

    return JSON.stringify({
      ok: false,
      error: `Unknown action: ${parsed.action ?? "(none)"}`,
    });
  });
}

export function makeDaemonService<E1, E2>(
  config: DaemonServiceConfig<E1, E2>
): DaemonService {
  let server: Server | undefined;

  return {
    start: () =>
      Effect.gen(function* () {
        // Check if already running in this instance
        if (server) {
          return yield* Effect.fail(new DaemonAlreadyRunning());
        }

        // Check for existing PID file
        if (existsSync(config.pidPath)) {
          const pidContent = readFileSync(config.pidPath, "utf8").trim();
          const existingPid = parseInt(pidContent, 10);
          if (!Number.isNaN(existingPid) && isProcessAlive(existingPid)) {
            return yield* Effect.fail(new DaemonAlreadyRunning());
          }
          // Stale PID file — clean up
          unlinkSync(config.pidPath);
        }

        // Clean up stale socket file
        if (existsSync(config.socketPath)) {
          unlinkSync(config.socketPath);
        }

        // Start the socket server
        const srv = yield* Effect.tryPromise({
          try: () =>
            new Promise<Server>((resolve, reject) => {
              const s = createServer((socket) => {
                let buffer = "";
                socket.on("data", (chunk) => {
                  buffer += chunk.toString();
                  const newlineIndex = buffer.indexOf("\n");
                  if (newlineIndex !== -1) {
                    const message = buffer.slice(0, newlineIndex);
                    buffer = buffer.slice(newlineIndex + 1);
                    Effect.runPromise(
                      handleRequest(message, config.tokenService)
                    )
                      .then((response) => {
                        socket.write(response + "\n");
                      })
                      .catch((err) => {
                        socket.write(
                          JSON.stringify({ ok: false, error: String(err) }) +
                            "\n"
                        );
                      });
                  }
                });
              });
              s.listen(config.socketPath, () => {
                try {
                  chmodSync(config.socketPath, 0o600);
                } catch {
                  // ignore permission errors
                }
                resolve(s);
              });
              s.on("error", reject);
            }),
          catch: (err) =>
            new DaemonError({
              message: err instanceof Error ? err.message : String(err),
            }),
        });

        server = srv;

        // Write PID file
        writeFileSync(config.pidPath, String(process.pid), "utf8");
      }),

    stop: () =>
      Effect.gen(function* () {
        if (!server) {
          return yield* Effect.fail(new DaemonNotRunning());
        }

        const srv = server;
        server = undefined;

        yield* Effect.tryPromise({
          try: () =>
            new Promise<void>((resolve, reject) => {
              srv.close((err) => {
                if (err) reject(err);
                else resolve();
              });
            }),
          catch: (err) =>
            new DaemonError({
              message: err instanceof Error ? err.message : String(err),
            }),
        });

        // Clean up files
        if (existsSync(config.socketPath)) {
          unlinkSync(config.socketPath);
        }
        if (existsSync(config.pidPath)) {
          unlinkSync(config.pidPath);
        }
      }),

    status: () =>
      Effect.sync(() => {
        if (server) {
          return { running: true, pid: process.pid };
        }

        // Check PID file
        if (existsSync(config.pidPath)) {
          const pidContent = readFileSync(config.pidPath, "utf8").trim();
          const pid = parseInt(pidContent, 10);
          if (!Number.isNaN(pid) && isProcessAlive(pid)) {
            return { running: true, pid };
          }
        }

        return { running: false };
      }),
  };
}
