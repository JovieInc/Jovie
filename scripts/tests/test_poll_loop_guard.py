"""Deterministic poll-loop guard (JOV-13142; evidence JOV-12867 / JOV-13097 / JOV-13142).

A gem lane polling GitHub on a flat sleep beat is the measured top user-token core
burner (the 2026-11-19 doctor read 87% against the planned core floor; JOV-13097's
flat 2-min verify poll was the single worst offender). This test fails when a lane
script adds an unconditional polling loop: a constant-condition `while` whose body
sleeps on an argument that is not bounded by the repo's `min(...)` convention
(deadline-capped or backoff-capped; see hyperagent_repair.py verify and
factory_watchdog.py). Naturally bounded shapes (`while clock < deadline`,
`for _ in range(n)`) are never flagged. The registry below is the reviewed set of
pre-existing flat beats (local lock contention, lease waits, the HUD refresh): a
file growing past its count, or any other lane file's first flat loop, is red until
the sleep is bounded or the entry is deliberately raised in review.
"""
from __future__ import annotations

import ast
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LANES = ROOT / "scripts/lanes"

FLAT_POLL_BASELINE = {
    "codex_lane.py": 3,   # local account-lease waits + rotate pause; no gh calls
    "hud.py": 1,          # HUD remote refresh thread; gh reads are REFRESH_GITHUB_S-gated
    "lane_runner.py": 2,  # gate-seat contention wait; local file locks only
}


def flat_sleeps(source: str) -> list[tuple[int, str]]:
    """(line, sleep-argument source) for every unbounded sleep in a constant-condition while."""
    seen: set[int] = set()
    found: list[tuple[int, str]] = []
    for node in ast.walk(ast.parse(source)):
        if not (isinstance(node, ast.While) and isinstance(node.test, ast.Constant)
                and bool(node.test.value)):
            continue
        for inner in ast.walk(node):
            if (isinstance(inner, ast.Call)
                    and (getattr(inner.func, "attr", None) == "sleep"
                         or getattr(inner.func, "id", None) == "sleep")
                    and inner.args and inner.lineno not in seen):
                source_arg = ast.unparse(inner.args[0])
                if "min(" not in source_arg:
                    seen.add(inner.lineno)
                    found.append((inner.lineno, source_arg))
    return found


class PollLoopGuard(unittest.TestCase):
    def test_no_lane_adds_an_unconditional_polling_loop(self):
        offenders = []
        for path in sorted(LANES.glob("*.py")):
            try:
                flat = flat_sleeps(path.read_text())
            except SyntaxError as error:  # a lane file the runner cannot parse is itself red
                offenders.append(f"{path.name}: unparseable ({error})")
                continue
            allowed = FLAT_POLL_BASELINE.get(path.name, 0)
            if len(flat) > allowed:
                for line, arg in flat:
                    offenders.append(f"{path.name}:{line} sleeps on `{arg}` with no bound")
        self.assertEqual(
            offenders, [],
            "unconditional polling loop(s) added to gem lanes (JOV-13142): bound the sleep with the "
            "repo's min(...) convention (deadline-capped like hyperagent_repair.verify, or backoff "
            "like its 2->4->8->15-min poll), or if the loop is genuinely local-only (no gh/API calls), "
            "raise the reviewed FLAT_POLL_BASELINE entry in this file with a comment saying why.")

    def test_the_guard_flags_a_flat_beat_and_passes_a_bounded_one(self):
        flat = "while True:\n    checks = read()\n    time.sleep(POLL_S)\n"
        bounded = ("deadline = now() + WAIT\nwhile True:\n    if now() >= deadline:\n"
                   "        return\n    time.sleep(min(poll_s, deadline - now()))\n    poll_s = min(poll_s * 2, 900)\n")
        self.assertEqual(flat_sleeps(flat), [(3, "POLL_S")])
        self.assertEqual(flat_sleeps(bounded), [])

    def test_a_conditional_while_and_a_for_range_poll_are_not_flagged(self):
        conditional = "while now() < deadline:\n    time.sleep(30)\n"
        ranged = "for _ in range(5):\n    time.sleep(30)\n"
        self.assertEqual(flat_sleeps(conditional), [])
        self.assertEqual(flat_sleeps(ranged), [])


if __name__ == "__main__":
    unittest.main()
