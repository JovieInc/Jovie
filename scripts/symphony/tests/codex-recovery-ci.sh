#!/usr/bin/env bash
set -euo pipefail

python3 scripts/symphony/tests/run-priority-proof-gate.py
python3 scripts/symphony/tests/codex-account-probe.test.py
python3 scripts/symphony/tests/run-lease-gate.py
python3 scripts/symphony/tests/run-model-state-gate.py
python3 scripts/symphony/tests/run-provider-promotion-gate.py
python3 scripts/symphony/tests/run-issue-lease-gate.py
python3 scripts/symphony/tests/run-frozen-generation-transition-gate.py
python3 scripts/symphony/tests/run-codex-rotate-gate.py
python3 scripts/symphony/tests/run-reconciler-gate.py
python3 scripts/symphony/tests/run-pr-discovery-gate.py
