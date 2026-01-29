import { Effect } from "effect";

export interface InstallationToken {
  readonly token: string;
  readonly expiresAt: Date;
}

const CACHE_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

export interface TokenServiceDeps<E1, E2> {
  readonly pem: string;
  readonly appId: string;
  readonly installationId: string;
  readonly generateJwt: (
    pem: string,
    appId: string
  ) => Effect.Effect<string, E1>;
  readonly requestInstallationToken: (
    jwt: string,
    installationId: string
  ) => Effect.Effect<InstallationToken, E2>;
}

export interface TokenService<E1, E2> {
  readonly getInstallationToken: () => Effect.Effect<
    InstallationToken,
    E1 | E2
  >;
}

export function makeTokenService<E1, E2>(
  deps: TokenServiceDeps<E1, E2>
): TokenService<E1, E2> {
  let cached: InstallationToken | undefined;

  const isCacheValid = (): boolean => {
    if (cached === undefined) return false;
    return cached.expiresAt.getTime() - Date.now() > CACHE_BUFFER_MS;
  };

  return {
    getInstallationToken: () =>
      Effect.gen(function* () {
        if (isCacheValid()) {
          return cached!;
        }

        const jwt = yield* deps.generateJwt(deps.pem, deps.appId);
        const token = yield* deps.requestInstallationToken(
          jwt,
          deps.installationId
        );

        cached = token;
        return token;
      }),
  };
}
