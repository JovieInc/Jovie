"""Recover missing production workflow invocations without duplicate or false health receipts."""
import fcntl
import json
import re
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import continuity_clock as clock

NOW = 1790860000.0


def run_row(age=3600, **fields):
    return {"id": 123, "created_at": datetime.fromtimestamp(NOW-age, timezone.utc).isoformat(),
            "head_branch": "main", "event": "schedule", "status": "completed", **fields}


class ClockTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)
        self.calls = []
        self.rows = [run_row()]
        self.get_error = None
        self.post_error = None
        self.old_active = []

    def api(self, args, **kwargs):
        self.calls.append(args)
        self.assertEqual(kwargs["timeout"], 10)
        if "POST" in args:
            if self.post_error:
                raise self.post_error
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        if self.get_error:
            raise self.get_error
        rows = self.old_active if "status=in_progress" in args[-1] else self.rows
        return SimpleNamespace(returncode=0, stdout=json.dumps({"workflow_runs": rows}), stderr="")

    def tick(self, **kwargs):
        kwargs.setdefault("clocks", (clock.CONTINUITY,))
        return clock.tick(self.path, hostname="gem", run=self.api, now=NOW, **kwargs)

    def saved(self):
        return json.loads((self.path / "continuity-clock.json").read_text())

    def test_overdue_run_requests_only_fixed_workflow_main_and_does_not_claim_health(self):
        result = self.tick()
        self.assertEqual(result["status"], "dispatch-requested")
        self.assertEqual(len(self.calls), 3)
        # repository_dispatch: the Jovie Bot token lacks actions:write (workflow_dispatch 403).
        self.assertEqual(self.calls[-1], ["gh", "api", "--method", "POST",
            "repos/JovieInc/Jovie/dispatches", "-f", "event_type=clock_production_continuity"])
        self.assertEqual(self.saved()["lastResult"], result)
        self.assertNotIn("healthy", json.dumps(result))
        self.assertEqual(self.tick()["status"], "cooldown")
        self.assertEqual(len(self.calls), 3)

    def test_historical_workflow_run_trigger_does_not_block_current_clock_recovery(self):
        # PR19436 removed workflow_run, but GitHub still returns those old runs.
        self.rows = [run_row(), run_row(172800, event="workflow_run")]
        self.assertEqual(self.tick()["status"], "dispatch-requested")

    def test_recent_completed_run_needs_no_recovery_including_dispatch_event(self):
        for event in ("schedule", "workflow_dispatch", "repository_dispatch"):
            with self.subTest(event=event):
                self.rows = [run_row(30, event=event)]
                result = clock.observe(self.api, NOW)
                self.assertEqual(result["status"], "current")
        self.assertTrue(all("POST" not in call for call in self.calls))

    def test_any_active_run_prevents_duplicate_even_behind_a_newer_completed_run(self):
        for status in ("queued", "in_progress", "requested", "waiting", "pending"):
            self.rows = [run_row(), run_row(7200, status=status)]
            self.assertEqual(clock.observe(self.api, NOW)["status"], "active")
        self.assertEqual(len(self.calls), 5)

    def test_ghost_run_stuck_active_for_days_does_not_block_the_clock(self):
        # sentry-autofix-recurrence run 37655501164: "queued" since 2026-10-07, uncancellable.
        self.rows = [run_row(), run_row(6 * 86400, status="queued")]
        self.assertEqual(clock.observe(self.api, NOW)["status"], "overdue")
        self.assertEqual(self.tick()["status"], "dispatch-requested")

    def test_empty_malformed_wrong_branch_or_unexpected_run_fails_closed(self):
        for rows in ([], None, {}, [None], [run_row(head_branch="other")],
                     [run_row(event="push")], [run_row(status="unknown")],
                     [run_row(created_at="bad")], [run_row(-3600)], [run_row(id=None)]):
            self.rows = rows
            with self.subTest(rows=rows), self.assertRaises((ValueError, TypeError)):
                clock.observe(self.api, NOW)
        self.assertTrue(all("POST" not in call for call in self.calls))

    def test_running_invocation_outside_recent_window_prevents_dispatch(self):
        self.old_active = [run_row(86400, status="in_progress")]
        self.assertEqual(self.tick()["status"], "active")
        self.assertEqual(len(self.calls), 2)

    def test_unobservable_active_window_prevents_dispatch(self):
        self.old_active = None
        self.assertEqual(self.tick()["status"], "failed")
        self.assertEqual(len(self.calls), 2)

    def test_api_errors_never_dispatch_and_leave_bounded_failure_receipt(self):
        self.get_error = subprocess.TimeoutExpired("gh", 10)
        result = self.tick()
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["error"], "TimeoutExpired")
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.tick()["status"], "cooldown")

    def test_nonzero_or_invalid_json_get_fails_closed(self):
        for response in (SimpleNamespace(returncode=1, stdout="secret", stderr="secret"),
                         SimpleNamespace(returncode=0, stdout="invalid", stderr="")):
            with self.assertRaises((RuntimeError, ValueError)):
                clock.observe(lambda *a, **kw: response, NOW)

    def test_uncertain_post_is_rate_limited_and_not_replayed_by_a_new_process(self):
        self.post_error = subprocess.TimeoutExpired("gh", 10)
        self.assertEqual(self.tick()["status"], "dispatch-uncertain")
        self.assertEqual(self.saved()["nextAttemptAt"], NOW + 900)
        self.assertEqual(clock.tick(self.path, "gem", self.api, NOW+600, clocks=(clock.CONTINUITY,))["status"], "cooldown")
        self.assertEqual(len(self.calls), 3)

    def test_rejected_post_retains_uncertain_receipt_without_sensitive_output(self):
        def reject(args, **kw):
            if "POST" in args:
                return SimpleNamespace(returncode=1, stdout="secret", stderr="secret")
            return self.api(args, **kw)
        result = clock.tick(self.path, "gem", reject, NOW, clocks=(clock.CONTINUITY,))
        self.assertEqual(result["status"], "dispatch-uncertain")
        self.assertNotIn("secret", json.dumps(result))

    def test_corrupt_or_future_local_state_never_resets_the_dispatch_budget(self):
        path = self.path / "continuity-clock.json"
        for body in ("broken", "[]", json.dumps({"schema": "wrong"}),
                     json.dumps({"schema": clock.SCHEMA, "nextAttemptAt": "NaN"}),
                     json.dumps({"schema": clock.SCHEMA, "nextAttemptAt": NOW+99999})):
            path.write_text(body)
            self.assertEqual(self.tick()["status"], "state-unobservable")
            self.assertEqual(path.read_text(), body)
        self.assertEqual(self.calls, [])

    def test_other_hosts_and_contending_tick_cannot_dispatch(self):
        self.assertEqual(clock.tick(self.path / "absent", "mac", self.api, NOW)["status"], "not-owner")
        self.assertFalse((self.path / "absent").exists())
        with (self.path / "continuity-clock.lock").open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertEqual(self.tick()["status"], "busy")
        self.assertEqual(self.calls, [])

    def test_disk_denial_still_checks_production_without_launching_workers(self):
        import lane_runner as lane
        with patch.object(lane.disk_guard, "check", return_value={"admitted": False}), \
             patch.object(lane.continuity_clock, "tick", return_value={"status": "current"}) as probe, \
             patch.object(lane.doctor, "run"), patch.object(lane.subprocess, "Popen") as spawn:
            host = lane.Host(state=self.path, repo=self.path)
            self.assertEqual(lane.dispatch(host), 1)
            probe.assert_called_once_with(self.path, lane.HOST)
            spawn.assert_not_called()
            self.assertEqual(json.loads((self.path / "tick.json").read_text())["continuity"], {"status": "current"})

    def test_clock_error_does_not_prevent_existing_doctor_receipt(self):
        import lane_runner as lane
        with patch.object(lane.continuity_clock, "tick", side_effect=OSError("secret")), \
             patch.object(lane.doctor, "run") as doctor:
            self.assertEqual(lane.finish_dispatch(lane.Host(state=self.path, repo=self.path), {"error": None}), 0)
            doctor.assert_called_once()
            receipt = json.loads((self.path / "tick.json").read_text())
            self.assertEqual(receipt["continuity"], {"status": "failed", "error": "OSError"})


class CadenceClocksTest(unittest.TestCase):
    """GitHub delivered sub-daily crons about every 6 h; the tick drives each cadence."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)
        self.calls = []
        self.age = {}

    def api(self, args, **kwargs):
        self.calls.append(args)
        if "POST" in args:
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        if "status=in_progress" in args[-1]:
            return SimpleNamespace(returncode=0, stdout=json.dumps({"workflow_runs": []}), stderr="")
        workflow = args[-1].split("/workflows/", 1)[1].split("/", 1)[0]
        event = "push" if workflow == "runner-heartbeat.yml" else "schedule"
        rows = [run_row(self.age.get(workflow, 21600), event=event)]
        return SimpleNamespace(returncode=0, stdout=json.dumps({"workflow_runs": rows}), stderr="")

    def posts(self):
        return [call[-1] for call in self.calls if "POST" in call]

    @unittest.skipUnless((ROOT / ".github/workflows").is_dir(), "release trees carry no workflows")
    def test_each_workflow_has_a_listening_trigger_and_a_kept_backstop_cron(self):
        # Plain text, no PyYAML: the Gem release self-test runs this file too.
        self.assertEqual(len({c.event_type for c in clock.CLOCKS}), len(clock.CLOCKS))
        for c in clock.CLOCKS:
            with self.subTest(workflow=c.workflow):
                text = (ROOT / ".github/workflows" / c.workflow).read_text()
                self.assertIn(f"  repository_dispatch:\n    types: [{c.event_type}]\n", text)
                self.assertEqual(text.count("repository_dispatch:"), 1)
                self.assertIn("  schedule:\n", text, "the GitHub cron stays as a backstop")
                # A job gated to the schedule must also run on the clock event; only the
                # heartbeat's own schedule-only dispatch job is exempt.
                for condition in re.findall(r"^    if: (.*)$", text, re.MULTILINE):
                    if "'schedule'" in condition and "github.event_name == 'schedule'" != condition:
                        self.assertIn("'repository_dispatch'", condition)

    def test_stale_workflows_are_dispatched_once_on_their_own_intervals(self):
        result = clock.tick(self.path, "gem", self.api, NOW)
        self.assertEqual(result["status"], "dispatch-requested")
        self.assertEqual(set(result["clocks"]), {c.name for c in clock.CLOCKS[1:]})
        self.assertEqual(sorted(self.posts()), sorted(f"event_type={c.event_type}" for c in clock.CLOCKS))
        self.calls.clear()
        # Five minutes later only the five-minute continuity clock is due again.
        clock.tick(self.path, "gem", self.api, NOW + 290)
        self.assertEqual(self.posts(), ["event_type=clock_production_continuity"])
        self.calls.clear()
        clock.tick(self.path, "gem", self.api, NOW + 600)
        self.assertEqual(sorted(self.posts()), sorted([
            "event_type=clock_production_continuity", "event_type=clock_runner_heartbeat",
            "event_type=clock_runner_health_monitor"]))

    def test_a_fresh_run_from_any_trigger_skips_its_dispatch(self):
        self.age = {"runner-heartbeat.yml": 30, "cost-anomaly-gate.yml": 120}
        result = clock.tick(self.path, "gem", self.api, NOW)
        self.assertEqual(result["clocks"]["runnerHeartbeat"]["status"], "current")
        self.assertEqual(result["clocks"]["costAnomaly"]["status"], "current")
        self.assertNotIn("event_type=clock_runner_heartbeat", self.posts())

    def test_one_broken_clock_state_leaves_the_others_running(self):
        (self.path / "cost-anomaly-clock.json").write_text("broken")
        result = clock.tick(self.path, "gem", self.api, NOW)
        self.assertEqual(result["clocks"]["costAnomaly"]["status"], "state-unobservable")
        self.assertEqual(result["clocks"]["sentryRecurrence"]["status"], "dispatch-requested")
        self.assertNotIn("event_type=clock_cost_anomaly_gate", self.posts())

    def test_other_hosts_dispatch_nothing(self):
        self.assertEqual(clock.tick(self.path, "mac", self.api, NOW)["status"], "not-owner")
        self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
