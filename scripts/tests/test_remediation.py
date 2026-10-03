"""Symphony central remediation: classifier, router, ladder, caps, intake (JOV-7540)."""
from __future__ import annotations

import importlib.util
import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault("LANES_EXECUTION_BACKEND", "local-test")


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/lanes/{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


remediation = load("remediation")

HEAD = "7cf5b07"
NOW = 2_000_000_000.0


def checks(n=1, conclusion="SUCCESS", status="COMPLETED", name="ci"):
    return [{"name": f"{name}-{i}" if n > 1 else name, "status": status, "conclusion": conclusion}
            for i in range(n)]


def pr(**extra):
    base = {"number": 1, "headRefOid": HEAD, "isDraft": False, "mergeStateStatus": "CLEAN",
            "labels": [], "statusCheckRollup": checks(3), "autoMergeRequest": None}
    base.update(extra)
    return base


def providers():
    return {
        "devin": {"enabled": True, "tier": 0},
        "codex": {"enabled": True, "tier": 1},
        "claude": {"enabled": False, "tier": 2},
        "hyperagent": {"enabled": False, "tier": 3},
        "grok": {"enabled": False, "tier": 4},
        "kimi": {"enabled": False, "tier": 5},
        "host-local": {"enabled": True, "tier": 6},
    }


class ClassifierFixtureTest(unittest.TestCase):
    def test_stuck_pr_fixtures(self):
        ready = pr(number=20079, statusCheckRollup=checks(39))
        self.assertEqual(remediation.classify_blocker(ready, {"sha": "ed4d35e", "reason": "fix-exhausted"})["cls"], "ready")
        self.assertEqual(remediation.classify_blocker(ready)["next_action"], "arm")

        dirty = pr(number=20074, mergeStateStatus="DIRTY", labels=[{"name": "lane-fix-exhausted"}],
                   conflictFiles=["src/a.ts", "src/b.ts"],
                   reviewThreads=[{"resolved": False, "bot": True, "severity": "CRITICAL",
                                   "body": "PublicationStorySchema id required", "author": "sentry[bot]"},
                                  {"resolved": False, "bot": True, "severity": "HIGH",
                                   "body": "summary-vs-bullet removed"}])
        classified = remediation.classify_blocker(dirty)
        self.assertEqual((classified["cls"], classified["subtype"]), ("needs-rebase", "semantic"))
        self.assertTrue(any("bot review" in line for line in classified["evidence"]))

        strategy = pr(number=20062, isDraft=True, labels=[{"name": "hold"}], files=["canon/strategy/theses.md"],
                      reviewThreads=[{"resolved": False, "bot": True, "body": "supersededBy cycle"}])
        self.assertEqual(remediation.classify_blocker(strategy)["cls"], "needs-human-decision")

        rebase = pr(number=20035, mergeStateStatus="DIRTY",
                    labels=[{"name": "lane-fix-conflict"}, {"name": "lane-fix-exhausted"}, {"name": "queue-poison"}])
        self.assertEqual(remediation.classify_blocker(rebase)["cls"], "needs-rebase")

        failing = pr(number=20020, isDraft=True, labels=[{"name": "lane-fix-red"}, {"name": "lane-fix-exhausted"}],
                     statusCheckRollup=[{"name": "component-ship-gate", "status": "COMPLETED", "conclusion": "FAILURE",
                                         "excerpt": "missing LibraryFilesPanel.stories.tsx"}])
        fixable = remediation.classify_blocker(failing, None, {"count": 2, "pushed": False, "sha": HEAD})
        self.assertEqual(fixable["cls"], "fixable-by-model")
        self.assertTrue(any("did not move the head" in line for line in fixable["evidence"]))

        waiting = pr(number=19776, mergeStateStatus="BLOCKED",
                     labels=[{"name": "lane-fix-exhausted"}, {"name": "queue-poison"}],
                     statusCheckRollup=checks(2) + [{"name": "Exact-head Coverage", "status": "IN_PROGRESS", "conclusion": ""}])
        self.assertEqual(remediation.classify_blocker(waiting)["subtype"], "awaiting")

        held = pr(number=18985, labels=[{"name": "hold"}, {"name": "queue-poison"}],
                  holdNote={"author": "itstimwhite",
                            "body": "use computeRatePercent from @/lib/analytics/metrics and remove hold"})
        human = remediation.classify_blocker(held)
        self.assertEqual((human["cls"], human["subtype"]), ("fixable-by-model", "human-hold"))

    def test_lockfile_only_and_main_red_and_events(self):
        lock = pr(mergeStateStatus="DIRTY", conflictFiles=["pnpm-lock.yaml"])
        self.assertEqual(remediation.classify_blocker(lock)["subtype"], "lockfile-only")
        overlap = pr(statusCheckRollup=[{"name": "CI", "status": "COMPLETED", "conclusion": "FAILURE"}])
        main = [{"name": "CI", "conclusion": "FAILURE"}]
        self.assertEqual(remediation.classify_blocker(overlap, main_rollup=main)["subtype"], "main-red")
        event = remediation.classify_event({"source": "pr", "pr": overlap, "main_rollup": main})
        self.assertEqual(event["cls"], "main-red")
        self.assertEqual(remediation.classify_event({"source": "main-ci", "main_red": True, "evidence": {}})["cls"], "main-red")
        scheduled = remediation.classify_event({"source": "schedule", "evidence": {"excerpt": "runner has been lost"}})
        self.assertEqual(scheduled["cls"], "flaky-infra")
        self.assertEqual(remediation.classify_event({"source": "deploy", "evidence": {"excerpt": "prod"}})["cls"],
                         "fixable-by-model")
        self.assertEqual(remediation.classify_event({"source": "sentry", "evidence": {}})["subtype"], "sentry")


class DoctorAndIntakeTest(unittest.TestCase):
    def test_doctor_blocks_count_classes_and_alert(self):
        snapshot = {"classified": [{"pr": 1, "cls": "ready"}, {"pr": 2, "cls": "needs-human-decision"}],
                    "escalating": [2], "ladderExhausted": [3],
                    "surfaced": [{"pr": 3, "cls": "needs-human-decision", "reason": "ladder-exhausted"}],
                    "attempts": [{"pr": 2, "at": NOW - 10, "lane": "codex"}],
                    "bySource": {"pr": 2, "sentry": 1}, "routedByLane": {"codex": 1},
                    "failovers": [{"at": NOW - 5, "reason": "404"}]}
        report = remediation.escalation_summary(snapshot, [], NOW)
        self.assertEqual(report["by_class"]["ready"], 1)
        self.assertEqual(report["escalating"], 1)
        self.assertEqual(report["ladder_exhausted"], 1)
        self.assertEqual(report["attempts24h"], 1)
        self.assertEqual(report["surfaced"][0]["pr"], 3)
        remediation_report = remediation.remediation_summary(snapshot, [], NOW)
        self.assertEqual(remediation_report["by_source"]["sentry"], 1)
        self.assertEqual(remediation_report["failovers24h"], 1)
        self.assertIn("#3", remediation.alert_reason(report))
        self.assertIsNone(remediation.alert_reason(remediation.empty_escalation()))

    def test_non_pr_events_fingerprint_and_claim_window(self):
        deploy = remediation.non_pr_event("deployment_status", {
            "deployment_status": {"state": "failure", "description": "boom", "created_at": "2026-10-02T00:00:00Z"},
            "deployment": {"environment": "production", "sha": "abc"}})
        self.assertEqual(deploy["source"], "deploy")
        self.assertEqual(deploy["ws"], "release-deploy")
        self.assertIsNone(remediation.non_pr_event("deployment_status", {"deployment_status": {"state": "success"}}))
        sentry = remediation.non_pr_event("repository_dispatch", {"action": "sentry-issue",
                                                                 "client_payload": {"issue_id": "99", "title": "x"}})
        self.assertEqual(sentry["ws"], "reliability")
        again = remediation.event_from_sentry({"issue_id": "99", "title": "x"})
        self.assertEqual(sentry["fingerprint"], again["fingerprint"])
        self.assertTrue(remediation.claim_open(NOW - 60, NOW))
        self.assertFalse(remediation.claim_open(NOW - remediation.CLAIM_WINDOW_S - 1, NOW))
        plan = remediation.linear_intake_plan(sentry)
        self.assertIn("remediation", plan["labels"])
        self.assertIn("agent-ready", plan["labels"])
        self.assertIn("ws:reliability", plan["labels"])
        self.assertIsNone(remediation.non_pr_event("workflow_run", {"workflow_run": {
            "event": "pull_request", "conclusion": "failure", "pull_requests": [{"number": 1}]}}))

if __name__ == "__main__":
    unittest.main()
