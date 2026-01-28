# Requirements Clarification

This document captures the Q&A process for refining the GitHub App Token CLI requirements.

---

## Q1: CLI Usage Pattern

**Question:** Your rough idea mentioned two approaches for how the CLI integrates with GitHub operations:

1. **Token provider only** - The CLI generates tokens and sets `GITHUB_TOKEN` env var. Users then run `gh` CLI commands separately.
2. **Wrapper/passthrough** - The CLI wraps GitHub CLI commands, automatically injecting credentials (e.g., `apptoken gh pr list`).

Which approach do you prefer, or do you want both?

**Answer:** Wrapper/passthrough - The CLI wraps `gh` commands, automatically injecting credentials (e.g., `apptoken gh pr list`).

---

## Q2: Command Structure

**Question:** For the wrapper approach, what command structure do you prefer?

1. `apptoken exec gh pr list` - Explicit "exec" subcommand makes it clear you're running an external command
2. `apptoken gh pr list` - Directly pass through any command after `apptoken`
3. `apptoken -- gh pr list` - Use `--` separator to indicate external command

**Answer:** Option 2 - `apptoken gh pr list` - Directly pass through any command after `apptoken`. This provides the most seamless experience.

---

## Q3: PEM Key Storage Location

**Question:** Where should the encrypted PEM key be stored? Options include:

1. **User's home directory** - `~/.apptoken/` (similar to `~/.aws/` or `~/.config/gh/`)
2. **XDG-compliant config** - `$XDG_CONFIG_HOME/apptoken/` (defaults to `~/.config/apptoken/`)
3. **Project-local** - `.apptoken/` in the project directory (allows per-project apps)
4. **Configurable** - Support multiple locations with a priority order

Which approach do you prefer?

**Answer:** Option 2 - XDG-compliant config using `$XDG_CONFIG_HOME/apptoken/` (defaults to `~/.config/apptoken/`). This follows modern Linux/macOS conventions.

---

## Q4: Multiple GitHub Apps / Profiles

**Question:** Do you need to support multiple GitHub Apps (similar to AWS profiles)?

1. **Single app only** - One PEM key stored, simpler implementation
2. **Multiple named profiles** - e.g., `apptoken --profile mybot gh pr list` or configure a default
3. **Multiple apps with auto-selection** - Based on repository/org detection

Which approach fits your use case?

**Answer:** Option 1 - Single app only for initial implementation. Keep it simple to start, can expand to multiple profiles later if needed.

---

## Q5: PEM Key Encryption

**Question:** How should the PEM key be protected at rest?

1. **OS keychain** - Use macOS Keychain / Linux secret-service (most secure, requires system integration)
2. **Password-encrypted file** - Encrypt PEM with a user password (prompted on first use per session)
3. **Plain file with restricted permissions** - Store as-is with `chmod 600` (simplest, relies on filesystem security)
4. **Environment variable** - Don't store at all; require `GITHUB_APP_PEM` env var each time

Which approach do you prefer?

**Answer:** Option 2 - Password-encrypted file. User provides a password on first use per session to decrypt the PEM key.

---

## Q6: Initial Setup Flow

**Question:** How should the user initially register their GitHub App credentials? A GitHub App requires:
- The PEM private key
- The App ID
- The Installation ID (for the specific repo/org)

What setup flow do you prefer?

1. **Interactive wizard** - `apptoken init` prompts for each value step-by-step
2. **Single command with flags** - `apptoken init --pem-file ./key.pem --app-id 12345 --installation-id 67890`
3. **Import from file** - `apptoken init --config ./app-config.json` (JSON with all values)
4. **All of the above** - Support multiple ways to initialize

Which approach?

**Answer:** Option 1 - Interactive wizard. `apptoken init` will prompt for PEM file path, App ID, and Installation ID step-by-step.

---

## Q7: Token Caching

**Question:** GitHub App installation tokens are valid for 1 hour. How should token caching work?

1. **Cache to disk** - Store token in config dir, reuse until expired (persists across terminal sessions)
2. **Memory only** - Cache in memory during command execution only (always fresh on new invocation)
3. **Session-based** - Cache in a background daemon/process for the terminal session duration
4. **No caching** - Always generate a fresh token for each command

Which approach?

**Answer:** No disk caching. Main concern is prompt injection - if an agent is compromised, it shouldn't be able to read cached tokens from disk. Tokens will be generated fresh and passed only to the child `gh` process via environment variable.

To avoid entering password per-command, a **daemon approach** will be used:
- `apptoken daemon start` - User enters password once, daemon holds decrypted PEM in memory
- `apptoken gh ...` - Talks to daemon via Unix socket, daemon generates token, passes to gh child process
- Token never touches disk, never in agent's environment (only in gh's child process env)

---

## Q8: Library API

**Question:** You mentioned the tool should also "expose an object which can be used in a library." What use cases do you envision for programmatic usage?

1. **Token generation only** - `getInstallationToken()` returns a token string for custom HTTP calls
2. **Full GitHub client** - Wraps Octokit or similar, preconfigured with auth
3. **Effect service** - Exposes an Effect `Layer` that other Effect programs can use for GitHub operations
4. **All of the above** - Layered API with primitives and convenience wrappers

Which approach?

**Answer:** Skip library API for now. Focus on CLI only for the initial implementation. Library exposure can be added later if needed.

---

## Q9: Package Name & Distribution

**Question:** What should the npm package and CLI command be named? And how do you want to distribute it?

1. **Name**: Is `apptoken` the final name, or do you prefer something like `gh-apptoken`, `github-app-auth`, etc.?
2. **Distribution**:
   - Global npm install (`npm install -g apptoken`)
   - npx usage (`npx apptoken init`)
   - Standalone binary (compiled with pkg/bun)

What are your preferences?

**Answer:**
- **Name**: `apptoken` - simple, available, reads naturally in commands like `apptoken gh pr list`
- **Distribution**: (pending)

---

## Q10: Distribution Method

**Question:** How should `apptoken` be distributed?

1. **Global npm install** - `npm install -g apptoken` (requires Node.js on target machine)
2. **npx on-demand** - `npx apptoken gh pr list` (no install, but slower startup)
3. **Standalone binary** - Compile with bun/pkg (no Node.js required, faster, larger file)
4. **Multiple options** - Support both npm and standalone binary

Which approach for your agent machines?

**Answer:** Option 1 - Global npm install (`npm install -g apptoken`). Agent machines will have Node.js available.

---

## Q11: Daemon Not Running Behavior

**Question:** What should happen when someone runs `apptoken gh pr list` but the daemon isn't running?

1. **Auto-start daemon** - Prompt for password, start daemon, then execute command
2. **Fail with helpful error** - "Daemon not running. Run `apptoken daemon start` first."
3. **One-shot mode** - Prompt for password, execute single command without starting daemon (for occasional use)
4. **Option 1 + 3** - Auto-start daemon by default, but support `--one-shot` flag

Which behavior?

**Answer:** Option 1 - Auto-start daemon. If daemon isn't running, prompt for password, start daemon, then execute the command. Smoother UX.

---

## Q12: Target Platforms

**Question:** Which platforms should `apptoken` support? The daemon approach uses Unix sockets which work on macOS/Linux but need different handling on Windows.

1. **macOS + Linux only** - Unix socket communication, simpler implementation
2. **All platforms including Windows** - Use named pipes on Windows, more complex
3. **macOS only** - Your agent machines are macOS-based

Which platforms do you need?

**Answer:** Option 1 - macOS + Linux only. Unix socket communication, simpler implementation.

---

## Q13: CLI Commands Summary

**Question:** Based on our discussion, here are the CLI commands I'm envisioning:

```
apptoken init                    # Interactive wizard to set up PEM, App ID, Installation ID
apptoken daemon start            # Start daemon (prompts for password)
apptoken daemon stop             # Stop daemon
apptoken daemon status           # Check if daemon is running
apptoken gh <args>               # Run gh CLI with injected token (auto-starts daemon if needed)
```

Any additional commands you'd like, or changes to this structure?

**Answer:** Confirmed. No changes needed. This command structure is good.

---
