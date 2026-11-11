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


def poisoned_world(calls, prs, *, test="lib/__tests__/production-release-supersession.test.mjs", at=NOW - 600):
    """Fake gh: one failed merge group per PR in `prs`, every one failing on the same top test; nothing queued."""
    def run(args, **kwargs):
        calls.append(args)
        flat = " ".join(args)
        if "workflows/ci.yml/runs" in flat:
            rows = [] if "status=success" in flat else [
                {"id": 100 + i, "head_branch": f"gh-readonly-queue/main/pr-{pr}-abc", "conclusion": "failure",
                 "updated_at": iso(at), "head_sha": f"s{i}"} for i, pr in enumerate(prs)]
            return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"workflow_runs": rows}))
        if "mergeQueue" in flat:
            return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps(
                {"data": {"repository": {"mergeQueue": {"entries": {"nodes": []}}}}}))
        if "/jobs?per_page=100" in flat:
            jobs = [{"id": 9, "name": "ci-fast (remaining)", "conclusion": "failure", "steps": []}]
            return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"jobs": jobs}))
        if "/logs" in flat:
            return SimpleNamespace(returncode=0, stderr="", stdout=(
                f"##[error]Structural command 41/60 failed (exit 1)\nFAIL   workspace-scripts  {test} > deadline\n"))
        return SimpleNamespace(returncode=0, stderr="", stdout="{}")
    return run


class MainPoisonTest(unittest.TestCase):
    """2026-11-11: one test failing every group (an expired review deadline on an unchanged main) stalled merges 8h
    because shared evidence only released victims and remediation waits on main-red. The breaker now files one
    remediation intake per shared signal so a fix lane repairs main."""

    def setUp(self):
        sys.path.insert(0, str(ROOT / "scripts/lanes"))

    def tearDown(self):
        sys.path.remove(str(ROOT / "scripts/lanes"))

    def test_one_signal_across_three_prs_files_one_intake_once(self):
        qb, calls, filed = load_breaker(), [], []
        run = poisoned_world(calls, [24767, 24826, 24803])
        with tempfile.TemporaryDirectory() as raw:
            out = qb.sweep(Path(raw), run, NOW, file_intake=lambda _run, event: filed.append(event) or 4242)
            self.assertEqual(len(filed), 1)
            event = filed[0]
            self.assertEqual(event["source"], "merge-group-shared")
            self.assertTrue(event["fingerprint"].startswith("main-poison-"))
            self.assertEqual(event["subject"]["prs"], [24767, 24803, 24826])
            self.assertIn("production-release-supersession.test.mjs", event["evidence"]["excerpt"])
            self.assertIn("Never skip, weaken or quarantine", event["evidence"]["excerpt"])
            self.assertEqual(out["main-poison"][0]["issue"], 4242)
            self.assertNotIn("dequeuePullRequest", "\n".join(" ".join(c) for c in calls), "victims are never dequeued")
            again = qb.sweep(Path(raw), run, NOW + 60, file_intake=lambda _run, event: filed.append(event) or 1)
            self.assertEqual(len(filed), 1, "one filing per signal per window")
            self.assertNotIn("main-poison", again)

    def test_two_prs_are_not_poison(self):
        qb, filed = load_breaker(), []
        with tempfile.TemporaryDirectory() as raw:
            out = qb.sweep(Path(raw), poisoned_world([], [1, 2]), NOW, file_intake=lambda _r, e: filed.append(e))
        self.assertEqual((filed, out.get("main-poison")), ([], None))

    def test_remediation_routes_the_intake_to_a_fix_lane_not_wait(self):
        import remediation
        qb, filed = load_breaker(), []
        with tempfile.TemporaryDirectory() as raw:
            qb.sweep(Path(raw), poisoned_world([], [1, 2, 3]), NOW, file_intake=lambda _r, e: filed.append(e))
        classified = remediation.classify_event(filed[0])
        self.assertEqual(classified["cls"], "fixable-by-model")
        self.assertNotEqual(classified["next_action"], "wait")

    def test_a_filing_failure_never_breaks_the_sweep(self):
        qb = load_breaker()
        def boom(_run, _event):
            raise RuntimeError("gh down")
        with tempfile.TemporaryDirectory() as raw:
            out = qb.sweep(Path(raw), poisoned_world([], [1, 2, 3]), NOW, file_intake=boom)
        self.assertIn("gh down", out["main-poison"][0]["error"])
        self.assertEqual(out["tripped"], [])


if __name__ == "__main__":
    unittest.main()
