"""Pytest session setup for the scripts/tests suite.

The structural pytest lane runs wherever the pre-push gate runs, including the
lanes host itself, whose shell exports live lane configuration (LANES_SLOTS_*,
LANES_STATE, LANES_REPO, CODEX_* knobs incl. CODEX_ACCOUNTS_ROOT/CODEX_LEASE_*/
CODEX_HOME, CLAUDE_LANE_*, HYPERAGENT_*, ...). Those ambient values silently
override the module constants the tests exercise, so the same suite passes in
CI and fails on a configured host (PR #22144: its first affected-coverage run
inherited live provider configuration and failed eight account/lease fixtures).
Scrub host-injected lane and provider config once at collection so the suite is
hermetic; tests that need a knob set it via patch.dict.
"""

import os
import sys
from pathlib import Path

_LANES = Path(__file__).resolve().parents[1] / "lanes"
if str(_LANES) not in sys.path:
    sys.path.insert(0, str(_LANES))
import git_housekeeping  # noqa: E402

# Git 2.55 detaches maintenance after commit. The structural lane's pytest
# process must not inherit that default, and each TemporaryDirectory must be
# private to this pid and wait out a writer before rmdir.
git_housekeeping.install_process_fixture_env()
git_housekeeping.install_isolated_tempdirs()

# Every provider-specific family the lane modules bind at import time:
# codex_lane.py (CODEX_ACCOUNTS_ROOT/CODEX_LEASE_*/CODEX_HOME/...),
# claude_lane.py (CLAUDE_LANE_*), hyperagent_lane.py (HYPERAGENT_LANE_*), and
# the host lane tuning (LANES_/SYMPHONY_). CODEX_ subsumes the old
# CODEX_LANE_/CODEX_LEDGER_ prefixes. Coverage is pinned by
# scripts/tests/test_conftest_host_isolation.py.
_SCRUB_PREFIXES = ("LANES_", "SYMPHONY_", "CODEX_", "CLAUDE_", "HYPERAGENT_")
_SCRUB_EXACT = {
    "LINEAR_API_KEY",
    "LINEAR_API_URL",
    "LINEAR_BACKOFF_STATE_DIR",
    "LINEAR_COOLDOWN_STATE_DIR",
    "LINEAR_COOLDOWNS",
    "LINEAR_RATE_LIMIT_BASE_S",
}

for _name in list(os.environ):
    if _name in _SCRUB_EXACT or _name.startswith(_SCRUB_PREFIXES):
        os.environ.pop(_name, None)
