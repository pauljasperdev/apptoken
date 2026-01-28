# apptoken - Project Summary

## Overview

This document summarizes the Prompt-Driven Development process for `apptoken`, a CLI tool that enables scoped GitHub access for agents via GitHub App authentication.

## Problem Solved

Personal GitHub accounts grant full access to collaborators (including bot accounts), making it risky to give agents repository access. GitHub Apps provide scoped permissions but require complex authentication (PEM → JWT → Installation Token). `apptoken` automates this flow while protecting against prompt injection attacks by keeping secrets in memory only.

## Artifacts Created

```
.sop/planning/
├── rough-idea.md              # Original concept
├── idea-honing.md             # 13 Q&A requirements clarification
├── research/
│   ├── github-app-auth.md     # GitHub App authentication flow
│   ├── effect-ts-patterns.md  # Effect CLI, services, layers
│   ├── technologies.md        # JWT libs, encryption, tooling
│   ├── tooling.md             # Oxlint, Oxfmt, build pipeline
│   ├── github-cli-discussion.md # gh CLI integration insights
│   └── daemon-patterns.md     # Unix sockets, daemon lifecycle
├── design/
│   └── detailed-design.md     # Complete technical design
├── implementation/
│   └── plan.md                # 12-step implementation plan
└── summary.md                 # This document
```

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Daemon + Unix socket | Keeps secrets in memory; prompt injection protection |
| Token storage | None (memory only) | Compromised agent cannot read cached tokens |
| PEM protection | AES-256-GCM encrypted | Secure at rest with user password |
| CLI pattern | Wrapper (`apptoken gh ...`) | Seamless integration with existing gh workflows |
| Auto-start | Yes | Better UX; one password prompt starts daemon |
| Platforms | macOS + Linux | Unix sockets; Windows deferred |

## Implementation Overview

**12 incremental steps**, each producing working, testable functionality:

1. Project setup and build pipeline
2. Config service with PEM encryption
3. JWT generation and GitHub API client
4. Token service integration
5. Unix socket server (daemon)
6. Unix socket client
7. Daemon lifecycle management
8. Command executor (gh spawning)
9. CLI commands (init, daemon, gh)
10. Auto-start daemon flow
11. Error handling and UX polish
12. CI pipeline and documentation

## Tech Stack

- **Runtime**: Node.js (npm distribution)
- **Language**: TypeScript + Effect-TS
- **CLI**: @effect/cli
- **Sockets**: @effect/platform (stable Socket API)
- **JWT**: jose
- **Encryption**: Node.js crypto (AES-256-GCM)
- **Testing**: Vitest + @effect/vitest
- **Linting**: Oxlint
- **Build**: tsup or bun build

## CLI Commands

```bash
apptoken init                    # Setup wizard
apptoken daemon start            # Start daemon (prompt password)
apptoken daemon stop             # Stop daemon
apptoken daemon status           # Check daemon status
apptoken gh <args>               # Run gh with auto-auth
```

## Security Model

1. **At rest**: PEM encrypted with AES-256-GCM (PBKDF2 key derivation)
2. **In memory**: Decrypted PEM held by daemon process only
3. **Token flow**: Token passed to gh child process via env var, never to disk
4. **Socket**: Unix socket with 0600 permissions

## Next Steps

1. **Review** the detailed design at `.sop/planning/design/detailed-design.md`
2. **Review** the implementation plan at `.sop/planning/implementation/plan.md`
3. **Begin implementation** following the 12-step plan
4. Use the effect skill (`/effect-ts`) for Effect-TS guidance during implementation

## Areas for Future Enhancement

- Multiple GitHub App profiles
- Library API for programmatic usage
- GitHub Enterprise support
- Windows support (named pipes)
- Token permission scoping per command
