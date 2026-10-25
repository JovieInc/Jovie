"""Pytest session setup for the scripts/tests suite.

The structural pytest lane runs wherever the pre-push gate runs, including the
lanes host itself, whose shell exports live lane configuration (LANES_SLOTS_*,
LANES_STATE, LANES_REPO, CODEX_LANE_AUTH_MODE, CODEX_LANE_LOGIN_SLOTS, ...).
Those ambient values silently override the module constants the tests
exercise, so the same suite passes in CI and fails or hangs on a configured
host. Scrub host-injected lane config once at collection so the suite is
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

_SCRUB_PREFIXES = ("LANES_", "SYMPHONY_", "CODEX_LANE_")
_SCRUB_EXACT = {
    "LINEAR_API_KEY",
    "LINEAR_API_URL",
    "LINEAR_BACKOFF_STATE_DIR",
    "LINEAR_COOLDOWN_STATE_DIR",
    "LINEAR_COOLDOWNS",
    "LINEAR_RATE_LIMIT_BASE_S",
}


def scrub_host_lane_env(environ=None) -> None:
    """Drop host lane configuration before tests read os.environ.

    The lanes host exports CODEX_LANE_AUTH_MODE=subscription-pool and
    CODEX_LANE_LOGIN_SLOTS=5. Inherited slots make a second current-login
    lease succeed, so the metadata-reap test's assertIsNone raises inside
    reap_current_metadata. That cleanup retries the assertion until the
    pre-push gate's 30 minute timeout kills the shard.
    """
    env = os.environ if environ is None else environ
    for name in list(env):
        if name in _SCRUB_EXACT or name.startswith(_SCRUB_PREFIXES):
            env.pop(name, None)


scrub_host_lane_env()
