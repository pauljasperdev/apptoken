import { describe, expect, test } from "bun:test";
import {
  ConfigNotFound,
  PemNotFound,
  InvalidPassword,
  JwtGenerationError,
  GitHubApiError,
  DaemonNotRunning,
  DaemonAlreadyRunning,
  DaemonError,
  SocketError,
} from "../src/errors.ts";
import { CommandNotFound } from "../src/services/CommandExecutor.ts";
import { formatError } from "../src/format-error.ts";
import { validatePem } from "../src/validate-pem.ts";

describe("formatError", () => {
  test("ConfigNotFound suggests running init", () => {
    const error = new ConfigNotFound({ path: "/some/path" });
    const message = formatError(error);
    expect(message).toContain("apptoken init");
  });

  test("InvalidPassword suggests trying again", () => {
    const error = new InvalidPassword();
    const message = formatError(error);
    expect(message).toContain("Incorrect password");
  });

  test("PemNotFound suggests running init", () => {
    const error = new PemNotFound({ path: "/some/path/pem.enc" });
    const message = formatError(error);
    expect(message).toContain("apptoken init");
  });

  test("DaemonNotRunning suggests starting daemon", () => {
    const error = new DaemonNotRunning();
    const message = formatError(error);
    expect(message).toContain("not running");
  });

  test("DaemonAlreadyRunning informs user", () => {
    const error = new DaemonAlreadyRunning();
    const message = formatError(error);
    expect(message).toContain("already running");
  });

  test("GitHubApiError 401 suggests checking credentials", () => {
    const error = new GitHubApiError({ status: 401, message: "Unauthorized" });
    const message = formatError(error);
    expect(message).toContain("Authentication failed");
    expect(message).toContain("App ID");
  });

  test("GitHubApiError 404 shows not found message", () => {
    const error = new GitHubApiError({ status: 404, message: "Not Found" });
    const message = formatError(error);
    expect(message).toContain("not found");
  });

  test("GitHubApiError other status includes status code", () => {
    const error = new GitHubApiError({ status: 500, message: "Internal Server Error" });
    const message = formatError(error);
    expect(message).toContain("500");
  });

  test("CommandNotFound suggests installing gh", () => {
    const error = new CommandNotFound({ command: "gh" });
    const message = formatError(error);
    expect(message).toContain("gh CLI not found");
    expect(message).toContain("https://cli.github.com");
  });

  test("JwtGenerationError shows generation failure", () => {
    const error = new JwtGenerationError({ message: "bad key" });
    const message = formatError(error);
    expect(message).toContain("JWT");
  });

  test("SocketError includes original message", () => {
    const error = new SocketError({ message: "connection reset" });
    const message = formatError(error);
    expect(message).toContain("connection reset");
  });

  test("DaemonError includes original message", () => {
    const error = new DaemonError({ message: "startup failed" });
    const message = formatError(error);
    expect(message).toContain("startup failed");
  });

  test("verbose mode includes extra detail for GitHubApiError", () => {
    const error = new GitHubApiError({ status: 401, message: "Bad credentials" });
    const message = formatError(error, { verbose: true });
    expect(message).toContain("401");
    expect(message).toContain("Bad credentials");
  });

  test("verbose mode includes extra detail for ConfigNotFound", () => {
    const error = new ConfigNotFound({ path: "/home/user/.config/apptoken/config.json" });
    const message = formatError(error, { verbose: true });
    expect(message).toContain("/home/user/.config/apptoken/config.json");
  });

  test("verbose mode includes extra detail for PemNotFound", () => {
    const error = new PemNotFound({ path: "/home/user/.config/apptoken/pem.enc" });
    const message = formatError(error, { verbose: true });
    expect(message).toContain("/home/user/.config/apptoken/pem.enc");
  });
});

describe("validatePem", () => {
  test("accepts valid PKCS8 PEM", () => {
    const pem = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDZ6a7yJJAq
-----END PRIVATE KEY-----`;
    const result = validatePem(pem);
    expect(result.valid).toBe(true);
  });

  test("accepts valid RSA PEM", () => {
    const pem = `-----BEGIN RSA PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDZ6a7yJJAq
-----END RSA PRIVATE KEY-----`;
    const result = validatePem(pem);
    expect(result.valid).toBe(true);
  });

  test("rejects empty string", () => {
    const result = validatePem("");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("rejects non-PEM content", () => {
    const result = validatePem("this is not a PEM file");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("private key");
  });

  test("rejects public key PEM", () => {
    const pem = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA
-----END PUBLIC KEY-----`;
    const result = validatePem(pem);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("private key");
  });

  test("rejects certificate PEM", () => {
    const pem = `-----BEGIN CERTIFICATE-----
MIICEjCCAXsCAg36MA0GCSqGSIb3DQEBBQUAMIGbMQswCQ==
-----END CERTIFICATE-----`;
    const result = validatePem(pem);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("private key");
  });
});

describe("CLI --verbose flag", () => {
  test("--help shows --verbose option", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "--help"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    expect(stdout).toContain("--verbose");
  });
});
