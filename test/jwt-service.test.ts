import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { generateJwt } from "../src/services/JwtService.ts";
import { decodeProtectedHeader, decodeJwt, importSPKI, jwtVerify } from "jose";
import { createPrivateKey, createPublicKey } from "crypto";

const TEST_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCQ4XfhEYhObgYJ
dPo6c8l/0+51LrGoJrF1I8uKdVj1JmezU7Kw7t7CTM0PObz9O2tEd+21EuqwUwjN
zoWDIUAa97gZsRdTYcWp8GKCGAfRINFNltqFyw9Op/SM2fku7mI+3TgXxR98I+RF
EjOG08FPqzv/CUm+lmHGOVNz+Mftx46GXnTrudmxcODWYK7xDyIjkLh/s7ABw192
W+B8RNXXOxHGuGIN3vyzG4zkKOvQkQWc9STcWVq37olDDM5MoZbzv95FGFvbf1L4
z+y6qkqt/B/Z9HdRANKB5pv9GCDkMR1B8Weiy9l99hpWomYrlKkPvGwgDhw05FjS
Er88eMApAgMBAAECggEAQIHjWnbv9dvPHE7VS0laomu+dLaBq5ju0nVJnzB4l06u
RY4ytczlqiV/+BOBLk9Sh33OfR0bGb8e4GPf1m7rmBZMBkRvWlTiKbQ6aCpC8L5n
8uAEFCZBfogRvtUeueKyI8NjwlGmnyNr88US5ClMnShk4j1EdHOIvTWxDqXqftf7
/vVoQfDOBsWTNXnh3pB2kV7jXlbd6GwyPiyRMSONZUa4jgiZSoSWhAjTtMBnZrhy
tZM71hRAwMYzdiQB6LxcCVmuC2x0p9hZN/ap9/vsUWxMi559OmeC6bWhYmyG3L9M
OewWJ4t5odsrWiL28EQ2bGkAvbTuZz5ACKbuSvE6sQKBgQDC23QHiC+N4D2F9STq
LU++k5SpRlnSN/4WcAtfI1/xyN4G+FUQ1zlEXyZj0PB+Ej/jkPcdQFTudSh3yzUl
WiS+0yX6QnE9KtYVn6No/rbvozggfT38AKlxI51l5ud/w9Npup8XoURyi0N+sGjg
2W4YiR7NlEFp2Zd/B1bRohxbXwKBgQC+V30M/tC6Jt1uXU+jAG/t84eCvOSws1P7
se1o1nLaXQE5XgvxWTJul9UWkUWWSHFD5LTrayrt/SjIDTNtLZlDLf3N7W9bbr+e
jUmN40XSB20pTGc8PqXw4tNg5iqnAsOZ+HUEs10R+jNRGfCE1hsiyTnyScaf7nj3
6TQYHmIZdwKBgQDCfE8/BUqRjPNbNOb3ZOpnCN4kZjdYftJ4irSO7Lvik94njs04
1dguydmDXxPqgUSLWjGLXJ5osz8E8inFckeivxT0yERGDO9I/eEX9sOYQ4zNwLOR
RwfYCPgcsW72MvpcWQxZhXjP6vgfBuxnIB2nF5VLE2KGx8tR2n1pFyi+eQKBgQCo
LcFOJC/k6sYn58afrZk4VD7do20lO63u7E1qnmCo1BhqydAflcJbuUgMQpuLp8J8
TK4WfIBX+6F28UMJKosKsq5Yr3v++6HPw+LDvZZJd0pafSmSL4CLkL9YFMaG/og5
mTA70QdhBQMmm5bKqCsd11Kd49XeJeU4lxLyZJYlDQKBgHjPmL/uNjgwjfnP+vNF
UxGIwGcoWOq+NM42+lPoUiNbKXId23UXRoFH6jOfqnkHml+LXUSBAB/agUSrYoif
cQF2ta5FaLWp1tlJNrRTDydQyK/Qfs2/5fY63YOGL/zJRdqWYDK8pEqZYLhNrO2O
x/qOZLQAmGAd9PzyGLFE0/NQ
-----END PRIVATE KEY-----`;

const APP_ID = "12345";

describe("JwtService", () => {
  test("generates a JWT with correct RS256 header", async () => {
    const jwt = await Effect.runPromise(generateJwt(TEST_PEM, APP_ID));

    const header = decodeProtectedHeader(jwt);
    expect(header.alg).toBe("RS256");
    expect(header.typ).toBe("JWT");
  });

  test("JWT has correct claims (iss, iat, exp)", async () => {
    const now = Math.floor(Date.now() / 1000);
    const jwt = await Effect.runPromise(generateJwt(TEST_PEM, APP_ID));

    const claims = decodeJwt(jwt);
    expect(claims.iss).toBe(APP_ID);

    // iat should be ~60 seconds in the past (clock drift protection)
    expect(claims.iat).toBeDefined();
    expect(claims.iat!).toBeLessThanOrEqual(now);
    expect(claims.iat!).toBeGreaterThanOrEqual(now - 120);

    // exp should be ~10 minutes in the future
    expect(claims.exp).toBeDefined();
    expect(claims.exp!).toBeGreaterThan(now);
    expect(claims.exp!).toBeLessThanOrEqual(now + 600 + 60);
  });

  test("JWT signature is valid RS256", async () => {
    const jwt = await Effect.runPromise(generateJwt(TEST_PEM, APP_ID));

    // Derive the public key from the private PEM
    const publicPem = createPublicKey(TEST_PEM).export({ type: "spki", format: "pem" }) as string;
    const publicKey = await importSPKI(publicPem, "RS256");

    const { payload } = await jwtVerify(jwt, publicKey, { algorithms: ["RS256"] });

    expect(payload.iss).toBe(APP_ID);
  });

  test("accepts PKCS1 RSA private keys", async () => {
    const pkcs1Pem = createPrivateKey(TEST_PEM).export({
      type: "pkcs1",
      format: "pem",
    }) as string;

    const jwt = await Effect.runPromise(generateJwt(pkcs1Pem, APP_ID));
    const header = decodeProtectedHeader(jwt);

    expect(header.alg).toBe("RS256");
  });

  test("invalid PEM produces JwtGenerationError", async () => {
    const result = await Effect.runPromiseExit(
      generateJwt("not-a-valid-pem", APP_ID)
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(JSON.stringify(result.cause)).toContain("JwtGenerationError");
    }
  });
});
