"""Wake the enroll reconcile from the cached inventory only, rarely, and only with work to do."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import enroll_backstop as backstop

NOW = 1790860000.0
DISPATCH = ["gh", "api", "--method", "POST", "repos/JovieInc/Jovie/dispatches", "-f",
            "event_type=enroll-reconcile"]


def pr(number=1, **fields):
    return {"number": number, "headRefOid": f"{number:040x}", "isDraft": False, "isInMergeQueue": False,
            "isCrossRepository": False, "baseRefName": "main", "mergeStateStatus": "CLEAN",
            "labels": [], **fields}


class BackstopTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = Path(self.tmp.name) / "state"
        self.inventory = Path(self.tmp.name) / "open-prs-labels-v2.json"
        self.calls = []
        self.returncode = 0
        self.write([pr()])

    def write(self, prs, at=NOW - 30):
        self.inventory.write_text(json.dumps({"at": at, "value": prs}))

    def run_gh(self, args, **kwargs):
        self.calls.append(args)
        self.assertEqual(kwargs["timeout"], 10)
        return SimpleNamespace(returncode=self.returncode, stdout="", stderr="secret detail")

    def tick(self, now=NOW, hostname="gem"):
        return backstop.tick(self.state, self.inventory, hostname, run=self.run_gh, now=now)

    def test_ready_green_unqueued_pr_dispatches_one_reconcile_with_only_the_fixed_workflow(self):
        result = self.tick()
        self.assertEqual(result, {"status": "dispatch-requested", "candidates": [1]})
        self.assertEqual(self.calls, [DISPATCH])
        saved = json.loads((self.state / "enroll-backstop.json").read_text())
        self.assertEqual(saved["dispatchedAt"], NOW)
        self.assertEqual(saved["lastResult"], {"status": "dispatch-requested", "at": NOW})

    def test_required_green_states_count_and_everything_else_is_idle(self):
        rows = [pr(1, mergeStateStatus="UNSTABLE"), pr(2, mergeStateStatus="HAS_HOOKS"),
                pr(3, mergeStateStatus="BLOCKED"), pr(4, mergeStateStatus="DIRTY"),
                pr(5, mergeStateStatus="UNKNOWN"), pr(6, isDraft=True), pr(7, isInMergeQueue=True),
                pr(8, isCrossRepository=True), pr(9, baseRefName="integration/x"),
                pr(10, labels=[{"name": "Hold"}]), pr(11, labels=[{"name": "queue-poison"}]),
                pr(12, labels=[{"name": "lane-fix-red"}]), pr(13, isDraft=None)]
        self.assertEqual([row["number"] for row in backstop.candidates(rows)], [1, 2, 12])
        self.write(rows[2:11])
        self.assertEqual(self.tick(), {"status": "idle"})
        self.assertEqual(self.calls, [])

    def test_cooldown_bounds_dispatches_and_an_unchanged_set_waits_an_hour(self):
        self.tick()
        self.assertEqual(self.tick(now=NOW + 60)["status"], "cooldown")
        self.write([pr()], at=NOW + backstop.INTERVAL_S)
        self.assertEqual(self.tick(now=NOW + backstop.INTERVAL_S)["status"], "cooldown")
        self.write([pr(), pr(2)], at=NOW + backstop.INTERVAL_S)
        self.assertEqual(self.tick(now=NOW + backstop.INTERVAL_S)["status"], "dispatch-requested")
        later = NOW + backstop.INTERVAL_S + backstop.UNCHANGED_S
        self.write([pr(), pr(2)], at=later)
        self.assertEqual(self.tick(now=later)["status"], "dispatch-requested")
        self.assertEqual(len(self.calls), 3)

    def test_a_new_head_on_the_same_pr_counts_as_new_work(self):
        self.tick()
        moved = NOW + backstop.INTERVAL_S
        self.write([pr(headRefOid="f" * 40)], at=moved)
        self.assertEqual(self.tick(now=moved)["status"], "dispatch-requested")

    def test_stale_missing_or_malformed_inventory_never_dispatches(self):
        self.write([pr()], at=NOW - backstop.INVENTORY_MAX_AGE_S - 1)
        self.assertEqual(self.tick()["status"], "inventory-unavailable")
        self.inventory.write_text("{not json")
        self.assertEqual(self.tick()["status"], "inventory-unavailable")
        self.inventory.unlink()
        self.assertEqual(self.tick()["status"], "inventory-unavailable")
        self.assertEqual(self.calls, [])

    def test_the_enroll_workflow_reconciles_on_the_dispatched_event_type(self):
        workflow = (ROOT / ".github/workflows/merge-queue-green-enroll.yml").read_text()
        self.assertIn("  repository_dispatch:\n    types: [enroll-reconcile]\n", workflow)
        self.assertIn("['workflow_dispatch', 'repository_dispatch', 'schedule'].includes(context.eventName)",
                      workflow)

    def test_only_gem_dispatches(self):
        self.assertEqual(self.tick(hostname="tims-air"), {"status": "not-owner", "owner": "gem"})
        self.assertEqual(self.calls, [])

    def test_failed_dispatch_keeps_the_cooldown_and_hides_api_output(self):
        self.returncode = 1
        result = self.tick()
        self.assertEqual(result["status"], "dispatch-failed")
        self.assertNotIn("secret", json.dumps(result))
        self.assertEqual(self.tick(now=NOW + 60)["status"], "cooldown")

    def test_a_raising_gh_is_a_failed_dispatch_not_a_crash(self):
        def boom(args, **kwargs):
            raise subprocess.TimeoutExpired(args, 10)
        result = backstop.tick(self.state, self.inventory, "gem", run=boom, now=NOW)
        self.assertEqual(result["status"], "dispatch-failed")

    def test_unreadable_state_never_resets_the_budget(self):
        self.state.mkdir(parents=True)
        (self.state / "enroll-backstop.json").write_text("{broken")
        self.assertEqual(self.tick()["status"], "state-unobservable")
        (self.state / "enroll-backstop.json").write_text(
            json.dumps({"schema": backstop.SCHEMA, "dispatchedAt": NOW + 3600}))
        self.assertEqual(self.tick()["status"], "state-unobservable")
        self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
