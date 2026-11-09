# pstack-copilot (GitHub Copilot port of pstack)

Lauren Tan's [pstack](https://github.com/cursor/plugins/tree/main/pstack) is an opinionated skill stack that improves agent outcomes. This build runs it on GitHub Copilot: the VS Code agents window with the Copilot target, and Copilot CLI. It is generated from Michael Denyer's [pstack-claude](https://github.com/michael-denyer/pstack-claude).

Tell `poteto-mode` your goal and it invokes the workflow that fits: reproduce and root-cause a bug, sketch a design with `architect`, race candidates in `arena`, review a diff with `interrogate`, cut prose with `unslop`. It keeps code concise, simple, and verified, and it reports what it checked.

## What it contains

- Skills: Markdown instructions the agent loads through Copilot's `skill` tool by bare name, such as `poteto-mode`.
- No agents. Where pstack would dispatch one of its agents, Copilot uses its built-in `general-purpose` agent. For `pstack:poteto-agent` it loads `poteto-mode` first. For the other three it reads the agent's file in `skills/poteto-mode/references/agents/`.
- A SessionStart hook that injects the poteto-mode routing mandate and the saved model choices, unless `~/.copilot/pstack-models.md` contains `session hook: off`. With no model sheet it tells the session to run `setup-pstack` before the first skill that dispatches on role models.
- A PreToolUse hook that approves the agent's reads of the plugin's own files and its runs of the plugin's scripts on Copilot CLI. VS Code's agents window sends it input it does not read, so it approves nothing there.
- `skills/poteto-mode/references/copilot-tools.md`, which maps the Claude tool and model names in the skills to Copilot's.
- Local scripts for watching and shipping pull requests, auditing worktrees, and drawing statecharts.

## Data handling

pstack has no server or telemetry. Anything its skills ask your agent to read goes to your model provider. Scripts run locally, and PR tools use your GitHub CLI login.
