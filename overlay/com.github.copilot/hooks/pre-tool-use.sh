#!/bin/sh
# VS Code denies the tool call when this hook exits non-zero, so every path exits 0.
COPILOT_PLUGIN_ROOT=$(cd "$(dirname "$0")/../.." 2>/dev/null && pwd) || exit 0
export COPILOT_PLUGIN_ROOT
sh "$COPILOT_PLUGIN_ROOT/hooks/pre-tool-use.sh" || true
exit 0
