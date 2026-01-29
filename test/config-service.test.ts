import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  encryptPem,
  decryptPem,
  saveConfig,
  loadConfig,
  saveEncryptedPem,
  loadEncryptedPem,
  type AppConfig,
} from "../src/services/ConfigService.ts";

import { randomUUID } from "crypto";
import { rmSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TEST_PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy0AHB7MhgHcTz6sE2I2yPB
aFDrBz9vFqU5yTfEMOiME7KPaFMGid/FWWvXEddRGO1FBSPP0V6VD0sx8jSJ+0i3
pQGSEjOxCG/XDm9ISEBF2FHQL0o4v7FEzzLp+4de4VxrEgS8ADMI6IhUR2u6RAHA
qFVgckjJbUIkllPb7QFrnGMkbN6MmgBNiVwOxGDESaFy7kJGF1kFQG5JmFJH3OAZF
aFDJdVNRZ4Z3qGd6fZqBzqKAHaKNQIGDGFhzDATx0K8oI+7R2TF/Z5K4gXDaqMXa
GFV6EBdDUMFRbLthxbJwQdABQwIDAQABAoIBAGZ5CnB5sS3JjYGY3M5P5e5G7TYI
F8L5F3kpHGye7GDlk1HkJV4rC8PqMJhP1UEAGJ9UrFvL9eDWAtX3GPSJ6HlCT9CS
-----END RSA PRIVATE KEY-----`;

function makeTempDir(): string {
  const dir = join(tmpdir(), `apptoken-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("PEM encryption", () => {
  test("encrypt then decrypt returns original PEM", async () => {
    const password = "test-password-123";

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const encrypted = yield* encryptPem(TEST_PEM, password);
        expect(encrypted).not.toBe(TEST_PEM);
        const decrypted = yield* decryptPem(encrypted, password);
        return decrypted;
      })
    );

    expect(result).toBe(TEST_PEM);
  });

  test("decrypt with wrong password fails with InvalidPassword", async () => {
    const result = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const encrypted = yield* encryptPem(TEST_PEM, "correct-password");
        return yield* decryptPem(encrypted, "wrong-password");
      })
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      const error = result.cause;
      // The cause should contain an InvalidPassword error
      expect(JSON.stringify(error)).toContain("InvalidPassword");
    }
  });

  test("each encryption produces different ciphertext (random salt/iv)", async () => {
    const password = "test-password";

    const [enc1, enc2] = await Effect.runPromise(
      Effect.all([
        encryptPem(TEST_PEM, password),
        encryptPem(TEST_PEM, password),
      ])
    );

    expect(enc1).not.toBe(enc2);
  });
});

describe("Config persistence", () => {
  test("save then load config returns same data", async () => {
    const tempDir = makeTempDir();
    try {
      const config: AppConfig = {
        appId: "12345",
        installationId: "67890",
        createdAt: new Date().toISOString(),
      };

      const loaded = await Effect.runPromise(
        Effect.gen(function* () {
          yield* saveConfig(config, tempDir);
          return yield* loadConfig(tempDir);
        })
      );

      expect(loaded.appId).toBe(config.appId);
      expect(loaded.installationId).toBe(config.installationId);
      expect(loaded.createdAt).toBe(config.createdAt);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("load non-existent config returns ConfigNotFound", async () => {
    const tempDir = makeTempDir();
    try {
      const result = await Effect.runPromiseExit(loadConfig(tempDir));

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(JSON.stringify(result.cause)).toContain("ConfigNotFound");
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("save then load encrypted PEM returns original content", async () => {
    const tempDir = makeTempDir();
    try {
      const encrypted = "encrypted-pem-blob";
      const loaded = await Effect.runPromise(
        Effect.gen(function* () {
          yield* saveEncryptedPem(encrypted, tempDir);
          return yield* loadEncryptedPem(tempDir);
        })
      );

      expect(loaded).toBe(encrypted);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("load missing PEM returns PemNotFound", async () => {
    const tempDir = makeTempDir();
    try {
      const result = await Effect.runPromiseExit(
        loadEncryptedPem(tempDir)
      );

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(JSON.stringify(result.cause)).toContain("PemNotFound");
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
