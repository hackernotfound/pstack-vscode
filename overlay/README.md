# pstack (GitHub Copilot port)

Lauren Tan's [pstack](https://github.com/cursor/plugins/tree/main/pstack) is an opinionated skill stack that improves agent outcomes. This build runs it on GitHub Copilot: the VS Code agents window with the Copilot target, and Copilot CLI. It is generated from Michael Denyer's [pstack-claude](https://github.com/michael-denyer/pstack-claude).

Tell `poteto-mode` your goal and it invokes the workflow that fits: reproduce and root-cause a bug, sketch a design with `architect`, race candidates in `arena`, review a diff with `interrogate`, cut prose with `unslop`. It keeps code concise, simple, and verified, and it reports what it checked.

## What it contains

- Skills: Markdown instructions the agent loads through Copilot's `skill` tool by bare name, such as `poteto-mode`.
- No agents. Where pstack would dispatch one of its agents, Copilot uses its built-in `general-purpose` agent and has it load `poteto-mode` first, which is all `pstack:poteto-agent` does.
- A SessionStart hook that injects the poteto-mode routing mandate unless `~/.copilot/pstack-models.md` contains `session hook: off`.
- `skills/poteto-mode/references/copilot-tools.md`, which maps the Claude tool and model names in the skills to Copilot's.
- Local scripts for watching and shipping pull requests, orchestrating multi-phase plans, and auditing worktrees.

## Data handling

pstack has no server or telemetry. Anything its skills ask your agent to read goes to your model provider. Scripts run locally, and PR tools use your GitHub CLI login.
