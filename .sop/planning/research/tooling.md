# Development Tooling Research

## Linting: Oxlint

**Source:** [Oxlint Docs](https://oxc.rs/docs/guide/usage/linter.html), [Oxlint v1.0 Release](https://www.infoq.com/news/2025/08/oxlint-v1-released/)

### Overview
- Rust-based JavaScript/TypeScript linter from the OXC toolchain
- **v1.0 stable released June 2025**
- 50-100x faster than ESLint, 2x faster than Biome
- 660 built-in rules without JavaScript dependency tree

### Type-Aware Linting
- Leverages `tsgo` (Go port of TypeScript compiler) for full TS compatibility
- Experimental `tsgolint` provides type-aware rules

### Installation
```bash
bun add -D oxlint
```

### Configuration
`oxlint.json`:
```json
{
  "$schema": "https://oxc.rs/schema/oxlint.json",
  "rules": {
    "no-unused-vars": "warn",
    "no-console": "off"
  }
}
```

---

## Formatting: Oxfmt

**Source:** [Oxfmt Alpha Announcement](https://oxc.rs/blog/2025-12-01-oxfmt-alpha.html), [VoidZero Announcement](https://voidzero.dev/posts/announcing-oxfmt-alpha)

### Overview
- Rust-powered, **Prettier-compatible** code formatter
- 30x faster than Prettier, 3x faster than Biome
- Passes ~95% of Prettier's JavaScript/TypeScript tests
- Built on biome_formatter infrastructure

### Compatibility with User's Neovim Config
User's `conform.nvim` config uses `prettierd` for TypeScript/JavaScript with **default Prettier settings**:
- Tab width: 2 spaces
- Semicolons: true
- Quotes: double
- Trailing comma: es5

**Oxfmt will align with these defaults** since it's Prettier-compatible.

### Installation
```bash
bun add -D oxfmt
# or
npm install -D @oxc/oxfmt
```

### Configuration (to match Prettier defaults)
Create `.oxfmt.json` or use Prettier config:
```json
{
  "tabWidth": 2,
  "semi": true,
  "singleQuote": false,
  "trailingComma": "es5"
}
```

**Note:** Oxfmt can read existing `.prettierrc` files for compatibility.

---

## Build & Dev Tools Summary

| Tool | Purpose | Package |
|------|---------|---------|
| Runtime | Bun | `bun` |
| Platform | Effect + Bun | `@effect/platform-bun` |
| CLI Framework | Effect CLI | `@effect/cli` |
| Linting | Oxlint | `oxlint` |
| Formatting | Oxfmt | `oxfmt` / `@oxc/oxfmt` |
| Type Checking | TypeScript | `typescript` |
| Bundling | Bun Build | (built-in) |
| Testing | Bun Test + Effect Vitest | `@effect/vitest` |

---

## Scripts (package.json)

```json
{
  "scripts": {
    "dev": "bun run src/cli.ts",
    "build": "bun build ./src/cli.ts --outfile ./dist/cli.js --target bun && bun build ./src/index.ts --outfile ./dist/index.js",
    "lint": "oxlint .",
    "format": "oxfmt .",
    "format:check": "oxfmt --check .",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "check": "bun run typecheck && bun run lint && bun run format:check"
  }
}
```

## CI Pipeline

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run typecheck
      - run: bun run lint
      - run: bun run format:check
      - run: bun test
```

## References

- [Oxlint Documentation](https://oxc.rs/docs/guide/usage/linter.html)
- [Oxfmt Alpha Announcement](https://oxc.rs/blog/2025-12-01-oxfmt-alpha.html)
- [Bun Bundler Docs](https://bun.com/docs/bundler)
