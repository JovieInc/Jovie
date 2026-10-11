"""Pytest session setup for the scripts/tests suite.

The structural pytest lane runs wherever the pre-push gate runs, including the
lanes host itself, whose shell exports live lane configuration (LANES_SLOTS_*,
LANES_STATE, LANES_REPO, ...). Those ambient values silently override the
module constants the tests exercise, so the same suite passes in CI and fails
on a configured host. Scrub host-injected lane config once at collection so
the suite is hermetic; tests that need a knob set it via patch.dict.
"""

import os

_SCRUB_PREFIXES = ("LANES_", "SYMPHONY_")
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
