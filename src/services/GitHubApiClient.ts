import { Effect } from "effect";
import { HttpClient, HttpClientRequest } from "@effect/platform";
import { GitHubApiError } from "../errors.ts";

export interface InstallationToken {
  readonly token: string;
  readonly expiresAt: Date;
}

export const requestInstallationToken = (
  jwt: string,
  installationId: string
): Effect.Effect<InstallationToken, GitHubApiError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;

    const request = HttpClientRequest.post(
      `https://api.github.com/app/installations/${installationId}/access_tokens`
    ).pipe(
      HttpClientRequest.setHeader("authorization", `Bearer ${jwt}`),
      HttpClientRequest.setHeader("accept", "application/vnd.github+json")
    );

    const response = yield* client.execute(request).pipe(
      Effect.catchAll(() =>
        Effect.fail(
          new GitHubApiError({ status: 0, message: "Request failed" })
        )
      )
    );

    if (response.status < 200 || response.status >= 300) {
      const body = yield* Effect.catchAll(response.json, () =>
        Effect.succeed({ message: "Unknown error" } as Record<string, unknown>)
      );
      const message =
        typeof body === "object" && body !== null && "message" in body
          ? String((body as Record<string, unknown>).message)
          : `HTTP ${response.status}`;

      return yield* new GitHubApiError({ status: response.status, message });
    }

    const body = yield* Effect.catchAll(response.json, () =>
      Effect.fail(
        new GitHubApiError({
          status: response.status,
          message: "Failed to parse response body",
        })
      )
    );

    const parsed = body as { token: string; expires_at: string };

    return {
      token: parsed.token,
      expiresAt: new Date(parsed.expires_at),
    } satisfies InstallationToken;
  });
