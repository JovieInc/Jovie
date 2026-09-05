#!/usr/bin/env bash
set -euo pipefail

python3 scripts/symphony/tests/codex-account-probe.test.py
python3 scripts/symphony/tests/run-lease-gate.py
