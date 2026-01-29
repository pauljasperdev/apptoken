import { describe, expect, test } from "bun:test";
import { Readable } from "stream";
import { Effect } from "effect";
import { readPemFromStream } from "../src/pem-input.ts";


describe("CLI", () => {
  test("--help shows command structure with subcommands", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "--help"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const code = await proc.exited;

    expect(code).toBe(0);
    expect(stdout).toContain("apptoken");
    expect(stdout).toContain("init");
    expect(stdout).toContain("daemon");
    expect(stdout).toContain("gh");
  });

  test("--version prints version", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "--version"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const code = await proc.exited;

    expect(code).toBe(0);
    expect(stdout.trim()).toContain("0.1.0");
  });

  test("daemon status shows stopped when daemon is not running", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/cli.ts", "daemon", "status"],
      {
        cwd: import.meta.dir + "/..",
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    const stdout = await new Response(proc.stdout).text();
    const code = await proc.exited;

    expect(code).toBe(0);
    expect(stdout.trim()).toContain("stopped");
  });

  test("daemon --help shows start/stop/status subcommands", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/cli.ts", "daemon", "--help"],
      {
        cwd: import.meta.dir + "/..",
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    const stdout = await new Response(proc.stdout).text();
    const code = await proc.exited;

    expect(code).toBe(0);
    expect(stdout).toContain("start");
    expect(stdout).toContain("stop");
    expect(stdout).toContain("status");
  });

  test("readPemFromStream collects until end marker", async () => {
    const chunks = [
      "-----BEGIN PRIVATE KEY-----\nMIIB\n-----END ",
      "PRIVATE KEY-----\n",
    ];
    const stream = Readable.from(chunks);
    const pem = await Effect.runPromise(readPemFromStream(stream));
    expect(pem).toContain("-----END PRIVATE KEY-----");
  });

  test("readPemFromStream returns data on end without marker", async () => {
    const chunks = ["-----BEGIN PRIVATE KEY-----\nMIIB\n"];
    const stream = Readable.from(chunks);
    const pem = await Effect.runPromise(readPemFromStream(stream));
    expect(pem).toContain("-----BEGIN PRIVATE KEY-----");
    expect(pem).not.toContain("-----END PRIVATE KEY-----");
  });
});
