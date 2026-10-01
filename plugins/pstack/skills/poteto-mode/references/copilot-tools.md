# GitHub Copilot tool mapping for pstack

pstack skills are written in Claude Code tool language (the `Skill` tool, the `Agent` tool, `AskUserQuestion`, Claude model names). On GitHub Copilot the skills are the same files; only the tool names resolve differently. Read this when a pstack skill names a Claude tool, a driver or bundled skill, or a Claude model. It covers Copilot CLI and the VS Code agents window with the Copilot target, which runs the same Copilot runtime.

## Tool actions

| pstack / Claude action | Copilot equivalent |
|------------------------|--------------------|
| Read a file | `view` |
| Create / edit / delete a file | your file edit tool (`apply_patch`, or `edit` / `create`, depending on the model) |
| Run a shell command | `bash` (`read_bash`, `stop_bash`, `list_bash` for long-running shells) |
| Search file contents / find files | `rg` or `grep`, and `glob` |
| Fetch a URL | `web_fetch` |
| Search the web | `web_search` when the session exposes it; otherwise `web_fetch` a search URL |
| Invoke a skill (the `Skill` tool, `/command`) | `skill` with the bare skill name, such as `skill: "poteto-mode"`. Skills carry no `pstack:` prefix on Copilot; `pstack:tdd` returns "Skill not found". |
| Dispatch a subagent (the `Agent`/`Task` tool) | `task` |
| Dispatch N parallel subagents in one turn | N `task` calls with `mode: "background"` in one response |
| Wait for a subagent result | `read_agent` with the returned `agent_id` and `wait: true` |
| List or message running subagents | `list_agents` / `write_agent` |
| Track tasks (the todolist; `TaskCreate` / `TaskUpdate`, or `TodoWrite` on Claude Code) | `update_todo` with the whole list as a Markdown checklist. If it is not exposed, use the `todo.md` fallback in poteto-mode's Platform Adaptation. |
| Ask the human a fixed-choice question (`AskUserQuestion`) | `ask_user` with `question` and `choices` when the session exposes it (interactive sessions). In non-interactive runs there is no one to ask: pick the sensible default, say so, and continue. Anything on poteto-mode's Autonomy "Always pause" list (force-push, deploys, data deletion, customer messages) ends the run instead of defaulting. |

## Subagent policy

poteto-mode's Subagents section sets Claude-specific defaults (`subagent_type: "pstack:poteto-agent"`, `run_in_background: true`). On Copilot:

- This port ships no plugin agents. VS Code's agents window lists every plugin agent twice, and VS Code's Copilot runtime cannot dispatch them anyway. Use Copilot's built-ins as `task`'s `agent_type` (`explore`, `general-purpose`, `code-review`, `research`, `rubber-duck`, `security-review`, `task`).
- Where a skill names a pstack agent, dispatch `general-purpose` and begin the prompt as follows:
  - For `pstack:poteto-agent` or `pstack:poteto-agent-<level>`: "Before any work, load the `poteto-mode` skill with the `skill` tool and follow it, including its Principles section."
  - For `pstack:comment-sicko`: "Before any work, read `skills/poteto-mode/references/agents/comment-sicko.md` in the pstack plugin in full and act as that agent." The plugin root is two directories above poteto-mode's `SKILL.md`.
  - For `pstack:effort-<level>`: keep the prompt as written.
- A `<level>` in an agent name or a role value goes to `task`'s `reasoning_effort`.
- `run_in_background: true` maps to `mode: "background"`. Collect each result with `read_agent` before you use it.
- `task` requires `description` (3 to 5 words), `prompt`, `agent_type`, and `name` (a short agent name).
- Your Copilot plan caps concurrent subagents (Free 2, Pro 4, Max 8, Business 16, Enterprise 32). Size `swarm` and `arena` fan-out to fit, and queue the rest.
- Keep the rest of the policy unchanged. Pass file pointers not inlined context, give each writing worker its own worktree or branch, review every subagent's diff yourself.

## Model names

Skills name Claude model aliases (`opus`, `fable`, `sonnet`, `haiku`). Copilot does not accept them, and which models a Copilot account may pick depends on its plan. So on Copilot:

- Leave `task`'s `model` unset by default. Copilot then picks the model for the subagent (`auto`).
- Set `model` only to a slug the user configured in the Copilot sheet (see `setup-pstack`), and only one you have seen the runtime accept.
- Copilot slugs put a dot in the version. Candidates for the Claude aliases, when the account offers them: `opus` as `claude-opus-5.5` or `claude-opus-5`, `fable` as `claude-fable-5`, `sonnet` as `claude-sonnet-5` or `claude-sonnet-4.6`, `haiku` as `claude-haiku-4.5`. Non-Claude families such as `gpt-6-sol` or `gemini-3.7-flash` add panel diversity. An unavailable slug is a hard error on the CLI's `--model`, so confirm a slug works before writing it to the sheet.
- Diverse-model panels (`arena`, `architect`, `interrogate`, `how` critics, `reflect`): use distinct configured slugs when the sheet lists them. With no sheet, or if only one model is reachable, vary `reasoning_effort` across panel members and note in the verdict that model diversity was reduced.

## Session routing hook

The plugin ships a `SessionStart` hook that injects the poteto-mode mandate as `additionalContext` when a session starts. It reads `session hook` from the Copilot sheet at `$COPILOT_HOME/pstack-models.md` (default `~/.copilot/pstack-models.md`); `session hook: off` disables injection.

## Driver and bundled skills pstack references

| Skill or driver named in pstack | On Copilot |
|---------------------------------|------------|
| `run` (drive a CLI/TUI to see a change work) | Run the app yourself via `bash` and observe the real output. |
| Project UI driver | Drive the UI with whatever automation you have (a browser MCP server, Playwright via `bash`), or hand the user a concrete manual check. Do not claim done without observing the artifact. |
| `plugin-dev:skill-development` (Claude's SKILL.md authoring guidance) | Keep `name` + `description` frontmatter and progressive disclosure. Copilot reads the same Agent Skills format. |
| `loop` (recurring/self-paced re-invocation, used by `babysit`) | Copilot has no `loop` skill. Re-run the step yourself on a cadence. |

## Per-skill notes

Most skills need only the tables above. These need one more mapping:

| Skill | On Copilot |
|-------|------------|
| `interrogate` | The `subagent_type`/`model`/`readonly` dispatch fields map to `task`'s `agent_type`/`model`; read-only reviewers get a prompt that forbids edits. Keep the reviewer panel diverse per Model names above. |
| `setup-pstack` | The Copilot row in the Other runtimes table names the sheet path and how it loads. The role rows are identical. |
| `no-comments` | Dispatch `general-purpose` with the `comment-sicko` opening from Subagent policy above. |
| `create-verification-skill` | The generated skill lands under `.claude/skills/verify/` on Claude Code; on Copilot write it to `.github/skills/verify/`. |
| `maintain-verification-skill` | The project-local skill lives under `.github/skills/`, not `.claude/skills/`. |
| `reflect` | The transcript finder reads Claude Code's layout under `~/.claude/projects/`; Copilot keeps sessions under `~/.copilot/session-state/`. Pass the session digest step 1 allows instead. |
| `why` | List MCP servers from the tools Copilot exposes to the session, not from `.mcp.json` or `claude mcp list`. |

## Vendored scripts

`skills/poteto-mode/scripts/` ships the `watch-pr` PR watcher, the `orch` store CLI, and `worktree-audit.mjs`. They run the same on Copilot; invoke them through `bash`. They need `bun`, `gh`, and (for stack work) `gt`. `worktree-audit.mjs` reads Claude Code transcripts; point it at your runtime's transcript directory instead.

## Instructions file

Where a pstack skill says "your instructions file", on Copilot that is `.github/copilot-instructions.md` or `AGENTS.md` in the repo, plus `~/.copilot/copilot-instructions.md` globally. On Claude Code it is `CLAUDE.md`.
