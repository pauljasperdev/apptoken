import { createPrivateKey } from "crypto";
import { Effect } from "effect";
import { importPKCS8, SignJWT } from "jose";
import { JwtGenerationError } from "../errors.ts";

const RSA_PRIVATE_KEY_HEADER = "-----BEGIN RSA PRIVATE KEY-----";

const normalizePrivateKeyPem = (pem: string): string => {
  if (!pem.includes(RSA_PRIVATE_KEY_HEADER)) {
    return pem;
  }

  try {
    const key = createPrivateKey(pem);
    const exported = key.export({ type: "pkcs8", format: "pem" }) as
      | string
      | Buffer;
    return typeof exported === "string" ? exported : exported.toString("utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      "Failed to convert RSA private key to PKCS8. Ensure the key is an unencrypted RSA private key. " +
        message,
    );
  }
};

export const generateJwt = (
  pem: string,
  appId: string
): Effect.Effect<string, JwtGenerationError> =>
  Effect.tryPromise({
    try: async () => {
      const normalizedPem = normalizePrivateKeyPem(pem);
      const privateKey = await importPKCS8(normalizedPem, "RS256");
      const now = Math.floor(Date.now() / 1000);

      return new SignJWT({})
        .setProtectedHeader({ alg: "RS256", typ: "JWT" })
        .setIssuer(appId)
        .setIssuedAt(now - 60)
        .setExpirationTime(now + 600)
        .sign(privateKey);
    },
    catch: (error) =>
      new JwtGenerationError({
        message: error instanceof Error ? error.message : String(error),
      }),
  });
