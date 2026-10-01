#!/bin/sh
# Live checks against Copilot CLI. tools/eval-vscode.mjs runs the same checks
# against the Copilot runtime bundled in VS Code. Needs `copilot`, `gh`, `jq`.
# Local only: it hands your gh token to an auto-approved session. Never run it in CI.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
plugin="${1:-$root/plugins/pstack}"
copilot="${COPILOT_BIN:-copilot}"
work=$(mktemp -d)
export COPILOT_HOME="$work/home"
: "${GH_TOKEN:=$(gh auth token)}"
export GH_TOKEN
fail=0

run() {
  name=$1; shift
  (cd "$work/repo" && "$copilot" --plugin-dir "$plugin" --allow-all-tools --add-dir "$plugin" \
    --excluded-tools web_fetch web_search --deny-tool 'shell(curl)' 'shell(wget)' 'shell(gh)' \
    --output-format json --log-dir "$work/logs" "$@" > "$work/$name.jsonl" 2>&1) || true
}

final() { jq -r 'select(.type=="assistant.message") | .data.content // empty' "$work/$1.jsonl"; }
calls() { jq -c 'select(.type=="tool.execution_start") | .data | {t: .toolName, a: .arguments}' "$work/$1.jsonl"; }
poteto_mode_loaded() {
  jq -s -e '
    (map(select(.type=="tool.execution_complete" and .data.success==true) | .data.toolCallId)) as $ok
    | any(.[] | select(.type=="tool.execution_start") | .data; . as $c | $c.toolName=="skill"
        and (($c.arguments | objects | .skill // "") | test("poteto-mode")) and ($ok | index([$c.toolCallId])))
  ' "$work/$1.jsonl" > /dev/null
}
subagent_in_poteto_mode() {
  jq -s -e '
    (map(select(.type=="tool.execution_complete" and .data.success==true) | .data.toolCallId)) as $ok
    | map(select(.type=="tool.execution_start") | .data) as $calls
    | any($calls[]; . as $t | $t.toolName=="task" and ($ok | index([$t.toolCallId]))
        and any($calls[]; . as $c | $c.parentToolCallId==$t.toolCallId and $c.toolName=="skill"
          and (($c.arguments | objects | .skill // "") | test("poteto-mode")) and ($ok | index([$c.toolCallId]))))
  ' "$work/$1.jsonl" > /dev/null
}

check() {
  if eval "$2"; then echo "PASS  $1"; else echo "FAIL  $1"; fail=1; fi
}

echo "copilot: $("$copilot" --version | head -1)"
mkdir -p "$work/repo" && cd "$work/repo" && git init -q
printf 'export function add(a, b) {\n  return a + b;\n}\n' > math.js
printf 'import { add } from "./math.js";\nconsole.log(add(2, 3));\n' > main.js
git add -A && git -c user.name=eval -c user.email=eval@local commit -qm init

run context -s -p 'Do not run tools. 1) Quote verbatim the sentence in your context that starts with "On GitHub Copilot, skills load". 2) Print the full enum of the agent_type parameter of your task tool, comma separated. 3) Print the number of skills available to you whose name starts with "principle-".'
check "mandate injected by sessionStart hook" 'final context | grep -q "skills load through the"'
check "pstack:poteto-agent dispatchable" 'final context | grep -q "pstack:poteto-agent"'
check "pstack:comment-sicko dispatchable" 'final context | grep -q "pstack:comment-sicko"'

run route -p 'Explain how main.js gets its output in this repo. Use poteto-mode, and delegate the code reading to one pstack subagent.'
check "poteto-mode loaded via skill tool" 'poteto_mode_loaded route'
check "no namespaced skill lookups" '! calls route | grep -q "\"skill\":\"pstack:"'
check "a subagent ran and loaded poteto-mode itself" 'subagent_in_poteto_mode route'
check "no Claude-only tool names called" '! calls route | grep -qE "\"t\":\"(Agent|Skill|Task|AskUserQuestion|TodoWrite)\""'

run auto -p 'Rename the function add to sum everywhere in this repo, keep main.js printing 5, and verify it by running it.'
check "mandate routes a multi-file change into poteto-mode unprompted" 'poteto_mode_loaded auto'
check "copilot-tools.md read during a pstack run" 'cat "$work/route.jsonl" "$work/auto.jsonl" | jq -r "select(.type==\"tool.execution_start\") | .data.arguments | objects | .path // empty" | grep -q copilot-tools.md'
check "rename landed and runs" '[ "$(cd "$work/repo" && node main.js)" = 5 ] && grep -q "function sum" "$work/repo/math.js"'

echo "transcripts: $work"
exit $fail
