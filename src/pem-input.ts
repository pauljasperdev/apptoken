import * as Terminal from "@effect/platform/Terminal";
import { Effect } from "effect";

const END_MARKER = /-----END (RSA )?PRIVATE KEY-----/;

type ReadOptions = {
  handleSigint?: boolean;
};

export function readPemFromStream(
  stream: NodeJS.ReadableStream,
  options: ReadOptions = {},
): Effect.Effect<string, Terminal.QuitException> {
  return Effect.async<string, Terminal.QuitException>((resume) => {
    let buffer = "";
    let resolved = false;

    const cleanup = () => {
      stream.off("data", onData);
      stream.off("end", onEnd);
      stream.off("error", onError);
      if (options.handleSigint) {
        process.off("SIGINT", onSigint);
      }
      if (typeof stream.pause === "function") {
        stream.pause();
      }
    };

    const onData = (chunk: Buffer | string) => {
      buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (END_MARKER.test(buffer)) {
        resolved = true;
        cleanup();
        resume(Effect.succeed(buffer));
      }
    };

    const onEnd = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resume(Effect.succeed(buffer));
    };

    const onError = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resume(Effect.succeed(buffer));
    };

    const onSigint = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resume(Effect.fail(new Terminal.QuitException()));
    };

    stream.on("data", onData);
    stream.on("end", onEnd);
    stream.on("error", onError);
    if (options.handleSigint) {
      process.on("SIGINT", onSigint);
    }

    return Effect.sync(cleanup);
  });
}
