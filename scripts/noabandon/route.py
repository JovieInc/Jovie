#!/usr/bin/env python3
"""Path stub so lane-fix-relay.yml resolves until the PR-2 script half merges.

The real router is not on main yet (Hyperagent thread cmwnur2vl01mi07adb14wi9if).
This branch stays a draft and is rebased after PR-2 merges, replacing this file.
The step is gated on vars.NOABANDON_ENABLED == 'true' (unset = off), so this
stub does not run on today's path. It exits 0 if invoked early.
"""
from __future__ import annotations

import sys

print(
    "noabandon.route: PR-2 script half is not on this branch yet; no-op",
    file=sys.stderr,
)
sys.exit(0)
