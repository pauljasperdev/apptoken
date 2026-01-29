import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  runGh,
  type CommandResult,
  CommandNotFound,
  CommandFailed,
} from "../src/services/CommandExecutor.ts";

describe("CommandExecutor", () => {
  describe("runGh", () => {
    test("runs command and captures stdout", async () => {
      const result: CommandResult = await Effect.runPromise(
        runGh(["-e", `console.log("hello")`], "ghs_test_token_123", "bun")
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("hello");
    });

    test("passes arguments through to the command", async () => {
      const result = await Effect.runPromise(
        runGh(["-e", `console.log(JSON.stringify(process.argv.slice(2)))`], "ghs_test", "bun")
      );

      expect(result.exitCode).toBe(0);
    });

    test("returns CommandFailed for non-zero exit code", async () => {
      const result = await Effect.runPromise(
        Effect.either(
          runGh(["-e", `process.exit(42)`], "ghs_test", "bun")
        )
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(CommandFailed);
        if (result.left instanceof CommandFailed) {
          expect(result.left.exitCode).toBe(42);
        }
      }
    });

    test("returns CommandNotFound when executable does not exist", async () => {
      const result = await Effect.runPromise(
        Effect.either(
          runGh(["--version"], "ghs_test_token_123", "nonexistent-gh-binary-xyz")
        )
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(CommandNotFound);
      }
    });

    test("injects token as GITHUB_TOKEN environment variable", async () => {
      const token = "ghs_secret_token_value";
      const result = await Effect.runPromise(
        runGh(
          ["-e", `console.log(process.env.GITHUB_TOKEN)`],
          token,
          "bun"
        )
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(token);
    });

    test("injects token as GH_TOKEN environment variable", async () => {
      const token = "ghs_secret_token_value";
      const result = await Effect.runPromise(
        runGh(
          ["-e", `console.log(process.env.GH_TOKEN)`],
          token,
          "bun"
        )
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(token);
    });

    test("captures stderr output", async () => {
      const result = await Effect.runPromise(
        runGh(
          ["-e", `console.error("stderr output")`],
          "ghs_test",
          "bun"
        )
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr.trim()).toBe("stderr output");
    });
  });
});
