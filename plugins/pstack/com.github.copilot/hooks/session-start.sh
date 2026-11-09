#!/bin/sh
set -eu

COPILOT_PLUGIN_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
export COPILOT_PLUGIN_ROOT
out=$(sh "$COPILOT_PLUGIN_ROOT/hooks/session-start.sh" copilot)
[ -n "$out" ] || exit 0
# Another pstack install, such as one in ~/.agents/skills for another tool, can win the skill tool's lookup by name.
printf '%s\n' "$out" | PSTACK_ROOT="$COPILOT_PLUGIN_ROOT" awk '
  function esc(s) { gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s); return s }
  {
    root = esc(ENVIRON["PSTACK_ROOT"])
    note = "This session'"'"'s pstack is the pstack-copilot plugin in `" root "`. Another pstack copy may also be installed, for example in `~/.agents/skills` for another tool. After every `skill` call for a pstack skill, check the base directory it reports. If it is not inside `" root "`, discard that copy: never read any file under its base directory, `view` `" root "/skills/<name>/SKILL.md` next, follow only that file, and read every file it names from `" root "`.\\n"
    i = index($0, "</EXTREMELY_IMPORTANT>")
    if (i) $0 = substr($0, 1, i - 1) note substr($0, i)
    print
  }'
