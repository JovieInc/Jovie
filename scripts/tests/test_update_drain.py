"""Drain gate admission while a lanes update waits (install lag p50 22 min, p95 215 min on Gem)."""
import json
import sys
import tempfile
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import lane_runner as lane  # noqa: E402
import doctor  # noqa: E402
import doctor_sweep_hold  # noqa: E402
import lifecycle  # noqa: E402
import update_drain as drain  # noqa: E402
import worktree_sweep as sweeper  # noqa: E402


def iso(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class UpdateDrainTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = Path(self.tmp.name)
        self.host = lane.Host(state=self.state, repo=self.state)
        (self.state / "runs").mkdir()

    def pending(self, behind_s, commit="c" * 40):
        (self.state / "update.json").write_text(json.dumps({"behindS": behind_s, "behindCommit": commit}))

    def hold_all_seats(self):
        seats = []
        for index in range(self.host.gate_slots):
            seat = lane.Locked(self.state / "slots" / f"gate.{index}.lock", blocking=False)
            self.assertTrue(seat.held)
            seats.append(seat)
        return seats

    def test_inactive_until_the_update_has_waited_past_the_threshold(self):
        for update in ({}, {"behindS": 0, "behindCommit": None}, {"behindS": drain.UPDATE_DRAIN_AFTER_S - 1, "behindCommit": "c"},
                       {"behindS": 9999, "behindCommit": None}):
            (self.state / "update.json").write_text(json.dumps(update))
            self.assertFalse(drain.status(self.state)["active"], update)
        self.assertFalse((self.state / "update-drain.json").exists())
        self.pending(drain.UPDATE_DRAIN_AFTER_S + 1)
        armed = drain.status(self.state)
        self.assertEqual((armed["active"], armed["reason"]), (True, "update-pending-drain"))
        self.assertEqual(armed["boundS"], drain.BOUND_DEFAULT_S)

    def test_new_gate_admission_waits_but_a_busy_gate_plus_pending_update_installs_within_the_bound(self):
        self.pending(700)
        seats = self.hold_all_seats()  # in-flight gate runs hold every seat
        bound = drain.status(self.state)["boundS"]
        started = json.loads((self.state / "update-drain.json").read_text())["startedAt"]
        # New gate runs are refused while draining, so they cannot re-take a seat the proof is waiting for.
        with self.assertRaises(lifecycle.AdmissionHeld) as refused:
            with lane.gate_admission(self.host):
                pass
        self.assertEqual(str(refused.exception), lane.UPDATE_DRAIN_REASON)
        # Update ticks every 60 simulated seconds; the in-flight runs finish at +300 s.
        installed_at = None
        for tick in range(0, bound + 60, 60):
            if tick == 300:
                for seat in seats:
                    seat.release()
                seats = []
            try:
                with lane.gate_admission(self.host, staging=True):
                    installed_at = tick
                    break
            except lifecycle.AdmissionHeld as held:
                self.assertIn(str(held), {"release-proof-gate-active", "gate-admission-busy"})
        self.assertEqual(installed_at, 300)
        self.assertLessEqual(installed_at, bound)
        self.assertGreater(started, 0)

    def test_drain_expires_at_the_bound_so_lanes_are_never_starved(self):
        self.pending(700)
        first = drain.status(self.state, now=1000.0)
        self.assertTrue(first["active"])
        self.assertTrue(drain.status(self.state, now=1000.0 + first["boundS"] - 1)["active"])
        expired = drain.status(self.state, now=1000.0 + first["boundS"] + 1)
        self.assertEqual((expired["active"], expired["reason"]), (False, "drain-expired"))
        # Admission resumes for real callers: the marker is expired, so gate_admission no longer refuses.
        marker = json.loads((self.state / "update-drain.json").read_text())
        self.assertTrue(marker["expired"])
        with lane.gate_admission(self.host):
            pass

    def test_installing_records_the_drain_duration_and_clears_it(self):
        self.pending(700)
        armed = drain.status(self.state, now=2000.0)
        self.assertIsNone(drain.finish(self.state, 650, now=2100.0), "still behind: keep draining")
        row = drain.finish(self.state, 0, now=2000.0 + 420)
        self.assertEqual((row["outcome"], row["durationS"], row["commit"]), ("installed", 420, armed["commit"]))
        self.assertFalse((self.state / "update-drain.json").exists())
        [logged] = [json.loads(line) for line in (self.state / "update-drain.jsonl").read_text().splitlines()]
        self.assertEqual(logged["durationS"], 420)
        self.assertIsNone(drain.finish(self.state, 0), "nothing left to record")

    def test_expired_drain_that_later_installs_is_labelled(self):
        self.pending(700)
        armed = drain.status(self.state, now=3000.0)
        drain.status(self.state, now=3000.0 + armed["boundS"] + 5)
        row = drain.finish(self.state, 0, now=3000.0 + armed["boundS"] + 100)
        self.assertEqual(row["outcome"], "expired-then-installed")

    def test_bound_is_the_measured_p95_run_length_clamped(self):
        self.assertEqual(drain.drain_bound_s(self.state), drain.BOUND_DEFAULT_S)  # no ledger
        base = 1_800_000_000
        with open(self.state / "runs" / "ledger.jsonl", "w") as out:
            for index in range(40):
                minutes = 30 + index  # 30..69 minutes
                out.write(json.dumps({"gateWaitS": 0, "startedAt": iso(base), "endedAt": iso(base + minutes * 60)}) + "\n")
            out.write(json.dumps({"verdict": "x", "startedAt": iso(base), "endedAt": iso(base + 99999)}) + "\n")  # not gated
        self.assertEqual(drain.drain_bound_s(self.state), 67 * 60)
        with open(self.state / "runs" / "ledger.jsonl", "w") as out:
            for _ in range(30):
                out.write(json.dumps({"gateWaitS": 0, "startedAt": iso(base), "endedAt": iso(base + 5 * 60)}) + "\n")
        self.assertEqual(drain.drain_bound_s(self.state), drain.BOUND_MIN_S)


class SingleFlightUpdateTest(unittest.TestCase):
    def test_a_second_update_exits_without_running_or_touching_update_json(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            (host.state / "update.json").write_text('{"ok": false, "marker": "first"}')
            first = lane.Locked(host.state / "locks" / "update.lock", blocking=False)
            self.assertTrue(first.held)
            try:
                with patch.object(lane, "install_release") as install, \
                        patch.object(lane, "refresh_object_mirror") as mirror:
                    self.assertEqual(lane.update(host), 0)
                install.assert_not_called()
                mirror.assert_not_called()
                self.assertEqual(json.loads((host.state / "update.json").read_text())["marker"], "first")
            finally:
                first.release()
            # Once the first updater is done the lock is free again and update runs.
            with patch.object(lane, "install_release", return_value=0) as install, \
                    patch.object(lane, "refresh_object_mirror", return_value={"status": "x"}), \
                    patch.object(lane, "refresh_codex_skills", return_value={"status": "x"}):
                self.assertEqual(lane.update(host), 0)
            install.assert_called_once()
            self.assertTrue(json.loads((host.state / "update.json").read_text())["ok"])


class HoldLedgerRegressionTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name).resolve()
        self.repo = self.root / "repo"
        (self.repo / ".git").mkdir(parents=True)
        self.state = self.root / "state"
        self.state.mkdir()
        self.path = self.root / "checkout"
        self.path.mkdir()
        self.stamp = self.state / sweeper.SWEEP_REPORT
        self.row = {"name": "checkout", "path": str(self.path), "reason": "fixture-hold"}

    def sweep(self, *, inventory_error=None, **kwargs):
        with patch.object(sweeper, "live_paths", return_value=set()), patch.object(
            sweeper, "linked_worktrees", return_value=[(self.path, "branch")], side_effect=inventory_error,
        ):
            return sweeper.sweep([self.repo], [self.root], [], state=self.state,
                                 run=lambda *_args, **_kwargs: None, **kwargs)

    def truncated(self):
        clock = iter([0.0, 100.0])
        return self.sweep(budget_s=60, clock=lambda: next(clock))

    def test_sweep_uses_verified_owner_after_ordinary_mutations_and_only_daily(self):
        linear = Mock()
        key = doctor_sweep_hold.KEY
        tracker = Mock()
        tracker.close.side_effect = lambda *_: actions.append("close") or True
        tracker.open.side_effect = lambda *_: actions.append("open") or "new-ordinary"
        tracker.last_writing_report = None
        actions = []
        right = {"id": "canonical", "identifier": "JOV-14452", "team": {"key": "JOV"}}
        matches, comments = [{**right, "identifier": "JOV-6"}], []
        def gql(query, variables):
            if "commentCreate" in query:
                self.assertIn("doNotSubscribeToIssue:true", query)
                comments.append(variables)
                actions.append("note")
                return {"commentCreate": {"success": True}}
            self.assertIn("number:{eq:$n}", query)
            self.assertEqual(variables["n"], 14452)
            return {"issues": {"nodes": matches}}
        linear.gql.side_effect = gql
        def run(now, prior, ordinary):
            def deliver(text):
                return doctor_sweep_hold.note(linear, "gem", self.state, now, text, ["checkout"])
            return doctor.reconcile({**ordinary, key: "held"}, prior, tracker, now, sweep_delivery=deliver)

        state = {"issues": {key: {"id": "wrong-cached", "closedAt": None},
                             "old-ordinary": {"id": "ordinary", "closedAt": None}}}
        state = run(1000, state, {"new-ordinary": "genuine"})
        self.assertEqual(actions, ["open", "close"])
        self.assertIsNone(state["issues"][key]["id"])
        self.assertEqual(comments, [])
        matches[:] = [right]
        state = run(1001, state, {"new-ordinary": "genuine", "next-ordinary": "also genuine"})
        self.assertEqual(actions, ["open", "close", "open", "note"])
        self.assertEqual(state["issues"][key]["id"], "canonical")
        ordinary = {"new-ordinary": "genuine", "next-ordinary": "also genuine"}
        cleared = doctor.reconcile(ordinary, state, tracker, 1002)
        state = run(4600, cleared, ordinary)
        self.assertEqual(state["issues"][key]["pendingAction"], "note")
        state = run(87_400, state, ordinary)
        self.assertEqual(state["issues"][key]["pendingAction"], "note")
        state = run(87_401, state, ordinary)
        self.assertNotIn("pendingAction", state["issues"][key])
        self.assertEqual([comment["id"] for comment in comments], ["canonical", "canonical"])
        linear.comment.assert_not_called()
        linear.move.assert_not_called()

    def test_launch_preserves_previous_hold_report(self):
        report = {"startedAt": 5, "secretHeld": [self.row]}
        self.stamp.write_text(json.dumps(report))
        with patch.object(sweeper.subprocess, "Popen"):
            self.assertEqual(sweeper.maybe_spawn(self.state, self.repo, 50, now=10_000), "spawned")
            self.assertEqual(sweeper.maybe_spawn(self.state, self.repo, 50, now=10_001), "not-due")
        self.assertEqual(json.loads(self.stamp.read_text()), report)

    def test_unvisited_busy_and_unreadable_checkouts_remain_held(self):
        missing = {**self.row, "path": str(self.root / "missing")}
        self.stamp.write_text(json.dumps({"secretHeld": [self.row, missing]}))
        self.assertEqual(self.truncated()["secretHeld"], [self.row])
        keep = self.path / ".sweep-keep"
        keep.touch()
        self.assertEqual(self.sweep()["secretHeld"], [self.row])
        keep.unlink()
        with patch.object(sweeper, "inspect", side_effect=OSError("inspection fixture")):
            self.assertEqual(self.sweep()["secretHeld"], [self.row])
        with patch.object(sweeper, "inspect", return_value={"activity": 100, "dirty": 0, "unpushed": "0"}):
            self.assertEqual(self.sweep(now=100)["secretHeld"], [])

    def test_prior_known_hold_cleared_before_budget_still_is_not_complete(self):
        unvisited = self.root / "unvisited"
        unvisited.mkdir()
        self.stamp.write_text(json.dumps({"secretHeld": [self.row], "secretHeldCoverage": "known"}))
        clock = iter((0.0, 0.0, 0.0, 100.0))
        with patch.object(sweeper, "live_paths", return_value=set()), patch.object(
            sweeper, "linked_worktrees", return_value=[(self.path, "branch"), (unvisited, "branch-two")],
        ), patch.object(sweeper, "inspect", return_value={"activity": 100, "dirty": 0, "unpushed": "0"}) as inspect:
            report = sweeper.sweep([self.repo], [self.root], [], state=self.state, now=100,
                                   budget_s=60, clock=lambda: next(clock))
        inspect.assert_called_once()
        self.assertEqual(report["secretHeld"], [])
        self.assertEqual(report["secretHeldCoverage"], "unknown")
        self.stamp.write_text(json.dumps(report))
        prior = {"alerts": {doctor_sweep_hold.KEY: "prior active hold"}}
        self.assertEqual(doctor_sweep_hold.alert(doctor_sweep_hold.observe(self.state), prior), "prior active hold")

    def test_unknown_ledger_is_not_cleared_until_a_verified_sweep(self):
        for data in ("malformed JSON", '{"secretHeld":[42]}', '{"secretHeld":[],"budgetSpent":true}'):
            with self.subTest(data=data):
                self.stamp.write_text(data)
                prior = {"alerts": {doctor_sweep_hold.KEY: "prior active hold"}}
                self.assertEqual(doctor_sweep_hold.alert(doctor_sweep_hold.observe(self.state), prior), "prior active hold")
                report = self.truncated()
                self.assertEqual(report["secretHeld"], [])
                self.assertEqual(report["secretHeldCoverage"], "unknown")
                self.stamp.write_text(json.dumps(report))
                observed = doctor_sweep_hold.observe(self.state)
                self.assertEqual(doctor_sweep_hold.alert(observed, prior), "prior active hold")
                report = self.sweep(inventory_error=OSError("enumeration fixture"))
                self.assertEqual(report["secretHeldCoverage"], "unknown")
                with patch.object(sweeper, "inspect", return_value=None):
                    self.assertEqual(self.sweep()["secretHeldCoverage"], "unknown")
                with patch.object(sweeper, "inspect", return_value={
                    "activity": 100, "dirty": 0, "unpushed": "0",
                }):
                    recovered = self.sweep(now=100)
                self.assertEqual(recovered["secretHeld"], [])
                self.assertEqual(recovered["secretHeldCoverage"], "known")
                self.stamp.write_text(json.dumps(recovered))
                self.assertIsNone(doctor_sweep_hold.alert(doctor_sweep_hold.observe(self.state), prior))

if __name__ == "__main__":
    unittest.main()
