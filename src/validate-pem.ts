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

  if (!hasPrivateKey) {
    return { valid: false, error: "Expected a private key PEM" };
  }

  return { valid: true };
}
