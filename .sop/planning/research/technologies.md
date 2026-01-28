# Technology Research

## JWT Libraries for TypeScript/Node.js

### Option 1: jose (Recommended)

**Source:** [jose on npm](https://www.npmjs.com/package/jose), [GitHub](https://github.com/panva/jose)

**Pros:**
- Zero dependencies
- Tree-shakeable ESM exports
- Works across all runtimes (Node.js, Bun, Deno, browsers)
- Active maintenance
- Full JWA, JWS, JWE, JWT, JWK, JWKS support

**Example Usage:**
```typescript
import * as jose from 'jose'

const privateKey = await jose.importPKCS8(pemKey, 'RS256')

const jwt = await new jose.SignJWT({})
  .setProtectedHeader({ alg: 'RS256' })
  .setIssuedAt(Math.floor(Date.now() / 1000) - 60) // 60 seconds ago
  .setExpirationTime('10m')
  .setIssuer(appClientId)
  .sign(privateKey)
```

### Option 2: jsonwebtoken

**Source:** [jsonwebtoken on npm](https://www.npmjs.com/package/jsonwebtoken), [GitHub](https://github.com/auth0/node-jsonwebtoken)

**Pros:**
- Most popular JWT library (Auth0 maintained)
- Simple API
- Well-documented

**Example Usage:**
```typescript
import jwt from 'jsonwebtoken'
import fs from 'fs'

const privateKey = fs.readFileSync('private.pem')
const token = jwt.sign({ foo: 'bar' }, privateKey, {
  algorithm: 'RS256',
  expiresIn: '10m',
  issuer: appClientId
})
```

**Recommendation:** Use `jose` for better Effect-TS integration (Promise-based, tree-shakeable).

---

## Secure Credential Storage

### Option 1: node-keytar

**Source:** [GitHub](https://github.com/atom/node-keytar)

**Description:** Native Node module for OS keychain access.

| Platform | Backend |
|----------|---------|
| macOS | Keychain |
| Linux | Secret Service API (libsecret) |
| Windows | Credential Vault |

**Pros:**
- Uses OS-native secure storage
- No encryption key management needed
- Industry standard approach

**Cons:**
- Native dependency (requires compilation)
- Linux requires `libsecret-1-dev`

**Example:**
```typescript
import keytar from 'keytar'

await keytar.setPassword('apptoken', 'pem-key', pemContent)
const pem = await keytar.getPassword('apptoken', 'pem-key')
```

### Option 2: Custom Encryption with AES-256-GCM

**Description:** Encrypt PEM key with user-provided password.

**Pros:**
- No native dependencies
- Cross-platform without setup

**Cons:**
- User must remember/provide password
- Password management complexity

### Option 3: File-based with Restricted Permissions

**Description:** Store in `~/.apptoken/` with 600 permissions.

**Pros:**
- Simple implementation
- No dependencies

**Cons:**
- Less secure than keychain
- Only file-permission based protection

**Recommendation:** Use `keytar` for OS keychain integration with fallback to encrypted file storage.

---

## Existing Solutions Analysis

### gh-token Plugin

**Source:** [GitHub](https://github.com/Link-/gh-token)

**Language:** Go (96% of codebase)

**Features:**
- `generate` - Create installation tokens
- `revoke` - Invalidate tokens
- `installations` - List all installations

**CLI Options:**
- `--key` / `--base64-key` - Private key (file or base64)
- `--app-id` - GitHub App ID
- `--installation-id` - Target installation
- `--hostname` - GitHub Enterprise support

**JSON Output:**
```json
{
  "token": "ghs_xxx",
  "expires_at": "2024-01-01T12:00:00Z",
  "permissions": { ... }
}
```

**Gaps (opportunities for our CLI):**
- No persistent key storage
- No automatic token refresh
- No shell integration for seamless `gh` CLI usage

---

## Build Pipeline Technologies

### tsup (Recommended)

**Description:** Zero-config bundler powered by esbuild.

**Features:**
- Fast builds
- ESM and CJS output
- Declaration file generation
- Works well with Effect-TS

### Package Structure

```
apptoken/
├── src/
│   ├── index.ts          # Library exports
│   ├── cli.ts            # CLI entry point
│   └── services/         # Effect services
├── dist/
│   ├── index.js          # Library bundle
│   ├── index.d.ts        # Type declarations
│   └── cli.js            # CLI bundle
├── package.json
└── tsconfig.json
```

### package.json Configuration

```json
{
  "name": "apptoken",
  "bin": {
    "apptoken": "./dist/cli.js"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  }
}
```

## References

- [jose - npm](https://www.npmjs.com/package/jose)
- [jsonwebtoken - npm](https://www.npmjs.com/package/jsonwebtoken)
- [node-keytar - GitHub](https://github.com/atom/node-keytar)
- [gh-token - GitHub](https://github.com/Link-/gh-token)
- [tsup - bundler](https://tsup.egoist.dev/)
