export interface ValidateResult {
  valid: boolean;
  error?: string;
}

export function validatePem(pem: string): ValidateResult {
  if (!pem || pem.trim().length === 0) {
    return { valid: false, error: "PEM content is empty" };
  }

  const hasPrivateKey =
    pem.includes("-----BEGIN PRIVATE KEY-----") ||
    pem.includes("-----BEGIN RSA PRIVATE KEY-----");

  const hasEndMarker =
    pem.includes("-----END PRIVATE KEY-----") ||
    pem.includes("-----END RSA PRIVATE KEY-----");

  if (!hasPrivateKey) {
    return {
      valid: false,
      error: "Expected a private key PEM (PKCS8 or RSA)",
    };
  }

  if (!hasEndMarker) {
    return { valid: false, error: "PEM content is incomplete" };
  }

  return { valid: true };
}
