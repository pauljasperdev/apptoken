# Rough Idea: GitHub App Token CLI

I want you to set up a CLI tool written in TypeScript, specifically with Effect TypeScript. This CLI tool will on the one side build to a CLI and on the other side expose an object which can be used in a library. The tool should take a GitHub app PEM key and generate login credentials for GitHub with it. Using this CLI can be used to make a scoped log into GitHub via a GitHub app.

## Problem Statement

For personal GitHub accounts it is very difficult to limit access for bot machines. When I have a GitHub project and I invite a collaborator, for example a bot account, then this bot has full access because to limit access a GitHub app can create a GitHub app which has limited access. For example, it cannot merge pull requests, but the app can push and open or close issues and all that stuff, but it cannot influence production. Doing this with a personal account without an organization is very difficult, but for GitHub apps there is no GitHub login.

## Proposed Solution

A CLI tool that:

1. Takes a PEM key created for a GitHub App
2. Stores the PEM key safely encrypted somewhere the CLI is installed
3. Generates keys or JWTs (JWTs have a limited lifetime, so when the CLI is called again and the token is not valid anymore, a fresh token has to be created)
4. Provides a fresh GitHub session (similar to AWS Single Sign-On where you log in once and have a valid session for profiles)

## Usage Patterns

Either:
- Use this CLI to also run GitHub commands, OR
- Use it only to generate credentials and then run GitHub commands from the command line with credentials set in the shell

The idea is that an agent reaches once for this app token CLI and then can use GitHub CLI commands. Alternatively, wrap all GitHub CLI commands or make it agnostic but run GitHub CLI commands through this app token CLI.

## Technical Requirements

- Build pipeline
- Implementation tests (using Effect for easy test setup and nice dependency injection)
- Use Effect skill for proper Effect implementations
- Build pipeline to build an NPM package or CLI
- Publish NPM package with the construct that can be used to manage/store the app token, etc.
- Use Effect's built-in primitives for stores, secrets, variables, config, errors, etc.
