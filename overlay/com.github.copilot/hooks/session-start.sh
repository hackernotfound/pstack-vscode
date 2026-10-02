#!/bin/sh
set -eu

sheet="${COPILOT_HOME:-$HOME/.copilot}/pstack-models.md"
if grep -qs '^session hook: off$' "$sheet"; then
  exit 0
fi

# Copilot injects only a top-level additionalContext field; plain stdout is dropped.
cat "$(cd "$(dirname "$0")" && pwd)/session-start-context.json"
