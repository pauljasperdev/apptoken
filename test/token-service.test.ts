import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { makeTokenService } from "../src/services/TokenService.ts";

const MOCK_PEM = "test-pem-content";
const MOCK_APP_ID = "12345";
const MOCK_INSTALLATION_ID = "67890";
const MOCK_JWT = "eyJhbGciOiJSUzI1NiJ9.mock.jwt";
const MOCK_TOKEN = "ghs_xxxxxxxxxxxxxxxxxxxx";
const MOCK_EXPIRES = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

function makeMockDeps(overrides?: {
  generateJwt?: (
    pem: string,
    appId: string
  ) => Effect.Effect<string, Error>;
  requestInstallationToken?: (
    jwt: string,
    installationId: string
  ) => Effect.Effect<{ token: string; expiresAt: Date }, Error>;
}) {
  const calls = {
    generateJwt: [] as Array<{ pem: string; appId: string }>,
    requestInstallationToken: [] as Array<{
      jwt: string;
      installationId: string;
    }>,
  };

  const generateJwt =
    overrides?.generateJwt ??
    ((pem: string, appId: string) => {
      calls.generateJwt.push({ pem, appId });
      return Effect.succeed(MOCK_JWT);
    });

  const requestInstallationToken =
    overrides?.requestInstallationToken ??
    ((jwt: string, installationId: string) => {
      calls.requestInstallationToken.push({ jwt, installationId });
      return Effect.succeed({ token: MOCK_TOKEN, expiresAt: MOCK_EXPIRES });
    });

  return { generateJwt, requestInstallationToken, calls };
}

describe("TokenService", () => {
  test("calls generateJwt then requestInstallationToken in sequence", async () => {
    const deps = makeMockDeps();

    const service = makeTokenService({
      pem: MOCK_PEM,
      appId: MOCK_APP_ID,
      installationId: MOCK_INSTALLATION_ID,
      generateJwt: deps.generateJwt,
      requestInstallationToken: deps.requestInstallationToken,
    });

    await Effect.runPromise(service.getInstallationToken());

    expect(deps.calls.generateJwt).toHaveLength(1);
    expect(deps.calls.generateJwt[0]!.pem).toBe(MOCK_PEM);
    expect(deps.calls.generateJwt[0]!.appId).toBe(MOCK_APP_ID);

    expect(deps.calls.requestInstallationToken).toHaveLength(1);
    expect(deps.calls.requestInstallationToken[0]!.jwt).toBe(MOCK_JWT);
    expect(deps.calls.requestInstallationToken[0]!.installationId).toBe(
      MOCK_INSTALLATION_ID
    );
  });

  test("returns expected installation token", async () => {
    const deps = makeMockDeps();

    const service = makeTokenService({
      pem: MOCK_PEM,
      appId: MOCK_APP_ID,
      installationId: MOCK_INSTALLATION_ID,
      generateJwt: deps.generateJwt,
      requestInstallationToken: deps.requestInstallationToken,
    });

    const result = await Effect.runPromise(service.getInstallationToken());

    expect(result.token).toBe(MOCK_TOKEN);
    expect(result.expiresAt).toEqual(MOCK_EXPIRES);
  });

  test("caches token and returns cached value if not expired", async () => {
    const deps = makeMockDeps();

    const service = makeTokenService({
      pem: MOCK_PEM,
      appId: MOCK_APP_ID,
      installationId: MOCK_INSTALLATION_ID,
      generateJwt: deps.generateJwt,
      requestInstallationToken: deps.requestInstallationToken,
    });

    const first = await Effect.runPromise(service.getInstallationToken());
    const second = await Effect.runPromise(service.getInstallationToken());

    // Should only have called the API once due to caching
    expect(deps.calls.generateJwt).toHaveLength(1);
    expect(deps.calls.requestInstallationToken).toHaveLength(1);
    expect(second.token).toBe(first.token);
  });

  test("fetches fresh token when cached token is near expiry", async () => {
    let callCount = 0;
    const deps = makeMockDeps({
      requestInstallationToken: (_jwt, _installationId) => {
        callCount++;
        return Effect.succeed({
          token: `ghs_token_${callCount}`,
          // Token expires in 4 minutes (under 5 min buffer)
          expiresAt: new Date(Date.now() + 4 * 60 * 1000),
        });
      },
    });

    const service = makeTokenService({
      pem: MOCK_PEM,
      appId: MOCK_APP_ID,
      installationId: MOCK_INSTALLATION_ID,
      generateJwt: deps.generateJwt,
      requestInstallationToken: deps.requestInstallationToken,
    });

    await Effect.runPromise(service.getInstallationToken());
    const second = await Effect.runPromise(service.getInstallationToken());

    // Should have made 2 API calls because first token was near expiry
    expect(callCount).toBe(2);
    expect(second.token).toBe("ghs_token_2");
  });

  test("propagates JwtGenerationError", async () => {
    const deps = makeMockDeps({
      generateJwt: () =>
        Effect.fail(new Error("JWT generation failed")),
    });

    const service = makeTokenService({
      pem: MOCK_PEM,
      appId: MOCK_APP_ID,
      installationId: MOCK_INSTALLATION_ID,
      generateJwt: deps.generateJwt,
      requestInstallationToken: deps.requestInstallationToken,
    });

    const result = await Effect.runPromiseExit(service.getInstallationToken());

    expect(result._tag).toBe("Failure");
  });

  test("propagates GitHubApiError", async () => {
    const deps = makeMockDeps({
      requestInstallationToken: () =>
        Effect.fail(new Error("API call failed")),
    });

    const service = makeTokenService({
      pem: MOCK_PEM,
      appId: MOCK_APP_ID,
      installationId: MOCK_INSTALLATION_ID,
      generateJwt: deps.generateJwt,
      requestInstallationToken: deps.requestInstallationToken,
    });

    const result = await Effect.runPromiseExit(service.getInstallationToken());

    expect(result._tag).toBe("Failure");
  });
});
