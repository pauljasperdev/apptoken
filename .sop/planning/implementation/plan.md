# apptoken Implementation Plan

## Progress Checklist

- [ ] Step 1: Project setup and build pipeline
- [ ] Step 2: Config service with PEM encryption
- [ ] Step 3: JWT generation and GitHub API client
- [ ] Step 4: Token service integration
- [ ] Step 5: Unix socket server (daemon)
- [ ] Step 6: Unix socket client
- [ ] Step 7: Daemon lifecycle management
- [ ] Step 8: Command executor (gh spawning)
- [ ] Step 9: CLI commands (init, daemon, gh)
- [ ] Step 10: Auto-start daemon flow
- [ ] Step 11: Error handling and UX polish
- [ ] Step 12: CI pipeline and documentation

---

## Step 1: Project Setup and Build Pipeline

**Objective:** Set up the project structure, dependencies, and build tooling so we have a working TypeScript/Effect project that compiles and runs.

**Implementation Guidance:**
- Initialize npm project with `package.json`
- Install core dependencies: `effect`, `@effect/cli`, `@effect/platform`, `@effect/platform-node`, `jose`
- Install dev dependencies: `typescript`, `@types/node`, `tsup` (or use bun build), `vitest`, `@effect/vitest`, `oxlint`
- Create `tsconfig.json` with strict mode, ESM output
- Create basic project structure:
  ```
  src/
    cli.ts           # Entry point
    services/        # Effect services
    errors.ts        # Error types
  ```
- Add npm scripts: `dev`, `build`, `test`, `lint`, `typecheck`
- Create minimal `src/cli.ts` that prints "apptoken v0.1.0"

**Test Requirements:**
- `bun run build` completes without errors
- `bun run dev` prints version
- `bun run typecheck` passes
- `bun run lint` passes

**Integration:** This is the foundation; all subsequent steps build on this structure.

**Demo:** Run `bun run dev` and see "apptoken v0.1.0" printed to console.

---

## Step 2: Config Service with PEM Encryption

**Objective:** Implement configuration storage and PEM encryption so users can securely store their GitHub App credentials.

**Implementation Guidance:**
- Create `src/services/ConfigService.ts` with Effect service pattern
- Implement XDG config path resolution (`$XDG_CONFIG_HOME/apptoken/` or `~/.config/apptoken/`)
- Define `AppConfig` schema using `@effect/schema`
- Implement AES-256-GCM encryption for PEM:
  - `encryptPem(pem: string, password: string): Effect<string>`
  - `decryptPem(encrypted: string, password: string): Effect<string, DecryptError>`
- Implement config CRUD:
  - `load(): Effect<AppConfig, ConfigNotFound | ConfigParseError>`
  - `save(config: AppConfig): Effect<void>`
  - `exists(): Effect<boolean>`
- Create error types in `src/errors.ts`

**Test Requirements:**
- Unit test: Encrypt then decrypt PEM returns original
- Unit test: Decrypt with wrong password fails with `InvalidPassword`
- Unit test: Save then load config returns same data
- Unit test: Load non-existent config returns `ConfigNotFound`

**Integration:** ConfigService will be used by `init` command and DaemonService.

**Demo:** Run test suite showing encryption round-trip works: `bun test src/services/ConfigService.test.ts`

---

## Step 3: JWT Generation and GitHub API Client

**Objective:** Implement JWT generation from PEM and GitHub API client for requesting installation tokens.

**Implementation Guidance:**
- Create `src/services/JwtService.ts`:
  - Use `jose` library for RS256 signing
  - `generateJwt(pem: string, appId: string): Effect<string, JwtGenerationError>`
  - Set claims: `iat` (60s ago), `exp` (10 min), `iss` (appId)
- Create `src/services/GitHubApiClient.ts`:
  - Use `@effect/platform` HttpClient
  - `requestInstallationToken(jwt: string, installationId: string): Effect<InstallationToken, GitHubApiError>`
  - Handle response parsing and error cases (401, 404, rate limits)
- Define `InstallationToken` type: `{ token: string, expiresAt: Date }`

**Test Requirements:**
- Unit test: JWT has correct structure and claims (decode without verify)
- Unit test: JWT signature is valid RS256
- Integration test (with mock server): API client handles success response
- Integration test (with mock server): API client handles 401/404 errors

**Integration:** These services are composed by TokenService in Step 4.

**Demo:** Unit tests pass showing JWT generation works with a test PEM key.

---

## Step 4: Token Service Integration

**Objective:** Create the TokenService that orchestrates JWT generation and GitHub API calls to produce installation tokens.

**Implementation Guidance:**
- Create `src/services/TokenService.ts`:
  - Depends on JwtService, GitHubApiClient, and config (pem, appId, installationId)
  - `getInstallationToken(): Effect<InstallationToken, TokenError>`
  - Flow: Generate JWT → Call GitHub API → Return token
- Add in-memory token caching within daemon (optional optimization):
  - Cache token if not expired (with 5 min buffer)
  - Generate fresh token if cache miss or near expiry

**Test Requirements:**
- Unit test: TokenService calls JwtService and GitHubApiClient in sequence
- Unit test: With mock deps, returns expected token
- Unit test: Caching returns same token if not expired

**Integration:** TokenService is used by SocketServer to handle token requests.

**Demo:** Run test showing TokenService produces a mock token with all dependencies mocked.

---

## Step 5: Unix Socket Server (Daemon)

**Objective:** Implement the Unix socket server that listens for token requests and responds with installation tokens.

**Implementation Guidance:**
- Create `src/services/SocketServer.ts`:
  - Use `@effect/platform-node` NodeSocketServer
  - Listen on Unix socket path (`/tmp/apptoken-{uid}.sock` or XDG runtime dir)
  - Define JSON protocol:
    - Request: `{ action: "getToken" }` or `{ action: "ping" }`
    - Response: `{ ok: true, token, expiresAt }` or `{ ok: false, error }`
  - Handle connection lifecycle with Effect Scope
- Implement request handler:
  - Parse incoming JSON
  - Call TokenService for token requests
  - Serialize and send response
- Add socket file cleanup on shutdown (finalizer)

**Test Requirements:**
- Unit test: Server starts and creates socket file
- Unit test: Server handles ping request
- Integration test: Connect to server, send getToken, receive response
- Unit test: Server removes socket file on stop

**Integration:** SocketServer is started by DaemonService and responds to SocketClient.

**Demo:** Start server in test, connect with raw socket, send ping, receive pong.

---

## Step 6: Unix Socket Client

**Objective:** Implement the client that connects to the daemon socket to request tokens.

**Implementation Guidance:**
- Create `src/services/SocketClient.ts`:
  - Use `@effect/platform-node` NodeSocket
  - Connect to daemon socket path
  - `requestToken(): Effect<InstallationToken, SocketError | DaemonNotRunning>`
  - `ping(): Effect<void, SocketError | DaemonNotRunning>`
- Handle connection errors:
  - ENOENT/ECONNREFUSED → DaemonNotRunning
  - Parse errors → SocketError
- Implement timeout for requests (5 seconds)

**Test Requirements:**
- Integration test: Client connects to running server and gets token
- Unit test: Client returns DaemonNotRunning when socket doesn't exist
- Unit test: Client handles malformed response

**Integration:** SocketClient is used by CLI gh command to get tokens.

**Demo:** Integration test showing client-server round trip works.

---

## Step 7: Daemon Lifecycle Management

**Objective:** Implement daemon start/stop/status commands with proper process management.

**Implementation Guidance:**
- Create `src/services/DaemonService.ts`:
  - `start(password: string): Effect<void, DaemonError>`
    - Decrypt PEM with password
    - Store decrypted PEM in memory
    - Start SocketServer
    - Write PID file for tracking
    - Use `Effect.forkDaemon` for long-running process
  - `stop(): Effect<void, DaemonError>`
    - Read PID file
    - Send SIGTERM to daemon process
    - Clean up PID and socket files
  - `status(): Effect<DaemonStatus>`
    - Check PID file exists and process is running
    - Try ping via socket
- Create `src/daemon.ts` as separate entry point for daemon process
- Handle signals (SIGINT, SIGTERM) for graceful shutdown

**Test Requirements:**
- Integration test: Start daemon, verify socket created
- Integration test: Stop daemon, verify socket removed
- Integration test: Status returns running/stopped correctly
- Unit test: Graceful shutdown cleans up resources

**Integration:** DaemonService is used by CLI daemon commands.

**Demo:** Run `bun run src/daemon.ts`, verify socket exists, send SIGTERM, verify cleanup.

---

## Step 8: Command Executor (gh Spawning)

**Objective:** Implement the service that spawns `gh` CLI with the token injected as environment variable.

**Implementation Guidance:**
- Create `src/services/CommandExecutor.ts`:
  - Use `@effect/platform` Command module
  - `runGh(args: string[], token: string): Effect<CommandResult, CommandError>`
  - Inject `GITHUB_TOKEN` and `GH_TOKEN` env vars
  - Stream stdout/stderr to parent process
  - Return exit code
- Handle `gh` not found error
- Pass through all arguments verbatim

**Test Requirements:**
- Unit test: Command is constructed with correct env vars
- Integration test: Run `gh --version` (no token needed), verify output
- Unit test: Non-zero exit code returns CommandFailed

**Integration:** CommandExecutor is used by CLI gh command after getting token.

**Demo:** Run test that executes `gh --version` and captures output.

---

## Step 9: CLI Commands (init, daemon, gh)

**Objective:** Wire up all services into the CLI commands using @effect/cli.

**Implementation Guidance:**
- Update `src/cli.ts` with full command structure:
  ```
  apptoken
    init                    # Interactive setup
    daemon
      start                 # Start daemon
      stop                  # Stop daemon
      status                # Check status
    gh <args...>            # Run gh with token
  ```
- Implement `init` command:
  - Prompt for PEM file path (validate file exists)
  - Prompt for App ID
  - Prompt for Installation ID
  - Prompt for encryption password (with confirmation)
  - Save encrypted PEM and config
- Implement `daemon start`:
  - Prompt for password
  - Call DaemonService.start()
- Implement `daemon stop`:
  - Call DaemonService.stop()
- Implement `daemon status`:
  - Call DaemonService.status()
  - Print running/stopped
- Implement `gh` command:
  - Call SocketClient.requestToken()
  - Call CommandExecutor.runGh()
  - Exit with gh's exit code

**Test Requirements:**
- E2E test: `apptoken --help` shows all commands
- E2E test: `apptoken daemon status` when not running shows "stopped"
- E2E test: Full flow with mock GitHub API

**Integration:** This wires together all services into the user-facing CLI.

**Demo:** Run `apptoken --help` and see complete command structure with descriptions.

---

## Step 10: Auto-Start Daemon Flow

**Objective:** Implement automatic daemon startup when running `apptoken gh` and daemon isn't running.

**Implementation Guidance:**
- In gh command handler:
  - First try SocketClient.requestToken()
  - If DaemonNotRunning:
    - Prompt for password
    - Start daemon (in background)
    - Wait for socket to be ready (poll with timeout)
    - Retry requestToken()
- Add `--no-daemon-start` flag to disable auto-start
- Handle password retry (max 3 attempts)

**Test Requirements:**
- E2E test: gh command with daemon not running prompts for password and starts daemon
- E2E test: Subsequent gh commands don't prompt (daemon already running)
- Unit test: --no-daemon-start flag prevents auto-start

**Integration:** This provides the seamless UX promised in requirements.

**Demo:** With daemon stopped, run `apptoken gh auth status`, enter password, see it start daemon and execute command.

---

## Step 11: Error Handling and UX Polish

**Objective:** Improve error messages, add helpful hints, and polish the user experience.

**Implementation Guidance:**
- Add user-friendly error messages:
  - ConfigNotFound → "No configuration found. Run 'apptoken init' first."
  - InvalidPassword → "Incorrect password. Please try again."
  - DaemonNotRunning → "Daemon not running. Starting..."
  - GitHubApiError 401 → "Authentication failed. Check your App ID and PEM key."
  - CommandNotFound → "gh CLI not found. Install it from https://cli.github.com"
- Add `--verbose` flag for debug output
- Add color to output (success green, error red) using Effect Console or chalk
- Validate PEM file format during init
- Show token expiry warning if < 5 minutes remaining

**Test Requirements:**
- Unit test: Each error type produces expected user message
- E2E test: Missing gh CLI shows helpful message

**Integration:** Improves overall UX across all commands.

**Demo:** Trigger various error conditions and show user-friendly messages.

---

## Step 12: CI Pipeline and Documentation

**Objective:** Set up GitHub Actions CI and create user documentation.

**Implementation Guidance:**
- Create `.github/workflows/ci.yml`:
  - Run on push and PR
  - Jobs: typecheck, lint, test
  - Use bun for speed
- Create `README.md`:
  - Installation instructions
  - Quick start guide
  - Command reference
  - Security model explanation
  - Troubleshooting section
- Add `LICENSE` file (MIT or your preference)
- Configure npm publishing:
  - Set `bin` field in package.json
  - Add `prepublishOnly` script
  - Set up npm token for CI publishing (optional)

**Test Requirements:**
- CI passes on all checks
- README renders correctly on GitHub

**Integration:** Final polish for open-source release.

**Demo:** Push to GitHub, see CI run and pass, view rendered README.

---

## Implementation Notes

### Effect Skill Usage
Throughout implementation, use the effect skill (`/effect-ts`) for guidance on:
- Proper Layer composition
- Error handling patterns
- Service dependencies
- Testing with mock layers

### Development Workflow
1. Start each step by writing tests first (TDD)
2. Implement minimum code to pass tests
3. Refactor for clarity
4. Update checklist when step is complete

### Key Files by Step

| Step | Key Files |
|------|-----------|
| 1 | `package.json`, `tsconfig.json`, `src/cli.ts` |
| 2 | `src/services/ConfigService.ts`, `src/errors.ts` |
| 3 | `src/services/JwtService.ts`, `src/services/GitHubApiClient.ts` |
| 4 | `src/services/TokenService.ts` |
| 5 | `src/services/SocketServer.ts` |
| 6 | `src/services/SocketClient.ts` |
| 7 | `src/services/DaemonService.ts`, `src/daemon.ts` |
| 8 | `src/services/CommandExecutor.ts` |
| 9 | `src/cli.ts` (expanded) |
| 10 | `src/cli.ts` (gh command handler) |
| 11 | `src/errors.ts`, various services |
| 12 | `.github/workflows/ci.yml`, `README.md` |
