import { Effect } from "effect";
import { connect, type Socket } from "net";
import { existsSync } from "fs";
import { DaemonNotRunning, SocketError } from "../errors.ts";

export interface SocketClient {
  readonly requestToken: () => Effect.Effect<
    { token: string; expiresAt: Date },
    DaemonNotRunning | SocketError
  >;
  readonly ping: () => Effect.Effect<void, DaemonNotRunning | SocketError>;
}

function sendRequest(
  socketPath: string,
  message: string
): Effect.Effect<string, DaemonNotRunning | SocketError> {
  return Effect.async<string, DaemonNotRunning | SocketError>((resume) => {
    if (!existsSync(socketPath)) {
      resume(Effect.fail(new DaemonNotRunning()));
      return;
    }

    let buffer = "";
    let socket: Socket;

    try {
      socket = connect(socketPath);
    } catch {
      resume(Effect.fail(new DaemonNotRunning()));
      return;
    }

    socket.on("connect", () => {
      socket.write(message + "\n");
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex !== -1) {
        const response = buffer.slice(0, newlineIndex);
        socket.destroy();
        resume(Effect.succeed(response));
      }
    });

    socket.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ECONNREFUSED" || err.code === "ENOENT") {
        resume(Effect.fail(new DaemonNotRunning()));
      } else {
        resume(Effect.fail(new SocketError({ message: String(err) })));
      }
    });
  });
}

export function makeSocketClient(socketPath: string): SocketClient {
  return {
    requestToken: () =>
      Effect.gen(function* () {
        const raw = yield* sendRequest(
          socketPath,
          JSON.stringify({ action: "getToken" })
        );

        let parsed: { ok?: boolean; token?: string; expiresAt?: string; error?: string };
        try {
          parsed = JSON.parse(raw) as typeof parsed;
        } catch {
          return yield* Effect.fail(
            new SocketError({ message: "Malformed response" })
          );
        }

        if (!parsed.ok) {
          return yield* Effect.fail(
            new SocketError({ message: parsed.error ?? "Server error" })
          );
        }

        if (!parsed.token || !parsed.expiresAt) {
          return yield* Effect.fail(
            new SocketError({ message: "Missing token or expiresAt in response" })
          );
        }

        return {
          token: parsed.token,
          expiresAt: new Date(parsed.expiresAt),
        };
      }),

    ping: () =>
      Effect.gen(function* () {
        yield* sendRequest(
          socketPath,
          JSON.stringify({ action: "ping" })
        );
      }),
  };
}
