# GitHub CLI App Authentication Discussion

**Source:** https://github.com/cli/cli/discussions/5081#discussioncomment-5797413

## Problem Statement

GitHub CLI (`gh`) only accepts access tokens as means of authentication - it cannot directly use GitHub App private keys. However, GitHub Apps can generate access tokens that the CLI can use.

## Current Workarounds

### 1. Manual Token Generation
Users must manually create installation tokens from their GitHub App and use those with CLI via the `GITHUB_TOKEN` environment variable.

### 2. Bash Script Solution
A comprehensive example generates tokens programmatically:
- Creates a JWT from the app's private key using `jwt-cli`
- Calls GitHub API to request an installation token
- Sets `GITHUB_TOKEN` environment variable
- Runs `gh auth setup-git` to configure git authentication

**Key dependencies:** jwt-cli, yq, curl, gh CLI

**Updated syntax for newer yq versions:**
```bash
yq -r '.[0].access_tokens_url'  # instead of yq r - '[0].access_tokens_url'
```

### 3. Third-Party Plugin
The [gh-token plugin](https://github.com/Link-/gh-token) automates this process for users.

### 4. Jenkins Integration
Use Jenkins credentials binding with `withCredentials` to pass tokens to CLI commands.

## Key Insights for Our CLI

1. **JWT Generation Required:** The core flow is: PEM key → JWT → Installation Access Token
2. **Token Lifetime:** Installation tokens have limited lifetime (typically 1 hour)
3. **Environment Variable Integration:** `GITHUB_TOKEN` env var is the standard way to pass credentials to `gh` CLI
4. **git credential helper:** `gh auth setup-git` configures git to use the token for HTTPS operations
