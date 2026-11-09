# Maintaining the port

`plugins/pstack/` is generated. Never edit it by hand. Put the port's own files in [`overlay/`](../overlay/), and the file removals and text edits in the `removals` and `edits` tables in [`tools/build.mjs`](../tools/build.mjs). `tools/check.mjs` fails when the committed tree differs from a fresh build.

## Updates from pstack-claude

The port ships pstack-claude's skills unchanged. Only `poteto-mode` and `setup-pstack` carry the port's edits. You never maintain skill content.

Every Monday, [`sync-upstream.yml`](../.github/workflows/sync-upstream.yml) looks for a newer pstack-claude release tag. When it finds one, it does three things:

1. It pins the tag's commit, bumps the minor version, rebuilds, and runs `check.mjs`. This job can only read the repository, because `check.mjs` runs upstream's hook scripts.
2. A second job pushes the result to a `sync/pstack-claude-<version>` branch. It runs no upstream code.
3. It opens an issue with the steps that follow.

Then follow the issue in order. First review the changes to upstream's hooks and scripts, because they run on users' machines and the static checks are not a review. Then run the live checks, open the pull request from the link, merge it, and tag the release. The live checks run the new release with your `gh` login, so review before you run them.

You can also start it from the Actions tab. GitHub pauses scheduled workflows in a repository with no activity for 60 days, and it emails you when it does. Turn the workflow back on from the Actions tab. If the build stops because upstream reworded a line that an edit targets, the run fails, and GitHub emails you. Then fix that edit in [`tools/build.mjs`](../tools/build.mjs). If upstream now covers it, delete the edit.

To run a sync by hand, run `node tools/sync-upstream.mjs plan`, then `node tools/sync-upstream.mjs apply <version> <sha>`, then `node tools/check.mjs`.

## Static checks

`node tools/check.mjs` runs in CI on every push and pull request. It rebuilds the plugin and fails if:

- the rebuilt tree differs from the committed one
- the manifest is not Agent Plugins 1.0, or another runtime's manifest folder (`.claude-plugin`, `.github`, and the rest) is in the plugin
- a hook, a skill, or one of the three agent reference files is missing or malformed
- the SessionStart wrapper does not print one JSON object with top-level `additionalContext`, or that context names a skill with the `pstack:` prefix, omits "ships no agents", or omits the no-sheet setup note when the model sheet is missing
- `session hook: off` does not silence the SessionStart wrapper, or the PreToolUse wrapper approves more than it should
- `copilot-tools.md` tells the model to dispatch a `pstack:` agent type
- the plugin contains a symlink, an executable outside the reviewed list, or a test suite or fixture
- the plugin ships any agent (VS Code's Copilot runtime rejects a `task` dispatch to a plugin agent)
- a shipped package file uses a `latest` version, a CI action is not pinned to a full commit SHA, or a CI runner or Node version is not exact

## Live checks

`tools/eval.sh` runs Copilot CLI. `tools/eval-vscode.mjs` runs the Copilot runtime bundled inside VS Code, with the session options VS Code's agents window uses. Both create a two-file repo in a temp dir and use a throwaway `COPILOT_HOME`. They check that:

- the startup instructions reach the model's context through the hook, read from the hook's own record (`hook.end` in the VS Code events, or the session's `events.jsonl` on the CLI) because current models refuse to quote their context
- no pstack plugin agents are offered, since VS Code's runtime cannot dispatch them
- a request that names poteto-mode loads it through `skill`, runs a `general-purpose` subagent that loads a pstack skill itself, has no subagent dispatch rejected, and calls no Claude-only tool names
- a two-file rename, with no mention of pstack, routes into poteto-mode, reads `copilot-tools.md`, and leaves `node main.js` printing `5`

The SDK eval does not run hooks the way the VS Code window does. The window starts hooks from its own copy of the plugin, which can lose exec bits, and it runs them in the agent sandbox. `check.mjs` covers the exec bits. Before a release, also run one delegating request in a real agents window with the sandbox on and the grant from the [agents window setup](agents-window.md).

The evals start with no model sheet, as a fresh install does, so the first role-model skill runs `setup-pstack`. The unmodified pstack-claude plugin fails two of these in VS Code: the dispatch, and the subagent that loads a pstack skill.

Both need `gh`, and `eval.sh` also needs `copilot` and `jq`. They give your `gh` token to an auto-approved session, so run them only on your own machine, never in CI. `eval.sh` blocks web tools, `curl`, `wget`, and `gh` inside that session.

## Tested versions

Every version is exact:

- VS Code 1.140.0, with its bundled `@github/copilot-sdk` 1.0.15-preview.4
- Copilot CLI 1.0.107. The CLI updates itself, so check `copilot --version` before you record a result
- bun 1.3.14 for the helper scripts, which install from `bun.lock` with integrity hashes
- Node 24.21.0 on `ubuntu-24.04` in CI, with `actions/checkout` and `actions/setup-node` pinned to commit SHAs
