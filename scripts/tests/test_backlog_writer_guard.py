"""The Fleet writer cannot outlive, spoof or redirect its canonical fence."""
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
import hashlib
import fcntl
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import backlog_writer_guard as guard
import lifecycle

NOW = 1792184000.0
VERSION = "2026-10-16T20:53:20Z"


class SessionTest(unittest.TestCase):
    def run_session(self, *, allowed=True, fresh_allowed=True, seen=NOW, ops=None,
                    drift=False, clock=None, monotonic=None, prepare_error=None, read_error=None,
                    bound_check=None):
        messages, events = [], []
        value = {"allowed": allowed, "authorizesTransition": False, "authorizesDispatch": False,
                 "evidence": {"observedAt": seen}}
        def revalidate():
            events.append("revalidate")
            return {**value, "allowed": fresh_allowed}
        prepared = SimpleNamespace(observation=value, issue_id="issue-id", priority=1,
                                   canonical_state_path=Path("/canonical"), revalidate=revalidate,
                                   assert_bound=lambda: bound_check(value) if bound_check else value)
        def prepare(*_):
            events.append("prepare")
            if prepare_error:
                raise prepare_error
            return prepared
        @contextmanager
        def lock_factory(state):
            self.assertEqual(state, Path("/canonical"))
            events.append("lock")
            count = 0
            def check():
                nonlocal count
                count += 1
                return {"device": 1, "inode": count if drift else 2}
            try:
                yield SimpleNamespace(check=check)
            finally:
                events.append("unlock")
        commands = iter(ops or ["lock", "check", "done"])
        def read(timeout):
            events.append("control")
            self.assertGreaterEqual(timeout, 0)
            if read_error:
                raise read_error
            op = next(commands)
            if isinstance(op, dict):
                return op
            return {"nonce": messages[-1]["nonce"], "op": op}
        def send(message):
            if message["phase"] == "released":
                self.assertEqual(events[-1], "unlock")
            messages.append(message)
        code = guard.run_guard("JOV-6641", VERSION, prepare=prepare, read=read, send=send,
                               lock_factory=lock_factory, clock=clock or (lambda: NOW),
                               monotonic=monotonic)
        for message in messages:
            self.assertFalse(message["authorizesTransition"])
            self.assertFalse(message["authorizesDispatch"])
        return code, messages, events

    def test_remote_revalidation_finishes_before_native_lock_and_fence_lasts_until_parent_finishes(self):
        code, rows, events = self.run_session()
        self.assertEqual(code, 0)
        self.assertEqual([r["phase"] for r in rows], ["prepared", "locked", "locked", "released"])
        self.assertLess(events.index("prepare"), events.index("lock"))
        self.assertLess(events.index("revalidate"), events.index("lock"))
        self.assertEqual(events[-1], "unlock")
        self.assertEqual(len({r["nonce"] for r in rows}), 1)
        self.assertEqual(len(rows[0]["nonce"]), 64)

    def test_existing_hold_never_acquires_a_lock(self):
        code, rows, events = self.run_session(allowed=False)
        self.assertEqual(code, 2)
        self.assertEqual(rows[0]["phase"], "held")
        self.assertNotIn("lock", events)

    def test_new_custody_dependency_resource_or_cohort_hold_releases_without_locked_receipt(self):
        code, rows, events = self.run_session(fresh_allowed=False)
        self.assertEqual(code, 2)
        self.assertEqual([r["phase"] for r in rows], ["prepared", "held"])
        self.assertNotIn("lock", events)

    def test_packet_injection_wrong_nonce_and_wrong_control_operations_fail_closed(self):
        for op in [{"nonce": "wrong", "op": "lock"}, {"nonce": "wrong", "op": "done", "allowed": True}, "done", "claim"]:
            with self.subTest(op=op):
                code, rows, events = self.run_session(ops=[op])
                self.assertEqual(code, 2)
                self.assertEqual(rows[-1]["reason"], "parent-control-binding-mismatch")
                self.assertNotIn("lock", events)

    def test_short_expired_future_or_missing_proof_never_exposes_a_write_window(self):
        for seen in [NOW - 40, NOW - 61, NOW + 1, None, "invalid"]:
            with self.subTest(seen=seen):
                code, rows, events = self.run_session(seen=seen)
                self.assertEqual(code, 2)
                self.assertNotIn("locked", [r["phase"] for r in rows])
                self.assertEqual(events[-1], "unlock")

    def test_parent_abort_is_release_and_never_an_admission(self):
        code, rows, _ = self.run_session(ops=["lock", "abort"])
        self.assertEqual(code, 0)
        self.assertEqual(rows[-1]["result"], "abort")
        self.assertNotIn("admitted", str(rows))

    def test_lock_drift_is_unknown_effect_after_write_may_start(self):
        code, rows, events = self.run_session(drift=True)
        self.assertEqual(code, 2)
        self.assertEqual(rows[-1]["reason"], "canonical-claim-lock-identity-changed")
        self.assertEqual(rows[-1]["effect"], "unknown-if-parent-write-started")
        self.assertEqual(events[-1], "unlock")

    def test_exact_proof_and_minimum_write_window_boundaries(self):
        code, rows, _ = self.run_session(seen=NOW - 38)
        self.assertEqual(code, 0)
        self.assertEqual(rows[1]["expiresAt"], NOW + guard.MIN_WRITE_WINDOW_S)
        for age, reason in [(38.000001, "native-proof-write-window-too-short"),
                            (60, "native-proof-write-window-too-short"),
                            (60.000001, "native-proof-expired")]:
            with self.subTest(age=age):
                code, rows, _ = self.run_session(seen=NOW - age)
                self.assertEqual(code, 2)
                self.assertEqual(rows[-1]["reason"], reason)
                self.assertNotIn("locked", [row["phase"] for row in rows])

    def test_expired_or_nonfinite_window_never_reaches_control_reader(self):
        for at in [NOW + 25, NOW + 26, NOW - 1, float("nan"), float("inf")]:
            with self.subTest(at=at):
                times = iter([NOW, NOW, at])
                code, rows, events = self.run_session(ops=["lock"], clock=lambda: next(times))
                self.assertEqual(code, 2)
                self.assertEqual(rows[-1]["reason"], "writer-lock-window-expired")
                self.assertEqual(events.count("control"), 1)
                self.assertEqual(events[-1], "unlock")

    def test_expiry_during_parent_read_never_returns_a_check_receipt(self):
        for after in [NOW + 25, float("nan")]:
            with self.subTest(after=after):
                times = iter([NOW, NOW, NOW + 24, after])
                code, rows, _ = self.run_session(clock=lambda: next(times))
                self.assertEqual(code, 2)
                self.assertEqual(rows[-1]["reason"], "writer-lock-window-expired")
                self.assertEqual([r["phase"] for r in rows], ["prepared", "locked", "held"])
    def test_prepare_or_parent_failure_is_named_and_never_retried(self):
        for options in [{"prepare_error": ValueError("private transport body")},
                        {"read_error": guard.GuardHeld("parent-eof")},
                        {"read_error": guard.GuardHeld("parent-control-timeout")}]:
            with self.subTest(options=options):
                code, rows, events = self.run_session(**options)
                self.assertEqual(code, 2)
                self.assertEqual(events.count("prepare"), 1)
                self.assertNotIn("private transport body", str(rows))

    def test_modest_wall_rollback_after_prior_check_cannot_reuse_original_fence_window(self):
        for during_read in [False, True]:
            wall = iter([NOW, NOW, NOW, NOW + 10, NOW + 5] if not during_read else [NOW, NOW, NOW, NOW + 5])
            elapsed = iter([100, 100, 100, 110, 126] if not during_read else [100, 100, 124, 126])
            with self.subTest(during_read=during_read):
                code, rows, events = self.run_session(ops=["lock", "check"],
                                                     clock=lambda: next(wall),
                                                     monotonic=lambda: next(elapsed))
                self.assertEqual(code, 2)
                expected = ["prepared", "locked", "held"] if during_read else ["prepared", "locked", "locked", "held"]
                self.assertEqual([row["phase"] for row in rows], expected)
                self.assertEqual(rows[-1]["reason"], "writer-lock-window-expired")
                self.assertEqual(events.count("control"), 2)
                self.assertEqual(events[-1], "unlock")

    def test_local_checks_consume_original_kernel_window_before_locked_report(self):
        elapsed = iter([100, 104])
        code, rows, events = self.run_session(monotonic=lambda: next(elapsed))
        self.assertEqual(code, 2)
        self.assertEqual([row["phase"] for row in rows], ["prepared", "held"])
        self.assertEqual(rows[-1]["reason"], "native-proof-write-window-too-short")
        self.assertEqual(events.count("control"), 1)
        self.assertEqual(events[-1], "unlock")

    def test_advertised_parent_deadline_deducts_local_checks_from_original_kernel_window(self):
        for cost in [1, 2, 3]:
            for wall_elapsed in [cost, 0]:
                with self.subTest(cost=cost, wall_elapsed=wall_elapsed):
                    wall, elapsed, checked = [NOW], [100.0], [False]
                    def bound_check(value):
                        if not checked[0]:
                            wall[0] += wall_elapsed
                            elapsed[0] += cost
                            checked[0] = True
                        return value
                    code, rows, events = self.run_session(
                        bound_check=bound_check, clock=lambda: wall[0],
                        monotonic=lambda: elapsed[0])
                    self.assertEqual(code, 0)
                    locked = [row for row in rows if row["phase"] == "locked"]
                    self.assertEqual(len(locked), 2)
                    remaining = guard.WRITE_WINDOW_S - cost
                    self.assertEqual(locked[0]["expiresAt"] - wall[0], remaining)
                    self.assertEqual(locked[1]["expiresAt"], locked[0]["expiresAt"])
                    # The Node adapter arms once from this epoch deadline. Its
                    # remaining timeout must fit the original kernel ceiling.
                    self.assertLessEqual(locked[0]["expiresAt"] - wall[0],
                                         100 + guard.WRITE_WINDOW_S - elapsed[0])
                    self.assertEqual(events[-1], "unlock")


class BoundContextSessionTest(unittest.TestCase):
    """Exercise the real retained read-set fence, using private local files.

    Network preparation is replaced by an already-read fixture. Local source
    validation, custody preimages, eligibility digests and kernel locks are real.
    No test turns an injected ``allowed`` value into local fence authority.
    """
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="backlog-writer-bound-")
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name).resolve()
        self.state = root / "state"
        self.state.mkdir()
        self.lock_path = self.state / "claim.lock"
        self.lock_path.write_text("native incumbent receipt")
        # Git supplies an independent source-tree identity for the maintained
        # validate_release implementation, as in the lifecycle regression suite.
        repo = root / "repo"
        subprocess.run(["git", "init", "-q", str(repo)], check=True)
        source = repo / "scripts/lanes"
        source.mkdir(parents=True)
        (source / "lane_runner.py").write_text("# qualified fixture source\n")
        policy = repo / "scripts/fleet-gate/scoped_admission.py"
        policy.parent.mkdir(); policy.write_text("# qualified fixture fleet policy\n")
        subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
        tree = subprocess.run(["git", "-C", str(repo), "write-tree"], check=True,
                              capture_output=True, text=True).stdout.strip()
        oid = subprocess.run(["git", "-C", str(repo), "rev-parse", tree + ":scripts/lanes"],
                             check=True, capture_output=True, text=True).stdout.strip()
        objects = {"scripts/lanes": oid,
                   "scripts/fleet-gate/scoped_admission.py": subprocess.run(
                       ["git", "-C", str(repo), "rev-parse", tree + ":scripts/fleet-gate/scoped_admission.py"],
                       check=True, capture_output=True, text=True).stdout.strip()}
        manifest = {"schema": "jovie-lane-release-bundle/v1", "sourceCommit": "a" * 40,
                    "objects": objects, "bundleDigest": hashlib.sha256(json.dumps(
                        objects, sort_keys=True, separators=(",", ":")).encode()).hexdigest()}
        release = self.state / "releases" / manifest["bundleDigest"]
        self.current = release / "scripts/lanes"
        self.current.mkdir(parents=True)
        self.source = self.current / "lane_runner.py"
        self.source.write_bytes((source / "lane_runner.py").read_bytes())
        installed_policy = self.current.parent / "fleet-gate/scoped_admission.py"
        installed_policy.parent.mkdir(); installed_policy.write_bytes(policy.read_bytes())
        for name, text in [(".release.json", json.dumps(manifest)),
                           (".bundle", manifest["bundleDigest"]), (".tree", oid)]:
            (self.current / name).write_text(text)
        (self.state / "current").symlink_to(self.current)
        self.claims = self.state / "claims.json"
        self.claims.write_text(json.dumps({"claims": {}}))
        self.resources = self.state / "resource-evidence.json"
        self.resources.write_text(json.dumps({"typedWorkAllowed": True, "freeSlots": 1,
                                              "quota": {"ok": True}}))
        self.ledger = self.state / "attempts.jsonl"
        self.ledger.write_text("")
        admission = guard.backlog_admission
        row = {"id": "issue-id", "identifier": "JOV-6641", "title": "Fixture work",
               "description": "Bound scope", "priority": 1, "createdAt": VERSION,
               "updatedAt": VERSION, "archivedAt": None, "state": {"name": "Backlog", "type": "backlog"},
               "assignee": None, "delegate": None, "parent": None}
        row.update({name: {"nodes": [], "pageInfo": {"hasNextPage": False}}
                    for name in admission.CONNECTIONS})
        native = object.__new__(admission._NativeReads)
        native.current, native.state = self.current, self.state
        native.lane = SimpleNamespace(lifecycle=lifecycle)
        native.binding = {"installedPath": str(self.current)}
        reads = object.__new__(admission._SharedReads)
        reads.native, reads._prs = native, []
        reads.pr_observed_at = reads.history_observed_at = NOW
        reads.cohort_digest = admission._fingerprint([(row["id"], admission._metadata_digest(row))])
        reads.issue_preimages = {row["id"]: admission._issue_digest(row)}
        reads.local_preimages = {self.claims: admission._fingerprint(admission._json_file(self.claims))}
        reads.file_preimages = {self.ledger: admission._fingerprint(self.ledger.read_text())}
        reads.runtime_preimages = {}
        self.prepared = object.__new__(admission._PreparedGuard)
        self.prepared.canonical_state_path = str(self.state)
        self.prepared.issue_id, self.prepared.priority = row["id"], row["priority"]
        self.prepared._identifier, self.prepared._row = row["identifier"], row
        self.prepared._binding, self.prepared._started = native.binding, NOW
        self.prepared._cohort, self.prepared._reads = [row], reads
        self.prepared._observation = {"allowed": True, "authorizesTransition": False,
                                      "authorizesDispatch": False, "evidence": {"observedAt": NOW}}
        # Only the local resource producer is substituted. The retained native
        # eligibility digest and file-based changes pass through assert_local.
        def runtime(*_):
            return {"observedAt": NOW, "resources": {"observedAt": NOW,
                    **admission._json_file(self.resources)}}, None, None, {}
        reads.observe_runtime(row, runtime()[0])
        resource_probe = patch.object(admission, "_native_runtime", side_effect=runtime)
        resource_probe.start()
        self.addCleanup(resource_probe.stop)
        wall_time = patch.object(admission.time, "time", return_value=NOW)
        wall_time.start()
        self.addCleanup(wall_time.stop)
        self.frames, self.commands = [], []

    def run_bound_session(self, *, mutation=None, changed_op="check", before_lock=False):
        def revalidate():
            # Slow remote reads happen outside the shared claim lock.
            with guard.ClaimFence(self.state):
                pass
            if mutation and before_lock:
                mutation()
            return self.prepared.observation
        self.prepared.revalidate = revalidate
        commands = iter(["lock", "check", "done"])
        def read(timeout):
            self.assertGreater(timeout, 0)
            op = next(commands)
            self.commands.append(op)
            if op != "lock":
                with self.assertRaisesRegex(guard.GuardHeld, "canonical-claim-lock-busy"):
                    with guard.ClaimFence(self.state):
                        self.fail("parent control ran after the native lock was released")
            if mutation and op == changed_op and not before_lock:
                mutation()
            return {"nonce": self.frames[-1]["nonce"], "op": op}
        code = guard.run_guard("JOV-6641", VERSION, prepare=lambda *_: self.prepared,
                               read=read, send=self.frames.append, clock=lambda: NOW)
        # Every outcome drops the kernel fence and preserves its exact file.
        with guard.ClaimFence(self.state):
            self.assertEqual(self.lock_path.read_text(), "native incumbent receipt")
        for frame in self.frames:
            self.assertFalse(frame["authorizesTransition"])
            self.assertFalse(frame["authorizesDispatch"])
        return code

    def assert_bound_hold(self, reason):
        self.assertEqual(self.frames[-1]["phase"], "held")
        observation = self.frames[-1]["observation"]
        self.assertFalse(observation["allowed"])
        self.assertIn(reason, json.dumps(observation))
        self.assertEqual(self.frames[-1]["effect"], "unknown-if-parent-write-started")
        self.assertNotIn("released", [frame["phase"] for frame in self.frames])

    def test_unchanged_real_source_custody_and_resources_stay_bound_through_done(self):
        self.assertEqual(self.run_bound_session(), 0)
        self.assertEqual([frame["phase"] for frame in self.frames], ["prepared", "locked", "locked", "released"])
        self.assertEqual(self.frames[-1]["result"], "done")

    def test_mutated_qualified_source_is_held_on_child_check(self):
        self.assertEqual(self.run_bound_session(mutation=lambda: self.source.write_text("changed source\n")), 2)
        self.assert_bound_hold("AdmissionHeld")
        self.assertEqual(self.commands, ["lock", "check"])

    def test_new_native_custody_is_held_on_child_check(self):
        self.assertEqual(self.run_bound_session(mutation=lambda: self.claims.write_text(json.dumps(
            {"claims": {"issue-id": {"owner": "accepted-incumbent", "leaseUntil": NOW + 300}}}))), 2)
        self.assert_bound_hold("prepared-native-custody-changed")

    def test_resource_verdict_drift_is_held_on_child_check(self):
        self.assertEqual(self.run_bound_session(mutation=lambda: self.resources.write_text(json.dumps(
            {"typedWorkAllowed": False, "freeSlots": 0, "quota": {"ok": False}}))), 2)
        self.assert_bound_hold("prepared-native-eligibility-changed")

    def test_new_attempt_history_is_held_before_done_is_released(self):
        self.assertEqual(self.run_bound_session(mutation=lambda: self.ledger.write_text("new canonical attempt\n"),
                                                changed_op="done"), 2)
        self.assert_bound_hold("prepared-native-history-changed")
        self.assertEqual(self.commands, ["lock", "check", "done"])

    def test_local_drift_before_lock_never_emits_a_locked_frame(self):
        self.assertEqual(self.run_bound_session(mutation=lambda: self.claims.write_text('{"claims":{"new":{}}}'),
                                                before_lock=True), 2)
        self.assertEqual([frame["phase"] for frame in self.frames], ["prepared", "held"])
        self.assertIn("prepared-native-custody-changed", json.dumps(self.frames[-1]))

    def test_real_lock_contention_does_not_refresh_or_replace_incumbent_lock(self):
        self.prepared.revalidate = lambda: self.prepared.observation
        with guard.ClaimFence(self.state) as incumbent:
            identity = incumbent.check()
            code = guard.run_guard("JOV-6641", VERSION, prepare=lambda *_: self.prepared,
                                   read=lambda _: {"nonce": self.frames[-1]["nonce"], "op": "lock"},
                                   send=self.frames.append, clock=lambda: NOW)
            self.assertEqual(code, 2)
            self.assertEqual(self.frames[-1]["reason"], "canonical-claim-lock-busy")
            self.assertEqual(incumbent.check(), identity)
            self.assertEqual(self.lock_path.read_text(), "native incumbent receipt")
        with guard.ClaimFence(self.state):
            pass


class KernelFenceTest(unittest.TestCase):
    def test_real_contention_preserves_incumbent_and_reacquires_after_release(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            path = state / "claim.lock"
            path.write_text("incumbent acquisition receipt")
            with guard.ClaimFence(state) as first:
                before = first.check()
                with self.assertRaisesRegex(guard.GuardHeld, "canonical-claim-lock-busy"):
                    with guard.ClaimFence(state):
                        self.fail("contender acquired the lock")
                self.assertEqual(path.read_text(), "incumbent acquisition receipt")
                self.assertEqual(first.check(), before)
            with guard.ClaimFence(state) as following:
                self.assertEqual(following.check(), before)

    def test_replacement_inode_symlink_and_missing_lock_are_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            path = state / "claim.lock"
            with self.assertRaises(FileNotFoundError):
                with guard.ClaimFence(state):
                    self.fail("missing canonical lock was invented")
            path.write_text("")
            with guard.ClaimFence(state) as held:
                path.unlink()
                path.write_text("")
                with self.assertRaisesRegex(guard.GuardHeld, "identity-changed"):
                    held.check()
            path.unlink()
            target = state / "other"
            target.write_text("")
            path.symlink_to(target)
            with self.assertRaisesRegex(guard.GuardHeld, "not-regular"):
                with guard.ClaimFence(state):
                    self.fail("symlink became canonical authority")


class OutputTest(unittest.TestCase):
    def test_later_frame_cannot_reset_original_monotonic_ceiling_after_wall_rollback(self):
        elapsed = iter([100, 100.2, 101.1, 101.1])
        with tempfile.TemporaryFile("w+b") as stream, patch.object(guard.sys, "stdout", stream):
            guard.emit({"phase": "locked"}, deadline=11, clock=lambda: 10,
                       monotonic_deadline=101, monotonic=lambda: next(elapsed))
            size = stream.tell()
            with self.assertRaisesRegex(guard.ParentOutputHeld, "output-deadline"):
                guard.emit({"phase": "locked"}, deadline=11, clock=lambda: 9,
                           monotonic_deadline=101, monotonic=lambda: next(elapsed))
            self.assertEqual(stream.tell(), size)

    def test_complete_frames_match_parent_byte_limit_and_restore_descriptor_flags(self):
        value = {"private": ""}
        overhead = len((json.dumps(value, separators=(",", ":")) + "\n").encode())
        value["private"] = "x" * (guard.MAX_FRAME_BYTES - overhead)
        with tempfile.TemporaryFile("w+b") as stream:
            fcntl.fcntl(stream.fileno(), fcntl.F_SETFL, os.O_APPEND)
            flags = fcntl.fcntl(stream.fileno(), fcntl.F_GETFL)
            with patch.object(guard.sys, "stdout", stream):
                guard.emit(value, deadline=time.time() + 1)
                # Darwin adds an internal written bit after ordinary writes;
                # test the writable status flags this emitter can change.
                modifiers = os.O_NONBLOCK | os.O_APPEND
                self.assertEqual(fcntl.fcntl(stream.fileno(), fcntl.F_GETFL) & modifiers,
                                 flags & modifiers)
                value["private"] += "x"
                with self.assertRaisesRegex(guard.ParentOutputHeld, "frame-too-large"):
                    guard.emit(value)
            stream.seek(0)
            frame = stream.read()
            self.assertEqual(len(frame), guard.MAX_FRAME_BYTES)
            self.assertTrue(frame.endswith(b"\n"))
            self.assertEqual(len(json.loads(frame)["private"]), guard.MAX_FRAME_BYTES - overhead)

    def test_expired_nonfinite_and_backwards_wall_clock_cannot_extend_output_deadline(self):
        with tempfile.TemporaryFile("w+b") as stream, patch.object(guard.sys, "stdout", stream):
            for deadline in [time.time() - 1, float("nan"), float("inf")]:
                with self.subTest(deadline=deadline):
                    with self.assertRaisesRegex(guard.ParentOutputHeld, "output-deadline"):
                        guard.emit({}, deadline=deadline)
            clock = iter([10, 9])
            with patch.object(guard.time, "monotonic", side_effect=[100, 101]):
                with self.assertRaisesRegex(guard.ParentOutputHeld, "output-deadline"):
                    guard.emit({}, deadline=11, clock=lambda: next(clock))
            self.assertEqual(stream.tell(), 0)

    def test_full_pipe_times_out_without_changing_original_descriptor_flags(self):
        read_fd, write_fd = os.pipe()
        try:
            flags = fcntl.fcntl(write_fd, fcntl.F_GETFL)
            fcntl.fcntl(write_fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
            while True:
                try:
                    os.write(write_fd, b"x" * 65536)
                except BlockingIOError:
                    break
            fcntl.fcntl(write_fd, fcntl.F_SETFL, flags)
            with patch.object(guard.sys, "stdout", SimpleNamespace(fileno=lambda: write_fd)):
                with self.assertRaisesRegex(guard.ParentOutputHeld, "output-deadline"):
                    guard.emit({}, deadline=time.time() + 0.03)
            self.assertEqual(fcntl.fcntl(write_fd, fcntl.F_GETFL) & os.O_NONBLOCK,
                             flags & os.O_NONBLOCK)
        finally:
            os.close(write_fd)
            os.close(read_fd)

    def test_closed_reader_is_named_without_logging_private_frame(self):
        read_fd, write_fd = os.pipe()
        os.close(read_fd)
        try:
            with patch.object(guard.sys, "stdout", SimpleNamespace(fileno=lambda: write_fd)):
                with self.assertRaisesRegex(guard.ParentOutputHeld, "parent-output-closed"):
                    guard.emit({"private": "must not appear in diagnostics"})
        finally:
            os.close(write_fd)


class SubprocessOutputSessionTest(unittest.TestCase):
    """Actual pipes and kernel locks; injected reads confer no authority."""
    CHILD = r'''
import json,sys,time
from pathlib import Path
sys.path.insert(0,sys.argv[1])
import backlog_writer_guard as guard
config=json.loads(sys.argv[3])
guard.CONTROL_TIMEOUT_S=3
guard.WRITE_WINDOW_S=config.get('window',0.2)
guard.MIN_WRITE_WINDOW_S=0.1
class Context:
 issue_id='owned-output-fixture';priority=1
 canonical_state_path=Path(sys.argv[2])
 observation={'allowed':True,'authorizesTransition':False,'authorizesDispatch':False,'evidence':{'observedAt':time.time()},'private':'x'*config.get('preparedBytes',0)}
 def revalidate(self):return self.observation
 def assert_bound(self):return {**self.observation,'private':'x'*config.get('boundBytes',0)}
sys.exit(guard.run_guard('JOV-FIXTURE','fixture-version',prepare=lambda *_:Context()))
'''

    @contextmanager
    def session(self, **config):
        with tempfile.TemporaryDirectory(prefix="backlog-output-kernel-") as directory:
            state = Path(directory)
            (state / "claim.lock").write_text("owned fixture incumbent")
            child = subprocess.Popen([sys.executable, "-u", "-c", self.CHILD,
                                      str(Path(guard.__file__).parent), str(state), json.dumps(config)],
                                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                yield child, state
            finally:
                if child.poll() is None:
                    child.kill()
                child.wait(timeout=3)
                child.stdin.close()
                child.stdout.close()
                child.stderr.close()

    def send(self, child, frame, op="lock"):
        child.stdin.write((json.dumps({"nonce": frame["nonce"], "op": op}) + "\n").encode())
        child.stdin.flush()

    def released(self, state):
        with guard.ClaimFence(state):
            self.assertEqual((state / "claim.lock").read_text(), "owned fixture incumbent")

    def test_unread_full_output_pipe_releases_kernel_fence_at_absolute_window(self):
        with self.session(preparedBytes=131072, boundBytes=131072) as (child, state):
            prepared = json.loads(child.stdout.readline())
            self.assertEqual(prepared["phase"], "prepared")
            self.send(child, prepared)
            # Deliberately leave locked output unread until the child expires.
            self.assertEqual(child.wait(timeout=3), 2)
            self.released(state)
            partial = child.stdout.read()
            self.assertTrue(partial)
            self.assertNotIn(b'"phase":"held"', partial)
            self.assertNotIn(b'"phase":"released"', partial)
            self.assertEqual(child.stderr.read(), b"")

    def test_closed_stdout_reader_releases_kernel_fence_without_second_frame(self):
        with self.session(boundBytes=131072) as (child, state):
            prepared = json.loads(child.stdout.readline())
            child.stdout.close()
            self.send(child, prepared)
            self.assertEqual(child.wait(timeout=3), 2)
            self.released(state)
            self.assertEqual(child.stderr.read(), b"")

    def test_oversize_prepared_or_locked_frame_is_compact_hold_without_truncation(self):
        for before_lock in [True, False]:
            with self.subTest(before_lock=before_lock), self.session(
                    preparedBytes=guard.MAX_FRAME_BYTES if before_lock else 0,
                    boundBytes=guard.MAX_FRAME_BYTES) as (child, state):
                frame = json.loads(child.stdout.readline())
                if not before_lock:
                    self.assertEqual(frame["phase"], "prepared")
                    self.send(child, frame)
                    frame = json.loads(child.stdout.readline())
                self.assertEqual(frame["phase"], "held")
                self.assertEqual(frame["reason"], "parent-output-frame-too-large")
                self.assertFalse(frame["authorizesTransition"])
                self.assertFalse(frame["authorizesDispatch"])
                self.assertEqual(child.wait(timeout=3), 2)
                self.released(state)

    def test_real_pipe_roundtrip_preserves_complete_observations_and_kernel_custody(self):
        with self.session(preparedBytes=131072, boundBytes=131072, window=2) as (child, state):
            prepared = json.loads(child.stdout.readline())
            self.send(child, prepared)
            for op in ["check", "done"]:
                locked = json.loads(child.stdout.readline())
                self.assertEqual(locked["phase"], "locked")
                self.assertEqual(len(locked["observation"]["private"]), 131072)
                with self.assertRaisesRegex(guard.GuardHeld, "busy"):
                    with guard.ClaimFence(state):
                        self.fail("native fence disappeared before parent completion")
                self.send(child, locked, op)
            released = json.loads(child.stdout.readline())
            self.assertEqual((released["phase"], released["result"]), ("released", "done"))
            self.assertEqual(child.wait(timeout=3), 0)
            self.released(state)


class ControlTest(unittest.TestCase):
    @contextmanager
    def input_bytes(self, payload, *, keep_writer=False):
        read_fd, write_fd = os.pipe()
        with os.fdopen(read_fd, "rb", buffering=0) as source:
            os.write(write_fd, payload)
            if not keep_writer:
                os.close(write_fd)
            try:
                with patch.object(guard.sys, "stdin", source):
                    yield
            finally:
                if keep_writer:
                    os.close(write_fd)

    def test_bounded_control_reads_eof_timeout_malformed_and_json(self):
        for payload, expected in [(b'', 'parent-eof'), (b'x' * (guard.MAX_MESSAGE_BYTES + 1), 'parent-control-malformed')]:
            with self.input_bytes(payload):
                with self.assertRaisesRegex(guard.GuardHeld, expected):
                    guard.read_control(1)
        with self.input_bytes(b'', keep_writer=True):
            with self.assertRaisesRegex(guard.GuardHeld, "parent-control-timeout"):
                guard.read_control(0)
        for value in [{"nonce": "n", "op": "check"}, []]:
            with self.input_bytes((json.dumps(value) + "\n").encode()):
                if isinstance(value, dict):
                    self.assertEqual(guard.read_control(1), value)
                else:
                    with self.assertRaisesRegex(guard.GuardHeld, "malformed"):
                        guard.read_control(1)

    def test_coalesced_messages_are_not_lost_to_buffered_stdin(self):
        with self.input_bytes(b'{"op":"check"}\n{"op":"done"}\n'):
            self.assertEqual(guard.read_control(1), {"op": "check"})
            self.assertEqual(guard.read_control(1), {"op": "done"})

    def test_cli_refuses_an_uninstalled_checkout_before_preparing_any_read_set(self):
        with patch.object(guard.sys, "argv", ["guard", "--issue", "JOV-6641", "--expected-version", VERSION]), \
             patch.object(guard, "emit") as send, patch.object(guard, "run_guard") as run:
            self.assertEqual(guard.main(), 2)
            self.assertEqual(send.call_args.args[0]["reason"], "writer-guard-not-installed")
            run.assert_not_called()


class DefaultPreparationProtocolTest(unittest.TestCase):
    def test_default_prepare_borrows_actual_control_pipe_and_original_start_without_reading_frames(self):
        read, write = os.pipe()
        try:
            flags = fcntl.fcntl(read, fcntl.F_GETFL)
            payload = b'{"op":"lock"}\n{"op":"check"}\n'
            os.write(write, payload)
            prepared = SimpleNamespace(observation={"allowed": False, "authorizesTransition": False,
                                                    "authorizesDispatch": False})
            messages = []
            with patch.object(guard.sys, "stdin", SimpleNamespace(fileno=lambda: read)), \
                 patch.object(guard.backlog_admission, "prepare_backlog_guard", return_value=prepared) as prepare:
                self.assertEqual(guard.run_guard("JOV-6641", VERSION, send=messages.append,
                                                monotonic=lambda: 123.0), 2)
                prepare.assert_called_once_with("JOV-6641", VERSION, preparation_started=123.0, parent_control_fd=read)
            self.assertEqual(os.read(read, len(payload)), payload)
            self.assertEqual(fcntl.fcntl(read, fcntl.F_GETFL), flags)
            self.assertFalse(messages[0]["authorizesDispatch"])
            self.assertFalse(messages[0]["authorizesTransition"])
        finally: os.close(read); os.close(write)

    def test_closed_or_write_only_control_is_held_before_default_preparation(self):
        read, write = os.pipe(); os.close(read)
        try:
            for fd in (read, write):
                messages = []
                with self.subTest(fd=fd), patch.object(guard.sys, "stdin", SimpleNamespace(fileno=lambda: fd)), \
                     patch.object(guard.backlog_admission, "prepare_backlog_guard") as prepare:
                    self.assertEqual(guard.run_guard("JOV-6641", VERSION, send=messages.append), 2)
                    prepare.assert_not_called()
                    self.assertEqual(messages[-1]["phase"], "held")
                    self.assertFalse(messages[-1]["authorizesDispatch"])
        finally: os.close(write)

    def test_injected_prepare_retains_two_argument_contract_and_never_reads_stdin(self):
        calls, messages = [], []
        def prepare(identifier, version):
            calls.append((identifier, version))
            return SimpleNamespace(observation={"allowed": False})
        with patch.object(guard.sys, "stdin", SimpleNamespace(fileno=lambda: (_ for _ in ()).throw(AssertionError("stdin")))):
            self.assertEqual(guard.run_guard("JOV-6641", VERSION, prepare=prepare, send=messages.append), 2)
        self.assertEqual(calls, [("JOV-6641", VERSION)])

    def test_duplex_fifo_cannot_hide_parent_eof_and_is_held_before_prepare(self):
        with tempfile.TemporaryDirectory() as tmp:
            fifo = Path(tmp) / "duplex"; os.mkfifo(fifo)
            fd = os.open(fifo, os.O_RDWR | os.O_NONBLOCK)
            try:
                flags = fcntl.fcntl(fd, fcntl.F_GETFL)
                messages = []
                with patch.object(guard.sys, "stdin", SimpleNamespace(fileno=lambda: fd)), \
                     patch.object(guard.backlog_admission, "prepare_backlog_guard") as prepare:
                    self.assertEqual(guard.run_guard("JOV-6641", VERSION, send=messages.append), 2)
                    prepare.assert_not_called()
                self.assertEqual(messages[-1]["reason"], "parent-control-not-read-pipe")
                self.assertEqual(fcntl.fcntl(fd, fcntl.F_GETFL), flags)
            finally: os.close(fd)

    def test_ordinary_collector_has_no_inferred_control_or_supplied_deadline(self):
        expected = {"allowed": False, "authorizesDispatch": False}
        with patch.object(guard.backlog_admission, "prepare_backlog_guard", return_value=SimpleNamespace(observation=expected)) as prepare:
            self.assertEqual(guard.backlog_admission.collect_backlog_admission("JOV-6641", VERSION), expected)
            prepare.assert_called_once_with("JOV-6641", VERSION, home=None, module_path=None)


if __name__ == "__main__":
    unittest.main()
