import {
  ConfigNotFound,
  PemNotFound,
  InvalidPassword,
  DaemonNotRunning,
  DaemonAlreadyRunning,
  GitHubApiError,
  JwtGenerationError,
  SocketError,
  DaemonError,
} from "./errors.ts";
import { CommandNotFound } from "./services/CommandExecutor.ts";

interface FormatErrorOptions {
  verbose?: boolean;
}

export function formatError(error: unknown, options?: FormatErrorOptions): string {
  const verbose = options?.verbose ?? false;

  if (error instanceof ConfigNotFound) {
    let msg = "Configuration not found. Run 'apptoken init' to set up.";
    if (verbose) {
      msg += `\nPath: ${error.path}`;
    }
    return msg;
  }

  if (error instanceof PemNotFound) {
    let msg = "Encrypted PEM not found. Run 'apptoken init' to set up.";
    if (verbose) {
      msg += `\nPath: ${error.path}`;
    }
    return msg;
  }

  if (error instanceof InvalidPassword) {
    return "Incorrect password. Please try again.";
  }

  if (error instanceof DaemonNotRunning) {
    return "Daemon is not running. Start it with 'apptoken daemon start'.";
  }

  if (error instanceof DaemonAlreadyRunning) {
    return "Daemon is already running.";
  }

  if (error instanceof GitHubApiError) {
    if (error.status === 401) {
      let msg = "Authentication failed. Check your App ID and private key.";
      if (verbose) {
        msg += `\nStatus: ${error.status}\nMessage: ${error.message}`;
      }
      return msg;
    }
    if (error.status === 404) {
      return "Resource not found. Check installation ID and permissions.";
    }
    return `GitHub API error (${error.status}): ${error.message}`;
  }

  if (error instanceof CommandNotFound) {
    return `gh CLI not found. Install it from https://cli.github.com`;
  }

  if (error instanceof JwtGenerationError) {
    return `JWT generation failed: ${error.message}`;
  }

  if (error instanceof SocketError) {
    return `Socket error: ${error.message}`;
  }

  if (error instanceof DaemonError) {
    return `Daemon error: ${error.message}`;
  }

  return `Unknown error: ${String(error)}`;
}
