import { Effect } from "effect";
import {
  ConfigNotFound,
  ConfigParseError,
  InvalidPassword,
  PemNotFound,
} from "../errors.ts";
import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from "crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface AppConfig {
  readonly appId: string;
  readonly installationId: string;
  readonly pemPath: string;
  readonly createdAt: string;
}

const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const PEM_FILENAME = "pem.enc";

function deriveKey(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
}

export const encryptPem = (
  pem: string,
  password: string
): Effect.Effect<string, never> =>
  Effect.sync(() => {
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const key = deriveKey(password, salt);

    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update(pem, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const combined = Buffer.concat([salt, iv, authTag, encrypted]);
    return combined.toString("base64");
  });

export const decryptPem = (
  encrypted: string,
  password: string
): Effect.Effect<string, InvalidPassword> =>
  Effect.try({
    try: () => {
      const data = Buffer.from(encrypted, "base64");

      const salt = data.subarray(0, SALT_LENGTH);
      const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
      const authTag = data.subarray(
        SALT_LENGTH + IV_LENGTH,
        SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
      );
      const ciphertext = data.subarray(
        SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
      );

      const key = deriveKey(password, salt);

      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return decrypted.toString("utf8");
    },
    catch: () => new InvalidPassword(),
  });

export function getConfigDir(): string {
  const xdg = process.env["XDG_CONFIG_HOME"];
  const base = xdg ?? join(homedir(), ".config");
  return join(base, "apptoken");
}

export function getPemPath(configDir?: string): string {
  const dir = configDir ?? getConfigDir();
  return join(dir, PEM_FILENAME);
}

export const saveConfig = (
  config: AppConfig,
  configDir?: string
): Effect.Effect<void, never> =>
  Effect.sync(() => {
    const dir = configDir ?? getConfigDir();
    mkdirSync(dir, { recursive: true });
    const configPath = join(dir, "config.json");
    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  });

export const saveEncryptedPem = (
  encryptedPem: string,
  configDir?: string
): Effect.Effect<void, never> =>
  Effect.sync(() => {
    const dir = configDir ?? getConfigDir();
    mkdirSync(dir, { recursive: true });
    const pemPath = getPemPath(dir);
    writeFileSync(pemPath, encryptedPem, "utf8");
  });

export const loadConfig = (
  configDir?: string
): Effect.Effect<AppConfig, ConfigNotFound | ConfigParseError> =>
  Effect.gen(function* () {
    const dir = configDir ?? getConfigDir();
    const configPath = join(dir, "config.json");

    if (!existsSync(configPath)) {
      return yield* new ConfigNotFound({ path: configPath });
    }

    const content = readFileSync(configPath, "utf8");

    try {
      return JSON.parse(content) as AppConfig;
    } catch {
      return yield* new ConfigParseError({
        message: `Failed to parse config at ${configPath}`,
      });
    }
  });

export const loadEncryptedPem = (
  pemPath?: string
): Effect.Effect<string, PemNotFound> =>
  Effect.gen(function* () {
    const resolvedPath = pemPath ?? getPemPath();
    if (!existsSync(resolvedPath)) {
      return yield* Effect.fail(new PemNotFound({ path: resolvedPath }));
    }
    try {
      return readFileSync(resolvedPath, "utf8");
    } catch {
      return yield* Effect.fail(new PemNotFound({ path: resolvedPath }));
    }
  });
