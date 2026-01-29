import { Args, Command, Options, Prompt } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Console, Effect, Redacted } from "effect";
import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import {
  loadConfig,
  saveConfig,
  saveEncryptedPem,
  loadEncryptedPem,
  encryptPem,
  decryptPem,
  getConfigDir,
  getPemPath,
  type AppConfig,
} from "./services/ConfigService.ts";
import { generateJwt } from "./services/JwtService.ts";
import { makeTokenService } from "./services/TokenService.ts";
import { makeDaemonService } from "./services/DaemonService.ts";
import { makeSocketClient } from "./services/SocketClient.ts";
import { runGh, CommandNotFound } from "./services/CommandExecutor.ts";
import { DaemonNotRunning, SocketError } from "./errors.ts";
import { formatError } from "./format-error.ts";
import { validatePem } from "./validate-pem.ts";
import { getPidPath, getSocketPath } from "./paths.ts";

const verboseEnabled = process.argv.includes("--verbose");
const ROOT_HELP = `apptoken v0.1.0

Usage:
  apptoken <command> [options]

Commands:
  init                      Interactive setup wizard
  daemon start|stop|status  Manage daemon lifecycle
  gh <args...>              Run gh with injected token

Options:
  --verbose                 Show detailed error output
  -h, --help                Show this help message
  --version                 Show version
`;

function shouldShowRootHelp(argv: string[]): boolean {
  const args = argv.slice(2);
  if (args.length === 0) return true;
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    return true;
  }
  return false;
}

function readPemFromStdin() {
  return Effect.async<string, never>((resume) => {
    const stdin = process.stdin;
    const chunks: string[] = [];

    const cleanup = () => {
      stdin.off("data", onData);
      stdin.off("end", onEnd);
      stdin.off("error", onError);
    };

    const onData = (chunk: string) => {
      chunks.push(chunk);
    };

    const onEnd = () => {
      cleanup();
      resume(Effect.succeed(chunks.join("")));
    };

    const onError = () => {
      cleanup();
      resume(Effect.succeed(""));
    };

    stdin.setEncoding("utf8");
    stdin.on("data", onData);
    stdin.on("end", onEnd);
    stdin.on("error", onError);
    stdin.resume();
  });
}

function makeTokenServiceFromConfig(pem: string, config: AppConfig) {
  return makeTokenService({
    pem,
    appId: config.appId,
    installationId: config.installationId,
    generateJwt,
    requestInstallationToken: (jwt: string, installationId: string) =>
      Effect.tryPromise({
        try: async () => {
          const res = await fetch(
            `https://api.github.com/app/installations/${installationId}/access_tokens`,
            {
              method: "POST",
              headers: {
                authorization: `Bearer ${jwt}`,
                accept: "application/vnd.github+json",
              },
            }
          );
          const body = (await res.json()) as {
            token: string;
            expires_at: string;
          };
          return {
            token: body.token,
            expiresAt: new Date(body.expires_at),
          };
        },
        catch: (err) => err,
      }),
  });
}

function startDaemonProcess(password: string): void {
  const entry = process.argv[1];
  if (!entry) {
    throw new Error("Unable to determine CLI entry path");
  }

  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      APPTOKEN_DAEMON: "1",
      APPTOKEN_PASSWORD: password,
    },
    detached: true,
    stdio: "ignore",
  });

  child.unref();
}

function waitForDaemon(client: ReturnType<typeof makeSocketClient>) {
  return Effect.gen(function* () {
    let lastError: DaemonNotRunning | SocketError | undefined;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const result = yield* Effect.either(client.ping());
      if (result._tag === "Right") {
        return;
      }

      lastError = result.left;
      yield* Effect.sleep("200 millis");
    }

    if (lastError) {
      return yield* Effect.fail(lastError);
    }

    return yield* Effect.fail(new DaemonNotRunning());
  });
}

function runDaemon(password: string) {
  return Effect.gen(function* () {
    const configResult = yield* Effect.either(loadConfig());

    if (configResult._tag === "Left") {
      yield* Console.error(
        formatError(configResult.left, { verbose: verboseEnabled })
      );
      yield* Effect.sync(() => process.exit(1));
      return;
    }

    const config = configResult.right;

    const encryptedResult = yield* Effect.either(loadEncryptedPem());

    if (encryptedResult._tag === "Left") {
      yield* Console.error(
        formatError(encryptedResult.left, { verbose: verboseEnabled })
      );
      yield* Effect.sync(() => process.exit(1));
      return;
    }

    const decryptResult = yield* Effect.either(
      decryptPem(encryptedResult.right, password)
    );

    if (decryptResult._tag === "Left") {
      yield* Console.error(formatError(decryptResult.left));
      yield* Effect.sync(() => process.exit(1));
      return;
    }

    const pem = decryptResult.right;
    const tokenService = makeTokenServiceFromConfig(pem, config);

    const daemon = makeDaemonService({
      socketPath: getSocketPath(),
      pidPath: getPidPath(),
      tokenService,
    });

    const startResult = yield* Effect.either(daemon.start());

    if (startResult._tag === "Left") {
      yield* Console.error(
        formatError(startResult.left, { verbose: verboseEnabled })
      );
      yield* Effect.sync(() => process.exit(1));
      return;
    }

    yield* Console.log("Daemon started. Socket: " + getSocketPath());
    yield* Console.log("PID: " + process.pid);

    yield* Effect.async<never, never>(() => {
      const shutdown = () => {
        Effect.runPromise(daemon.stop()).then(() => process.exit(0));
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
  });
}

if (process.env["APPTOKEN_DAEMON"] === "1") {
  const password = process.env["APPTOKEN_PASSWORD"] ?? "";
  delete process.env["APPTOKEN_PASSWORD"];

  if (!password) {
    console.error("Missing daemon password. Restart daemon with a password.");
    process.exit(1);
  }

  runDaemon(password).pipe(Effect.provide(BunContext.layer), BunRuntime.runMain);
} else {
  if (shouldShowRootHelp(process.argv)) {
    console.log(ROOT_HELP);
    process.exit(0);
  }

// --- init command ---

const initCommand = Command.make("init", {}, () =>
  Effect.gen(function* () {
    const appId = yield* Prompt.text({
      message: "GitHub App ID:",
      validate: (value) =>
        value.trim().length === 0
          ? Effect.fail("App ID is required")
          : Effect.succeed(value.trim()),
    });

    const installationId = yield* Prompt.text({
      message: "Installation ID:",
      validate: (value) =>
        value.trim().length === 0
          ? Effect.fail("Installation ID is required")
          : Effect.succeed(value.trim()),
    });

    const password = yield* Prompt.password({
      message: "Encryption password:",
      validate: (value) =>
        value.length < 8
          ? Effect.fail("Password must be at least 8 characters")
          : Effect.succeed(value),
    });

    const confirmPassword = yield* Prompt.password({
      message: "Confirm password:",
    });

    if (Redacted.value(password) !== Redacted.value(confirmPassword)) {
      yield* Console.error("Passwords do not match.");
      return;
    }

    yield* Console.log("Paste PEM private key. Finish with Ctrl+D:");
    const pem = yield* readPemFromStdin();

    const validation = validatePem(pem);
    if (!validation.valid) {
      yield* Console.error(validation.error ?? "Invalid PEM file");
      return;
    }

    const encrypted = yield* encryptPem(pem, Redacted.value(password));

    // Save encrypted PEM and config
    const config: AppConfig = {
      appId,
      installationId,
      createdAt: new Date().toISOString(),
    };

    yield* saveEncryptedPem(encrypted);
    yield* saveConfig(config);

    yield* Console.log("Configuration saved to " + getConfigDir());
    yield* Console.log("Encrypted PEM stored at " + getPemPath());
  })
);

// --- daemon start command ---

const daemonStartCommand = Command.make("start", {}, () =>
  Effect.gen(function* () {
    const client = makeSocketClient(getSocketPath());
    const pingResult = yield* Effect.either(client.ping());

    if (pingResult._tag === "Right") {
      yield* Console.error("Daemon is already running.");
      return;
    }

    const configResult = yield* Effect.either(loadConfig());

    if (configResult._tag === "Left") {
      yield* Console.error(
        formatError(configResult.left, { verbose: verboseEnabled })
      );
      return;
    }

    const config = configResult.right;
    const encryptedResult = yield* Effect.either(loadEncryptedPem());

    if (encryptedResult._tag === "Left") {
      yield* Console.error(
        formatError(encryptedResult.left, { verbose: verboseEnabled })
      );
      return;
    }

    const password = yield* Prompt.password({
      message: "Password to decrypt PEM:",
    });

    const decryptResult = yield* Effect.either(
      decryptPem(encryptedResult.right, Redacted.value(password))
    );

    if (decryptResult._tag === "Left") {
      yield* Console.error(formatError(decryptResult.left));
      return;
    }

    startDaemonProcess(Redacted.value(password));

    const waitResult = yield* Effect.either(waitForDaemon(client));

    if (waitResult._tag === "Left") {
      yield* Console.error("Failed to start daemon.");
      return;
    }

    const pidPath = getPidPath();
    const pid = existsSync(pidPath) ? readFileSync(pidPath, "utf8").trim() : "";

    yield* Console.log("Daemon started. Socket: " + getSocketPath());
    if (pid) {
      yield* Console.log("PID: " + pid);
    }
  })
);

// --- daemon stop command ---

const daemonStopCommand = Command.make("stop", {}, () =>
  Effect.gen(function* () {
    const client = makeSocketClient(getSocketPath());
    const pingResult = yield* Effect.either(client.ping());

    if (pingResult._tag === "Left") {
      yield* Console.error("Daemon is not running.");
      return;
    }

    // Read PID from PID file and send SIGTERM
    const pidPath = getPidPath();
    if (existsSync(pidPath)) {
      const pidContent = readFileSync(pidPath, "utf8").trim();
      const pid = parseInt(pidContent, 10);
      if (!Number.isNaN(pid)) {
        try {
          process.kill(pid, "SIGTERM");
          yield* Console.log("Daemon stopped (PID: " + pid + ").");
        } catch {
          yield* Console.error("Failed to stop daemon process.");
        }
      }
    } else {
      yield* Console.error("PID file not found.");
    }
  })
);

// --- daemon status command ---

const daemonStatusCommand = Command.make("status", {}, () =>
  Effect.gen(function* () {
    const client = makeSocketClient(getSocketPath());
    const pingResult = yield* Effect.either(client.ping());

    if (pingResult._tag === "Left") {
      yield* Console.log("Daemon: stopped");
      return;
    }

    const pidPath = getPidPath();
    if (existsSync(pidPath)) {
      const pidContent = readFileSync(pidPath, "utf8").trim();
      yield* Console.log("Daemon: running (PID: " + pidContent + ")");
    } else {
      yield* Console.log("Daemon: running");
    }
  })
);

// --- daemon parent command ---

const daemonCommand = Command.make("daemon").pipe(
  Command.withSubcommands([
    daemonStartCommand,
    daemonStopCommand,
    daemonStatusCommand,
  ])
);

// --- gh command ---

const ghArgs = Args.text({ name: "args" }).pipe(Args.repeated);
const noDaemonStart = Options.boolean("no-daemon-start").pipe(
  Options.withDefault(false)
);

const ghCommand = Command.make(
  "gh",
  { args: ghArgs, noDaemonStart },
  ({ args, noDaemonStart }) =>
    Effect.gen(function* () {
      const socketPath = getSocketPath();
      const client = makeSocketClient(socketPath);

      // Try to get token
      let tokenResult = yield* Effect.either(client.requestToken());

      // Auto-start daemon if not running
      if (
        tokenResult._tag === "Left" &&
        tokenResult.left instanceof DaemonNotRunning &&
        !noDaemonStart
      ) {
        yield* Console.error("Daemon not running. Starting...");

        const configResult = yield* Effect.either(loadConfig());

        if (configResult._tag === "Left") {
          yield* Console.error(
            formatError(configResult.left, { verbose: verboseEnabled })
          );
          return;
        }

        const config = configResult.right;

        const encryptedResult = yield* Effect.either(loadEncryptedPem());

        if (encryptedResult._tag === "Left") {
          yield* Console.error(
            formatError(encryptedResult.left, { verbose: verboseEnabled })
          );
          return;
        }

        const password = yield* Prompt.password({
          message: "Password to decrypt PEM:",
        });

        const decryptResult = yield* Effect.either(
          decryptPem(encryptedResult.right, Redacted.value(password))
        );

        if (decryptResult._tag === "Left") {
          yield* Console.error(formatError(decryptResult.left));
          return;
        }

        startDaemonProcess(Redacted.value(password));

        const waitResult = yield* Effect.either(waitForDaemon(client));
        if (waitResult._tag === "Left") {
          yield* Console.error("Failed to start daemon.");
          return;
        }

        // Retry token request
        tokenResult = yield* Effect.either(client.requestToken());
      }

      if (tokenResult._tag === "Left") {
        yield* Console.error(
          formatError(tokenResult.left, { verbose: verboseEnabled })
        );
        return;
      }

      const { token } = tokenResult.right;

      // Run gh with token
      const result = yield* Effect.either(runGh(args, token));

      if (result._tag === "Left") {
        const error = result.left;
        if (error instanceof CommandNotFound) {
          yield* Console.error(
            "gh CLI not found. Install it from https://cli.github.com"
          );
        } else {
          if (error.stderr) {
            yield* Console.error(error.stderr.trimEnd());
          }
          yield* Effect.sync(() => {
            process.exitCode = error.exitCode;
          });
        }
        return;
      }

      if (result.right.stdout) {
        yield* Console.log(result.right.stdout.trimEnd());
      }
    })
);

// --- root command ---

const verbose = Options.boolean("verbose").pipe(
  Options.withDescription("Show detailed error output"),
  Options.withDefault(false),
);

const appCommand = Command.make("apptoken", { verbose }).pipe(
  Command.withSubcommands([initCommand, daemonCommand, ghCommand])
);

  const cli = Command.run(appCommand, {
    name: "apptoken",
    version: "v0.1.0",
  });

  cli(process.argv).pipe(Effect.provide(BunContext.layer), BunRuntime.runMain);
}
