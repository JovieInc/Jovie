"""Regression tests for scripts/lanes/queue_breaker.py (per-PR merge-group failure breaker).

Run with:
    python3 -m pytest scripts/tests/test_queue_breaker.py -v

Breaker-only cases; the sentinel-level wiring lives in test_throughput_sentinel.py.
"""
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
NOW = 1_800_000_000.0


def iso(epoch):
    import datetime
    return datetime.datetime.fromtimestamp(epoch, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_breaker():
    spec = importlib.util.spec_from_file_location("queue_breaker", ROOT / "scripts/lanes/queue_breaker.py")
    qb = importlib.util.module_from_spec(spec)
    sys.modules["queue_breaker"] = qb
    spec.loader.exec_module(qb)
    return qb


def queued_world(calls, *, number, head="a" * 40, green_at=None, failures=(), head_since=NOW - 4000):
    """Fake gh: two window failures + one green run for `number`, PR queued on head."""
    def run(args, **kwargs):
        calls.append(args)
        flat = " ".join(args)
        if "branch=main" in flat:
            return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"workflow_runs": []}))
        if "workflows/ci.yml/runs" in flat:
            if "status=success" in flat:
                rows = [{"id": 31, "head_branch": f"gh-readonly-queue/main/pr-{number}-abc",
                         "conclusion": "success", "updated_at": iso(green_at)}] if green_at else []
            else:
                rows = [{"id": 10 + i, "head_branch": f"gh-readonly-queue/main/pr-{number}-{kind}",
                         "conclusion": "failure", "updated_at": iso(at), "head_sha": f"s{i}"}
                        for i, (at, kind) in enumerate(failures)]
            return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"workflow_runs": rows}))
        if "mergeQueue" in flat:
            node = {"state": "AWAITING_CHECKS", "pullRequest": {"id": "PR_X", "number": number, "headRefOid": head}}
            return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps(
                {"data": {"repository": {"mergeQueue": {"entries": {"nodes": [node]}}}}}))
        if "/commits/" in flat:
            return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps(
                {"commit": {"committer": {"date": iso(head_since)}}}))
        if "/pulls/" in flat:
            return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps(
                {"state": "open", "head": {"sha": head}, "labels": [{"name": "lane-fix-red"}]}))
        if "/jobs?per_page=100" in flat:
            jobs = [{"id": 9, "name": "Unit Tests (3/10)", "conclusion": "failure", "steps": []}]
            return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"jobs": jobs}))
        if "/logs" in flat:
            return SimpleNamespace(returncode=0, stderr="", stdout="x\n##[error]FAIL tests/unit/a.test.ts > x\n")
        return SimpleNamespace(returncode=0, stderr="", stdout="{}")
    return run


class QueueBreakerSupersessionTest(unittest.TestCase):
    """JOV-8492: a failure a later green merge-group run superseded is no evidence (that tree
    already passed); it neither trips the breaker nor sustains a re-block. A genuinely red head
    keeps failing after its latest green and is still tripped and held."""

    def test_failures_a_later_green_run_superseded_never_trip_or_reblock(self):
        qb = load_breaker()
        calls = []
        run = queued_world(calls, number=24694, green_at=NOW - 120,
                           failures=((NOW - 600, "abc"), (NOW - 900, "def")))
        with tempfile.TemporaryDirectory() as raw:
            out = qb.sweep(Path(raw), run, NOW)
            self.assertEqual((out["tripped"], out["reblocked"], out["errors"]), ([], [], []))
            flat = "\n".join(" ".join(c) for c in calls)
            self.assertNotIn("dequeuePullRequest", flat)
            self.assertNotIn("labels[]=", flat, "a superseded red never re-applies the hold")
            # A saved trip record from before that green is released, not re-blocked: the label
            # it applied is taken back and never re-applied, and the PR is forgotten.
            (Path(raw) / qb.STATE_FILE).write_text(json.dumps(
                {"24694": {"head": "a" * 40, "at": NOW - 200, "check": {"job": "CI"}}}))
            calls.clear()
            again = qb.sweep(Path(raw), run, NOW)
            self.assertEqual(again.get("released-superseded"), [24694])
            self.assertEqual(again["reblocked"], [])
            flat = "\n".join(" ".join(c) for c in calls)
            self.assertTrue(any("issues/24694/labels/lane-fix-red" in " ".join(c)
                                and "DELETE" in c for c in calls), "the breaker takes its own label back")
            self.assertNotIn("labels[]=", flat)
            self.assertEqual(json.loads((Path(raw) / qb.STATE_FILE).read_text()), {})

    def test_failures_after_the_latest_green_still_trip(self):
        qb = load_breaker()
        calls = []
        run = queued_world(calls, number=23471, green_at=NOW - 2000,
                           failures=((NOW - 600, "abc"), (NOW - 900, "def")))
        with tempfile.TemporaryDirectory() as raw:
            out = qb.sweep(Path(raw), run, NOW)
            self.assertEqual(out["tripped"], [23471])
            flat = "\n".join(" ".join(c) for c in calls)
            self.assertIn("dequeuePullRequest", flat)
            self.assertIn("lane-fix-red", flat)


if __name__ == "__main__":
    unittest.main()
