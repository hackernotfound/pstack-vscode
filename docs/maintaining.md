# Maintaining the port

`plugins/pstack/` is generated. Never edit it by hand. Put Copilot-specific files in [`overlay/`](../overlay/) and text edits in the `edits` table in [`tools/build.mjs`](../tools/build.mjs). `tools/check.mjs` fails when the committed tree differs from a fresh build.

## Update to a newer pstack-claude

1. Set `sha` and `version` in [`upstream.json`](../upstream.json) to the new pstack-claude commit, and bump [`VERSION`](../VERSION). Use a patch bump for fixes, a minor bump for a new upstream sync, and a major bump when installs or behavior change incompatibly.
2. Run `node tools/build.mjs`. Each edit must match its anchor text exactly once. If upstream reworded an anchor, the build stops and names the file.
3. Run `node tools/check.mjs` for the static checks.
4. Run `tools/eval.sh` and `node tools/eval-vscode.mjs` for the live checks.
5. Review the `plugins/pstack/` diff, then commit it with `upstream.json`.

## Static checks

`node tools/check.mjs` runs in CI on every push and pull request. It rebuilds the plugin and fails if:

- the rebuilt tree differs from the committed one
- the manifest is not Agent Plugins 1.0, or an agent, hook, or skill is missing or malformed
- the startup instructions name a skill with the `pstack:` prefix, or the hook output is not top-level `additionalContext`
- the plugin contains a symlink, or an executable outside the reviewed list
- the plugin ships any agent (VS Code's agents window lists every plugin agent twice)
- a shipped package file uses a `latest` version, a CI action is not pinned to a full commit SHA, or a CI runner or Node version is not exact

## Live checks

`tools/eval.sh` runs Copilot CLI. `tools/eval-vscode.mjs` runs the Copilot runtime bundled inside VS Code, with the session options VS Code's agents window uses. Both create a two-file repo in a temp dir and use a throwaway `COPILOT_HOME`. They check that:

- the startup instructions reach the model's context through the hook
- no pstack plugin agents are offered, so VS Code's agent picker has nothing of ours to list twice
- a request that names poteto-mode loads it through `skill`, runs a subagent that loads a pstack skill itself, has no subagent dispatch rejected, and calls no Claude-only tool names
- a two-file rename, with no mention of pstack, routes into poteto-mode, reads `copilot-tools.md`, and leaves `node main.js` printing `5`

The unmodified pstack-claude plugin fails three of these: the hook check, the unprompted routing, and the `copilot-tools.md` read.

Both need `gh`, and `eval.sh` also needs `copilot` and `jq`. They give your `gh` token to an auto-approved session, so run them only on your own machine, never in CI. `eval.sh` blocks web tools, `curl`, `wget`, and `gh` inside that session.

## Tested versions

Every version is exact:

- VS Code 1.140.0, with its bundled `@github/copilot-sdk` 1.0.15-preview.4
- Copilot CLI 1.0.91 (`npm install -g @github/copilot@1.0.91`)
- bun 1.3.14 for the helper scripts, which install from `bun.lock` with integrity hashes
- Node 24.21.0 on `ubuntu-24.04` in CI, with `actions/checkout` and `actions/setup-node` pinned to commit SHAs
