import { Effect } from "effect";
import { Data } from "effect";
import { spawn } from "child_process";

export class CommandNotFound extends Data.TaggedError("CommandNotFound")<{
  readonly command: string;
}> {}

export class CommandFailed extends Data.TaggedError("CommandFailed")<{
  readonly exitCode: number;
  readonly stderr: string;
}> {}

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function runGh(
  args: readonly string[],
  token: string,
  command: string = "gh"
): Effect.Effect<CommandResult, CommandNotFound | CommandFailed> {
  return Effect.async<CommandResult, CommandNotFound | CommandFailed>(
    (resume) => {
      let proc: ReturnType<typeof spawn>;

      try {
        proc = spawn(command, args, {
          env: {
            ...process.env,
            GITHUB_TOKEN: token,
            GH_TOKEN: token,
          },
          stdio: ["inherit", "pipe", "pipe"],
        });
      } catch {
        resume(Effect.fail(new CommandNotFound({ command })));
        return;
      }

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") {
          resume(Effect.fail(new CommandNotFound({ command })));
        } else {
          resume(
            Effect.fail(new CommandFailed({ exitCode: 1, stderr: String(err) }))
          );
        }
      });

      proc.on("close", (code) => {
        const exitCode = code ?? 1;
        if (exitCode !== 0) {
          resume(Effect.fail(new CommandFailed({ exitCode, stderr })));
        } else {
          resume(Effect.succeed({ exitCode, stdout, stderr }));
        }
      });
    }
  );
}
