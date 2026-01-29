import { Effect } from "effect";
import { importPKCS8, SignJWT } from "jose";
import { JwtGenerationError } from "../errors.ts";

export const generateJwt = (
  pem: string,
  appId: string
): Effect.Effect<string, JwtGenerationError> =>
  Effect.tryPromise({
    try: async () => {
      const privateKey = await importPKCS8(pem, "RS256");
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
