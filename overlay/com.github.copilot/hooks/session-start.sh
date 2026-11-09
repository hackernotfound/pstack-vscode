#!/bin/sh
set -eu

COPILOT_PLUGIN_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
export COPILOT_PLUGIN_ROOT
exec sh "$COPILOT_PLUGIN_ROOT/hooks/session-start.sh" copilot
