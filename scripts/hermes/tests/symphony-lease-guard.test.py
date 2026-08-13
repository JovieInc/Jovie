#!/usr/bin/env python3
"""JOV-5031: monotonic lease tombstone and redispatch-suppression regressions."""

from __future__ import annotations

import contextlib
import fcntl
import importlib.util
from importlib.machinery import SourceFileLoader
import io
import json
import os
import pathlib
import tempfile
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[3]
GUARD = ROOT / "scripts/hermes/symphony-lease-guard"
LOADER = SourceFileLoader("symphony_lease_guard", str(GUARD))
SPEC = importlib.util.spec_from_file_location("symphony_lease_guard", GUARD, loader=LOADER)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"could not load {GUARD}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

ACTIVE = frozenset(("todo", "in progress"))


def make_issue(identifier: str, state: str, updated_epoch: float) -> dict:
    return {"identifier": identifier, "state": state, "updatedAtEpoch": updated_epoch}


class LeaseDecisionTests(unittest.TestCase):
    """Pure verdict semantics: the JOV-5029 stale-redispatch incident shape."""

    def test_non_active_state_installs_tombstone_and_suppresses(self):
        issue = make_issue("JOV-5029", "In Review", 1000)
        decision, reason, tombstone, clear = MODULE.lease_decision(
            "JOV-5029", issue, None, ACTIVE, now=2000
        )
        self.assertEqual(decision, "suppress")
        self.assertIn("non_active", reason)
        self.assertFalse(clear)
        self.assertEqual(tombstone["state"], "In Review")
        self.assertEqual(tombstone["observedAt"], 2000)
        self.assertEqual(tombstone["issueUpdatedAtEpoch"], 1000)

    def test_stale_in_progress_after_in_review_is_suppressed(self):
        tombstone = {"state": "In Review", "observedAt": 2000, "issueUpdatedAtEpoch": 1000}
        # Stale snapshot: claims In Progress but carries no transition newer
        # than the tombstoned observation.
        stale = make_issue("JOV-5029", "In Progress", 1000)
        decision, reason, stored, clear = MODULE.lease_decision(
            "JOV-5029", stale, tombstone, ACTIVE, now=3000
        )
        self.assertEqual(decision, "suppress")
        self.assertEqual(reason, "stale_snapshot")
        self.assertEqual(stored, tombstone)
        self.assertFalse(clear)

    def test_deliberate_reopen_clears_tombstone(self):
        tombstone = {"state": "In Review", "observedAt": 2000, "issueUpdatedAtEpoch": 1000}
        # A newer explicit transition back into an active state reopens.
        reopened = make_issue("JOV-5029", "In Progress", 2500)
        decision, reason, _stored, clear = MODULE.lease_decision(
            "JOV-5029", reopened, tombstone, ACTIVE, now=3000
        )
        self.assertEqual(decision, "admit")
        self.assertEqual(reason, "reopened")
        self.assertTrue(clear)

    def test_active_state_without_tombstone_admits(self):
        issue = make_issue("JOV-5031", "In Progress", 1000)
        decision, reason, _stored, clear = MODULE.lease_decision(
            "JOV-5031", issue, None, ACTIVE, now=2000
        )
        self.assertEqual((decision, reason, clear), ("admit", "active", False))

    def test_indeterminate_read_admits_without_tombstoning(self):
        decision, reason, _stored, clear = MODULE.lease_decision(
            "JOV-5031", None, None, ACTIVE, now=2000
        )
        self.assertEqual((decision, reason, clear), ("admit", "indeterminate", False))

    def test_tombstone_observed_at_is_monotonic(self):
        future_tombstone = {
            "state": "In Review",
            "observedAt": 9000,
            "issueUpdatedAtEpoch": 1000,
        }
        issue = make_issue("JOV-5029", "In Review", 1500)
        _decision, _reason, stored, _clear = MODULE.lease_decision(
            "JOV-5029", issue, future_tombstone, ACTIVE, now=3000
        )
        # A newer observation may carry fresher issue state, but the
        # tombstone's observedAt never moves backward.
        self.assertEqual(stored["observedAt"], 9000)
        self.assertEqual(stored["issueUpdatedAtEpoch"], 1500)


class CheckCommandTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.env = mock.patch.dict(
            os.environ,
            {"SYMPHONY_LEASE_GUARD_STATE_DIR": self.tmp.name},
        )
        self.env.start()
        self.addCleanup(self.env.stop)

    def run_check(self, identifier: str, issue: dict | None) -> int:
        stderr = io.StringIO()
        with (
            mock.patch.object(MODULE, "_fetch_issue", return_value=issue),
            mock.patch.object(MODULE, "_active_states", return_value=ACTIVE),
            contextlib.redirect_stderr(stderr),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            rc = MODULE.check(identifier)
        self.last_stderr = stderr.getvalue()
        return rc

    def load_state(self) -> dict:
        return json.loads((pathlib.Path(self.tmp.name) / "leases.json").read_text())

    def test_check_persists_tombstone_and_counters(self):
        rc = self.run_check("JOV-5029", make_issue("JOV-5029", "In Review", 1000))
        self.assertEqual(rc, 1)
        self.assertIn("LEASE_SUPPRESSED", self.last_stderr)
        state = self.load_state()
        self.assertIn("JOV-5029", state["tombstones"])
        self.assertEqual(state["counters"]["suppressedNonActive"], 1)

    def test_check_suppresses_stale_snapshot_and_allows_reopen(self):
        self.run_check("JOV-5029", make_issue("JOV-5029", "In Review", 1000))
        stale = self.run_check("JOV-5029", make_issue("JOV-5029", "In Progress", 1000))
        self.assertEqual(stale, 1)
        state = self.load_state()
        self.assertEqual(state["counters"]["suppressedStaleSnapshot"], 1)
        self.assertIn("JOV-5029", state["tombstones"])
        reopened = self.run_check("JOV-5029", make_issue("JOV-5029", "In Progress", 2500))
        self.assertEqual(reopened, 0)
        state = self.load_state()
        self.assertNotIn("JOV-5029", state["tombstones"])
        self.assertEqual(state["counters"]["reopened"], 1)

    def test_check_indeterminate_admits_and_counts(self):
        rc = self.run_check("JOV-5031", None)
        self.assertEqual(rc, 0)
        state = self.load_state()
        self.assertEqual(state["counters"]["indeterminate"], 1)
        self.assertEqual(state["tombstones"], {})

    def test_check_rejects_malformed_identifier(self):
        with contextlib.redirect_stderr(io.StringIO()):
            rc = MODULE.check("bad identifier!")
        self.assertEqual(rc, 2)


class ActiveStatesTests(unittest.TestCase):
    def test_reads_active_states_from_workflow_front_matter(self):
        with tempfile.TemporaryDirectory() as tmp:
            workflow = pathlib.Path(tmp) / "WORKFLOW.md"
            workflow.write_text(
                "---\n"
                "tracker:\n"
                "  active_states:\n"
                "    - Todo\n"
                "    - In Progress\n"
                "  terminal_states:\n"
                "    - Done\n"
                "server:\n"
                "  port: 4041\n"
                "---\n"
                "prompt\n"
            )
            with mock.patch.dict(os.environ, {"SYMPHONY_WORKFLOW_PATH": str(workflow)}):
                states = MODULE._active_states()
        self.assertEqual(states, frozenset(("todo", "in progress")))

    def test_missing_workflow_falls_back_to_symphony_default(self):
        with mock.patch.dict(os.environ, {"SYMPHONY_WORKFLOW_PATH": "/nonexistent/WORKFLOW.md"}):
            states = MODULE._active_states()
        self.assertEqual(states, frozenset(("todo", "in progress")))


def write_fake_process(
    proc_root: pathlib.Path,
    pid: str,
    args: list[str],
    age_seconds: float,
    lock_targets: list[pathlib.Path] | None = None,
) -> None:
    clock_ticks = os.sysconf("SC_CLK_TCK")
    uptime = float((proc_root / "uptime").read_text().split()[0])
    starttime = int((uptime - age_seconds) * clock_ticks)
    fields = ["S"] + ["0"] * 18 + [str(starttime)]
    process = proc_root / pid
    (process / "fd").mkdir(parents=True)
    (process / "cmdline").write_bytes(b"\0".join(arg.encode() for arg in args) + b"\0")
    (process / "stat").write_text(f"{pid} (bash) {' '.join(fields)}\n")
    for index, target in enumerate(lock_targets or []):
        (process / "fd" / str(10 + index)).symlink_to(target)


class OrphanLauncherTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.proc = pathlib.Path(self.tmp.name) / "proc"
        self.proc.mkdir()
        (self.proc / "uptime").write_text("100000.0 90000.0\n")
        self.accounts = pathlib.Path(self.tmp.name) / "accounts"
        (self.accounts / "locks").mkdir(parents=True)
        self.env = mock.patch.dict(
            os.environ,
            {
                "SYMPHONY_LEASE_GUARD_PROC_ROOT": str(self.proc),
                "CODEX_ACCOUNTS_ROOT": str(self.accounts),
                "CODEX_ACCOUNT_WAIT_SECONDS": "900",
            },
        )
        self.env.start()
        self.addCleanup(self.env.stop)

    def launcher_args(self) -> list[str]:
        return ["bash", "/home/x/.local/bin/codex-rotate", "--config", "m=t", "app-server"]

    def test_waiting_past_bound_without_lock_is_orphan(self):
        write_fake_process(self.proc, "4242", self.launcher_args(), age_seconds=2000)
        self.assertEqual(MODULE.count_orphan_launchers(), 1)

    def test_lock_holder_past_bound_is_a_live_session_not_orphan(self):
        lock = self.accounts / "locks" / "account-a.lock"
        lock.touch()
        write_fake_process(
            self.proc, "4242", self.launcher_args(), age_seconds=2000, lock_targets=[lock]
        )
        self.assertEqual(MODULE.count_orphan_launchers(), 0)

    def test_young_waiter_is_not_orphan(self):
        write_fake_process(self.proc, "4242", self.launcher_args(), age_seconds=30)
        self.assertEqual(MODULE.count_orphan_launchers(), 0)

    def test_non_app_server_process_is_ignored(self):
        write_fake_process(
            self.proc, "4242", ["bash", "/home/x/.local/bin/codex-rotate", "exec", "t"], 5000
        )
        self.assertEqual(MODULE.count_orphan_launchers(), 0)

    def test_unreadable_proc_root_is_unknown_not_zero(self):
        with mock.patch.dict(
            os.environ, {"SYMPHONY_LEASE_GUARD_PROC_ROOT": "/nonexistent-proc"}
        ):
            self.assertIsNone(MODULE.count_orphan_launchers())


class CapacityStateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.accounts = pathlib.Path(self.tmp.name) / "accounts"
        self.accounts.mkdir()
        self.env = mock.patch.dict(os.environ, {"CODEX_ACCOUNTS_ROOT": str(self.accounts)})
        self.env.start()
        self.addCleanup(self.env.stop)

    def add_account(self, name: str) -> None:
        account = self.accounts / name
        account.mkdir()
        (account / "auth.json").write_text("{}\n")

    def write_state(self, cooldowns: dict) -> None:
        (self.accounts / "state.json").write_text(
            json.dumps({"active": None, "cooldowns": cooldowns, "last_error": {}})
        )

    def test_available_capacity(self):
        self.add_account("account-a")
        self.write_state({})
        capacity = MODULE.capacity_state()
        self.assertEqual(capacity["state"], "available")
        self.assertEqual(capacity["accounts"], 1)
        self.assertEqual(capacity["available"], 1)

    def test_cooldown_and_lock_saturate(self):
        self.add_account("account-a")
        self.add_account("account-b")
        self.write_state({"account-a": 4_000_000_000})
        locks = self.accounts / "locks"
        locks.mkdir()
        descriptor = os.open(locks / "account-b.lock", os.O_RDWR | os.O_CREAT)
        self.addCleanup(os.close, descriptor)
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        capacity = MODULE.capacity_state()
        self.assertEqual(capacity["state"], "saturated")
        self.assertEqual(capacity["locked"], 1)
        self.assertEqual(capacity["cooldown"], 1)
        self.assertEqual(capacity["available"], 0)

    def test_missing_state_file_is_unknown(self):
        self.add_account("account-a")
        capacity = MODULE.capacity_state()
        self.assertEqual(capacity["state"], "unknown")
        self.assertEqual(capacity["reason"], "account_state_unreadable")


class ReportTests(unittest.TestCase):
    def test_report_receipt_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.dict(
                os.environ,
                {
                    "SYMPHONY_LEASE_GUARD_STATE_DIR": tmp,
                    "SYMPHONY_LEASE_GUARD_PROC_ROOT": "/nonexistent-proc",
                    "CODEX_ACCOUNTS_ROOT": str(pathlib.Path(tmp) / "no-accounts"),
                },
            ):
                stdout = io.StringIO()
                with contextlib.redirect_stdout(stdout):
                    rc = MODULE.report()
        self.assertEqual(rc, 0)
        receipt = json.loads(stdout.getvalue())
        self.assertEqual(receipt["schema"], "symphony-lease-guard-report/v1")
        self.assertIsNone(receipt["orphanLaunchers"])
        self.assertEqual(receipt["capacity"]["state"], "unknown")
        self.assertEqual(receipt["tombstones"], {})
        for key in (
            "checks",
            "admitted",
            "suppressedNonActive",
            "suppressedStaleSnapshot",
            "reopened",
            "indeterminate",
        ):
            self.assertIn(key, receipt["counters"])


if __name__ == "__main__":
    unittest.main()
