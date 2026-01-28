# apptoken - Implementation Prompt

## Objective

Build `apptoken`, a CLI tool that enables scoped GitHub access for agents by authenticating via GitHub Apps. The tool uses a daemon architecture to keep secrets in memory and injects tokens into `gh` CLI commands automatically.

## Key Requirements

- **CLI wrapper**: `apptoken gh <args>` passes through to `gh` CLI with `GITHUB_TOKEN` injected
- **Daemon architecture**: Background process holds decrypted PEM in memory, serves tokens via Unix socket
- **PEM encryption**: AES-256-GCM with password-based key derivation (PBKDF2)
- **Config storage**: XDG-compliant (`$XDG_CONFIG_HOME/apptoken/`)
- **Auto-start daemon**: If daemon isn't running, prompt for password and start it automatically
- **Token flow**: PEM → JWT (RS256, 10 min) → GitHub API → Installation token (1 hour)
- **No disk caching**: Tokens only exist in daemon memory and child process env vars
- **Unix socket IPC**: Communication between CLI and daemon via Unix socket (macOS + Linux)

## CLI Commands

```
apptoken init                 # Interactive setup wizard (PEM path, App ID, Installation ID, password)
apptoken daemon start         # Start daemon (prompts for password)
apptoken daemon stop          # Stop daemon
apptoken daemon status        # Check if daemon is running
apptoken gh <args>            # Run gh with auto-injected token
```

## Tech Stack

- TypeScript + Effect-TS (use Effect primitives heavily: services, layers, errors, config)
- @effect/cli for CLI framework
- @effect/platform Socket API for Unix socket server/client
- @effect/platform Command module for spawning `gh`
- `jose` for JWT generation (RS256)
- Node.js `crypto` for AES-256-GCM encryption
- Vitest + @effect/vitest for testing
- Global npm install distribution

## Acceptance Criteria

- [ ] `apptoken init` creates encrypted PEM and config in `~/.config/apptoken/`
- [ ] `apptoken daemon start` prompts for password and starts Unix socket server
- [ ] `apptoken daemon stop` gracefully stops daemon and cleans up socket
- [ ] `apptoken daemon status` reports running/stopped
- [ ] `apptoken gh pr list` fetches token from daemon and runs `gh pr list` with it
- [ ] `apptoken gh <args>` auto-starts daemon if not running
- [ ] Tokens never written to disk
- [ ] Unix socket has 0600 permissions
- [ ] All services have test coverage with mock layers
- [ ] `npm install -g` produces working `apptoken` binary

## Detailed Design

See `.sop/planning/design/detailed-design.md` for full architecture, component interfaces, data models, error handling, and testing strategy.

## Implementation Plan

See `.sop/planning/implementation/plan.md` for the 12-step incremental plan with checklist.

## Notes

- Use the Effect skill for proper Effect-TS patterns (services, layers, error types)
- Follow TDD: write failing tests first, then implement
- Each step should produce working, demoable functionality
- Single GitHub App profile only (no multi-profile support)
- macOS + Linux only (no Windows)
