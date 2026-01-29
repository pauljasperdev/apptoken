import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { HttpClient, HttpClientResponse } from "@effect/platform";
import { requestInstallationToken } from "../src/services/GitHubApiClient.ts";

function mockHttpClient(
  handler: (request: {
    method: string;
    url: string;
    headers: Record<string, string>;
  }) => {
    status: number;
    body: unknown;
  }
): Layer.Layer<HttpClient.HttpClient> {
  return Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, _url) => {
      const hdrs: Record<string, string> = {};
      for (const [k, v] of Object.entries(request.headers)) {
        hdrs[k] = v;
      }
      const result = handler({
        method: request.method,
        url: request.url,
        headers: hdrs,
      });
      const response = new Response(JSON.stringify(result.body), {
        status: result.status,
        headers: { "content-type": "application/json" },
      });
      return Effect.succeed(HttpClientResponse.fromWeb(request, response));
    })
  );
}

const MOCK_TOKEN = "ghs_xxxxxxxxxxxxxxxxxxxx";
const MOCK_EXPIRES = "2026-01-28T12:00:00Z";

describe("GitHubApiClient", () => {
  test("requests installation token with correct URL and auth header", async () => {
    let capturedRequest:
      | { method: string; url: string; headers: Record<string, string> }
      | undefined;

    const layer = mockHttpClient((req) => {
      capturedRequest = req;
      return {
        status: 201,
        body: {
          token: MOCK_TOKEN,
          expires_at: MOCK_EXPIRES,
          permissions: { contents: "read" },
        },
      };
    });

    await Effect.runPromise(
      requestInstallationToken("fake-jwt", "67890").pipe(Effect.provide(layer))
    );

    expect(capturedRequest).toBeDefined();
    expect(capturedRequest!.method).toBe("POST");
    expect(capturedRequest!.url).toBe(
      "https://api.github.com/app/installations/67890/access_tokens"
    );
    expect(capturedRequest!.headers["authorization"]).toBe("Bearer fake-jwt");
    expect(capturedRequest!.headers["accept"]).toBe(
      "application/vnd.github+json"
    );
  });

  test("returns InstallationToken on success", async () => {
    const layer = mockHttpClient(() => ({
      status: 201,
      body: {
        token: MOCK_TOKEN,
        expires_at: MOCK_EXPIRES,
        permissions: { contents: "read" },
      },
    }));

    const result = await Effect.runPromise(
      requestInstallationToken("fake-jwt", "67890").pipe(Effect.provide(layer))
    );

    expect(result.token).toBe(MOCK_TOKEN);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBe(new Date(MOCK_EXPIRES).getTime());
  });

  test("handles 401 Unauthorized with GitHubApiError", async () => {
    const layer = mockHttpClient(() => ({
      status: 401,
      body: { message: "Bad credentials" },
    }));

    const result = await Effect.runPromiseExit(
      requestInstallationToken("bad-jwt", "67890").pipe(Effect.provide(layer))
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      const causeStr = JSON.stringify(result.cause);
      expect(causeStr).toContain("GitHubApiError");
      expect(causeStr).toContain("401");
    }
  });

  test("handles 404 Not Found with GitHubApiError", async () => {
    const layer = mockHttpClient(() => ({
      status: 404,
      body: { message: "Not Found" },
    }));

    const result = await Effect.runPromiseExit(
      requestInstallationToken("fake-jwt", "99999").pipe(Effect.provide(layer))
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      const causeStr = JSON.stringify(result.cause);
      expect(causeStr).toContain("GitHubApiError");
      expect(causeStr).toContain("404");
    }
  });
});
