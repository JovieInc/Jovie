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


if __name__ == "__main__":
    unittest.main()
