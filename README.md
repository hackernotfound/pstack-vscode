# pstack for GitHub Copilot

A GitHub Copilot port of [pstack](https://github.com/cursor/plugins/tree/main/pstack), the agent workflow plugin by Lauren Tan ([poteto](https://x.com/poteto)). It runs in the VS Code agents window with the **Copilot** target and in Copilot CLI.

The port is built from [pstack-claude](https://github.com/michael-denyer/pstack-claude), Michael Denyer's Claude Code port, at the commit pinned in [`upstream.json`](upstream.json) (currently 0.9.57). The skills, playbooks, and agents are unchanged. The port adds what Copilot needs to run them:

- A `SessionStart` hook that injects the poteto-mode mandate as `additionalContext`. Copilot drops plain hook output, so the Claude Code hook does nothing there.
- [`copilot-tools.md`](overlay/skills/poteto-mode/references/copilot-tools.md), which maps the Claude tool names the skills use (`Agent`, `Skill`, `AskUserQuestion`, `TodoWrite`, model aliases) to Copilot's (`task`, `skill`, `ask_user`, `update_todo`). poteto-mode points Copilot at it.
- Bare skill names in the mandate. Copilot's `skill` tool resolves `poteto-mode` but returns "Skill not found" for `pstack:poteto-mode`. Agents keep the prefix. Copilot CLI dispatches `pstack:poteto-agent` as-is.
- A fallback for pstack's agents. VS Code passes plugins to Copilot without their agents, so in the agents window `task` rejects `pstack:poteto-agent`. `copilot-tools.md` tells the model to dispatch `general-purpose` instead and have it load poteto-mode first, which is all `pstack:poteto-agent` does.
- A Copilot `plugin.json` and a `.github/plugin/marketplace.json`, with no `.claude-plugin/` manifest. VS Code parses any plugin that has `.claude-plugin/plugin.json` as a Claude plugin.

Tested with VS Code 1.140.0 and its bundled `@github/copilot-sdk` 1.0.15-preview.4, Copilot CLI 1.0.91 (`npm install -g @github/copilot@1.0.91`), bun 1.3.14, and Node 24.21.0 in CI. Every version in this repo is exact. The upstream source is a full commit SHA, CI actions are pinned to commit SHAs, and the shipped helper scripts install from `bun.lock` with integrity hashes. `tools/check.mjs` fails on a `latest` specifier, an unpinned action, a `-latest` runner, or an inexact Node version.

## Install in VS Code

1. Open your user settings JSON and add:

   ```json
   "chat.plugins.enabled": true,
   "chat.plugins.marketplaces": ["hackernotfound/pstack-vscode"]
   ```

2. Open the Extensions view and search `@agentPlugins`. Install **pstack** and accept the marketplace trust prompt.
3. Open the agents window. In the session target picker, select **Copilot**.
4. Start a session. Under **Customizations**, **Plugins** lists pstack, **Hooks** lists its `SessionStart` hook, and **Skills** includes `poteto-mode`.

To use a local checkout instead of the marketplace, replace step 1's marketplace line with `"chat.pluginLocations": { "/absolute/path/to/pstack-vscode/plugins/pstack": true }`.

## Install in Copilot CLI

```shell
copilot plugin marketplace add hackernotfound/pstack-vscode
copilot plugin install pstack@pstack-vscode
```

`marketplace add` also takes a local checkout path. The plugin then loads live from that checkout. A marketplace install tracks `main`. To stay on one version, check out its tag, such as `v0.9.57-copilot.2`, and install from that checkout. VS Code lists plugins installed with Copilot CLI too.

Use the **Copilot** target only. The **Claude** target loads your Claude Code plugins from `~/.claude`, so if you also run pstack-claude there, keep using it for that target.

## Use it

Multi-file changes, design choices, and bugs with an unknown cause route into poteto-mode on their own. To enter a workflow directly, ask for it by name ("use poteto-mode", "run tdd on this") or pick it from the slash-command list: `poteto-mode`, `tdd`, `architect`, `how`, `why`, `arena`, `interrogate`. Copilot CLI lists plugin skills without the `pstack:` prefix. VS Code may show them as `/pstack:<skill>`.

To turn off the session hook, add `session hook: off` to `~/.copilot/pstack-models.md`.

### Models

Copilot does not accept Claude's model aliases, and the models an account can pick depend on its plan. By default the port leaves `task`'s `model` unset and Copilot chooses. To pin models per role, run `/setup-pstack`. It writes `~/.copilot/pstack-models.md` with slugs your account accepts, such as `claude-opus-5.5`.

## Security

- The plugin has no server and no telemetry. Anything its skills ask the agent to read goes to your model provider.
- The only code that runs on its own is the `SessionStart` hook. It reads `~/.copilot/pstack-models.md` for `session hook: off` and prints a fixed JSON file from the plugin. It takes no input from the workspace.
- Skills can ask the agent to run the scripts in `skills/poteto-mode/scripts/`. They call `git`, `gh`, and `gt` with your login and install pinned packages from `bun.lock`. `scripts/watch-pr/live-merge-safety.mjs --live-disposable` creates and deletes a throwaway repo under your account, and only runs with that flag.
- Keep tool approvals on. In VS Code, leave `chat.tools.autoApprove` off. In Copilot CLI, avoid `--allow-all-tools` and `--allow-all-paths` in normal use.
- Accept the marketplace trust prompt only for `hackernotfound/pstack-vscode`.
- On each `upstream.json` bump, review the `plugins/pstack/` diff before you install it. `tools/check.mjs` fails on symlinks and on executables outside a reviewed list.

## Update to a newer pstack-claude

1. Set `sha` and `version` in [`upstream.json`](upstream.json) to the new pstack-claude commit. Reset `portRevision` to 1.
2. Run `node tools/build.mjs`. Each edit must match its anchor text exactly once. If upstream reworded an anchor, the build stops and names the file.
3. Run `node tools/check.mjs` for the static checks.
4. Run `tools/eval.sh` and `node tools/eval-vscode.mjs` for the live checks. It needs `copilot`, `gh`, and `jq`. It gives your `gh` token to an auto-approved session with web tools, `curl`, `wget`, and `gh` blocked, so run it only on your own machine, never in CI.
5. Commit `upstream.json` with the rebuilt `plugins/pstack/`.

Never edit `plugins/pstack/` by hand. It is generated. Put Copilot-specific files in `overlay/` and text edits in the `edits` table in [`tools/build.mjs`](tools/build.mjs). `check.mjs` fails when the committed tree differs from a fresh build.

## What the live checks cover

`tools/eval.sh` runs Copilot CLI. `tools/eval-vscode.mjs` runs the Copilot runtime bundled inside VS Code, started with the session options VS Code's agents window uses. Both create a two-file repo in a temp dir and use a throwaway `COPILOT_HOME`:

- The mandate reaches the model's context through the hook.
- On Copilot CLI, `pstack:poteto-agent` and `pstack:comment-sicko` are valid `task` agent types. The VS Code runtime does not load them and reports that as `INFO`.
- A request that names poteto-mode loads it through `skill`, runs a subagent that loads poteto-mode itself, and calls no Claude-only tool names.
- A two-file rename, with no mention of pstack, routes into poteto-mode, reads `copilot-tools.md`, and leaves `node main.js` printing `5`.

The unmodified pstack-claude plugin fails three of these on Copilot: the mandate check, the unprompted routing, and the `copilot-tools.md` read.

## License

MIT. pstack is (c) 2026 Lauren Tan, the cursor-team-kit skills are (c) 2026 Cursor, and the Claude Code port is (c) 2026 Michael Denyer. Their license and notice files are in [`licenses/`](licenses/). See [NOTICE.md](NOTICE.md) for this port's additions.
