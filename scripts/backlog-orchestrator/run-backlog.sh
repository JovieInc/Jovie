#!/usr/bin/env bash
set -euo pipefail
export LINEAR_API_KEY="$(cat ~/.config/symphony/linear.env | tr -d "\n\r" | sed 's/^LINEAR_API_KEY=//')"
cd "$(dirname "$0")"
exec node backlog-orchestrator.mjs "$@"
