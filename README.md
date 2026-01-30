# apptoken

Generate and cache GitHub App installation tokens locally, then run `gh` or `git` with the token injected. The CLI stores your app config and encrypted private key so you can fetch short-lived tokens on demand.

## Prerequisites

- bun

## Install

```sh
npm install -g apptoken
```

Or run with npx:

```sh
npx apptoken --help
```

## Quickstart

1. Initialize configuration and store your private key:
   ```sh
   apptoken init
   ```
2. Start the token daemon (optional, but speeds up repeated requests):
   ```sh
   apptoken daemon start
   ```
3. Run GitHub CLI with an injected token:
   ```sh
   apptoken gh repo list
   ```
4. Run Git commands against GitHub with an injected token:
   ```sh
   apptoken git fetch
   ```

## Commands

- `apptoken init` - interactive setup (App ID, Installation ID, PEM key, password)
- `apptoken daemon start|stop|status` - manage background token daemon
- `apptoken gh <args...>` - run `gh` with a fresh installation token
- `apptoken git <args...>` - run `git` against GitHub with a fresh installation token

## Create a GitHub App

1. Go to GitHub settings:
   - Personal: https://github.com/settings/apps
   - Organization: https://github.com/organizations/\<org\>/settings/apps
2. Create a new GitHub App.
3. Set permissions based on the `gh` and `git` commands you plan to run.
4. Generate and download a private key (PEM).
5. Install the app on your organization or account.
6. Collect the required identifiers:
   - App ID: shown in the GitHub App settings page `https://github.com/settings/apps/<myapp>`
   - Installation ID: go to (`https://github.com/settings/apps/<myapp>/installations`) press cog for installations settings. URL shows then `https://github.com/settings/installations/<InstallationID>`

## Security Notes

- The private key is encrypted locally using your password.
- The daemon stores tokens in memory and fetches new ones when needed.
- Config and encrypted PEM are stored under the app config directory.

## Troubleshooting

- Ensure Bun is installed and on your PATH.
- Ensure `gh` is installed if using the `apptoken gh` command.
- Ensure `git` is installed if using the `apptoken git` command.
- Run `apptoken --help` for usage details.
