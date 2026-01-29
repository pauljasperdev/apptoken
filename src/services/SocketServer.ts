import { Effect, Scope } from "effect";
import { createServer, type Server } from "net";
import { chmodSync, existsSync, unlinkSync } from "fs";
import type { TokenService } from "./TokenService.ts";

export interface SocketServerConfig<E1, E2> {
  readonly socketPath: string;
  readonly tokenService: TokenService<E1, E2>;
}

export interface ServerHandle {
  readonly server: Server;
  readonly socketPath: string;
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

function listenOnSocket<E1, E2>(
  socketPath: string,
  tokenService: TokenService<E1, E2>
): Promise<ServerHandle> {
  return new Promise((resolve, reject) => {
    // Clean up stale socket file if it exists
    if (existsSync(socketPath)) {
      unlinkSync(socketPath);
    }

    const server = createServer((socket) => {
      let buffer = "";

      socket.on("data", (chunk) => {
        buffer += chunk.toString();

        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex !== -1) {
          const message = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          Effect.runPromise(handleRequest(message, tokenService))
            .then((response) => {
              socket.write(response + "\n");
            })
            .catch((err) => {
              socket.write(
                JSON.stringify({ ok: false, error: String(err) }) + "\n"
              );
            });
        }
      });
    });

    server.listen(socketPath, () => {
      try {
        chmodSync(socketPath, 0o600);
      } catch {
        // ignore permission errors
      }
      resolve({ server, socketPath });
    });
    server.on("error", reject);
  });
}

export function makeSocketServer<E1, E2>(
  config: SocketServerConfig<E1, E2>
): Effect.Effect<ServerHandle, Error, Scope.Scope> {
  return Effect.acquireRelease(
    Effect.tryPromise({
      try: () => listenOnSocket(config.socketPath, config.tokenService),
      catch: (err) =>
        err instanceof Error ? err : new Error(String(err)),
    }),
    (handle) =>
      Effect.sync(() => {
        handle.server.close();
        if (existsSync(handle.socketPath)) {
          unlinkSync(handle.socketPath);
        }
      })
  );
}
