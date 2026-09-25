"""Exercise local Git, private journal binding and immutable candidate publication."""
import contextlib
from datetime import datetime, timedelta, timezone
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import shipping_worker_capture as capture


class CaptureTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.gem = self.root / "gem"
        self.private = self.gem / "state/summer-symphony-consumer"
        self.private.mkdir(parents=True, mode=0o700)
        self.workspace = self.root / "JOV-6586"
        self.workspace.mkdir()
        self.producer = self.root / "producer"
        self.producer.mkdir()
        for name in ("codex-rotate", "shipping_lead_worker_evidence.py", "shipping_worker_capture.py"):
            shutil.copyfile(Path(capture.__file__).parent / name, self.producer / name)
        self.task = {"schema": "jovie-symphony-shipping-lead-task/v1", "taskKey": "a" * 64,
                     "issue": {"id": "00000000-0000-4000-8000-000000006586",
                               "identifier": "JOV-6586", "repository": "JovieInc/Jovie"},
                     "runtime": {"invocationId": "b" * 32, "generation": "c" * 64}}
        self.state = {"schema": "jovie.summer-symphony-consumer-state/v1", "active": {
            "phase": "discovered", "taskKey": self.task["taskKey"], "record": {"task": self.task},
            "admissionProgress": {"schema": "symphony-shipping-lead-admission-progress/v1",
                                  "taskDigest": capture.digest(self.task), "mutationCount": 1}}}
        self.save()
        self.git("init", "-q")
        self.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                 "commit", "--allow-empty", "-qm", "start")

    def save(self):
        path = self.private / "state.json"
        path.write_text(json.dumps(self.state))
        path.chmod(0o600)

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.workspace), *args], stderr=subprocess.DEVNULL)

    def binding(self, invocation=None):
        return capture.binding_from_journal(self.private, self.workspace, invocation or "b" * 32,
                                            capture.producer_digest(self.producer))

    def candidate(self):
        reader = capture.NativeTurnEvidence(self.binding(), git=lambda: {"head": "d" * 40, "clean": True})
        reader.observe({"method": "thread/started", "params": {"thread": {
            "id": "thread-1", "cwd": str(self.workspace)}}})
        reader.observe({"method": "turn/started", "params": {"threadId": "thread-1", "turn": {
            "id": "turn-1", "status": "inProgress"}}})
        reader.git = lambda: {"head": "e" * 40, "clean": True}
        return reader.observe({"method": "turn/completed", "params": {"threadId": "thread-1", "turn": {
            "id": "turn-1", "status": "completed"}}})

    def test_binding_reads_attempted_private_journal_and_exact_invocation(self):
        self.assertEqual(self.binding()["taskDigest"], capture.digest(self.task))
        self.assertEqual(self.binding()["workspace"], str(self.workspace))
        with self.assertRaisesRegex(ValueError, "cross-bound"):
            self.binding("a" * 32)
        self.state["active"]["admissionProgress"]["mutationCount"] = 0
        self.save()
        with self.assertRaisesRegex(ValueError, "not attempted"):
            self.binding()

    def test_wrong_digest_schema_phase_task_or_workspace_holds_capture(self):
        original = json.dumps(self.state)
        changes = [lambda s: s.update(schema="wrong"), lambda s: s.update(active=None),
                   lambda s: s["active"].update(phase="outcome-pending"),
                   lambda s: s["active"].update(record=None),
                   lambda s: s["active"]["admissionProgress"].update(taskDigest="e" * 64),
                   lambda s: s["active"]["admissionProgress"].update(mutationCount=True),
                   lambda s: s["active"]["record"]["task"]["issue"].update(identifier="JOV-7")]
        for change in changes:
            self.state = json.loads(original); change(self.state); self.save()
            with self.assertRaises(ValueError): self.binding()
        self.state = []; self.save()
        with self.assertRaises(ValueError): self.binding()

    def test_private_modes_symlinks_hardlinks_and_oversized_files_are_rejected(self):
        state_path = self.private / "state.json"
        state_path.chmod(0o644)
        with self.assertRaisesRegex(ValueError, "file unsafe"): self.binding()
        state_path.chmod(0o600)
        hardlink = self.private / "alias"
        os.link(state_path, hardlink)
        with self.assertRaisesRegex(ValueError, "file unsafe"): self.binding()
        hardlink.unlink()
        target = state_path.read_bytes(); state_path.unlink()
        state_path.symlink_to(self.root / "missing")
        with self.assertRaises(OSError): self.binding()
        state_path.unlink(); state_path.write_bytes(target); state_path.chmod(0o600)
        self.private.chmod(0o755)
        with self.assertRaisesRegex(ValueError, "directory unsafe"): self.binding()
        self.private.chmod(0o700)
        with patch.object(capture, "LIMIT", 10):
            with self.assertRaisesRegex(ValueError, "file unsafe"): capture.read_owned(state_path)
        self.assertEqual(capture.read_owned(state_path), target)

    def test_real_git_snapshot_detects_dirty_and_clean_changed_heads(self):
        before = capture.git_snapshot(self.workspace)
        self.assertTrue(before["clean"])
        (self.workspace / "result.txt").write_text("useful result")
        self.assertFalse(capture.git_snapshot(self.workspace)["clean"])
        self.git("add", "result.txt")
        self.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "result")
        after = capture.git_snapshot(self.workspace)
        self.assertTrue(after["clean"])
        self.assertNotEqual(before["head"], after["head"])
        nested = self.workspace / "nested"; nested.mkdir()
        with self.assertRaisesRegex(ValueError, "workspace mismatch"):
            capture.git_snapshot(nested)

    def test_immutable_private_publication_is_idempotent_and_detects_conflict(self):
        candidate = self.candidate()
        path = capture.publish_candidate(self.private, candidate)
        self.assertEqual(json.loads(path.read_text()), candidate)
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)
        self.assertEqual(capture.publish_candidate(self.private, candidate), path)
        self.assertEqual(list(path.parent.glob(".candidate-*")), [])
        path.write_text("{}")
        with self.assertRaisesRegex(ValueError, "immutable candidate conflict"):
            capture.publish_candidate(self.private, candidate)
        with self.assertRaisesRegex(ValueError, "digest invalid"):
            capture.publish_candidate(self.private, {**candidate, "digest": "a" * 64})
        with patch.object(capture, "LIMIT", 10):
            with self.assertRaisesRegex(ValueError, "candidate oversized"):
                capture.publish_candidate(self.private, candidate)

    def test_missing_admission_passes_bytes_without_creating_proof(self):
        (self.private / "state.json").unlink()
        source = io.BytesIO(b"native\x00data\n")
        destination = io.BytesIO()
        self.assertFalse(capture.capture(source, destination, gem_workspace=self.gem,
                                         workspace=self.workspace, invocation_id="b" * 32,
                                         producer_directory=self.producer))
        self.assertEqual(destination.getvalue(), b"native\x00data\n")
        self.assertFalse((self.private / "worker-evidence").exists())

    def test_live_stream_with_actual_git_commit_publishes_only_after_complete_eof(self):
        events = [
            {"method": "thread/started", "params": {"thread": {"id": "thread-1", "cwd": str(self.workspace)}}},
            {"method": "turn/started", "params": {"threadId": "thread-1", "turn": {"id": "turn-1", "status": "inProgress"}}},
            {"method": "turn/completed", "params": {"threadId": "thread-1", "turn": {"id": "turn-1", "status": "completed"}}},
        ]
        rows = [(json.dumps(event) + "\n").encode() for event in events]
        owner = self
        class Stream:
            index = 0
            def read1(self, _size):
                if self.index == 2:
                    (owner.workspace / "result.txt").write_text("work")
                    owner.git("add", "result.txt")
                    owner.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "work")
                if self.index == len(rows): return b""
                row = rows[self.index]; self.index += 1; return row
        destination = io.BytesIO()
        self.assertTrue(capture.capture(Stream(), destination, gem_workspace=self.gem,
                                        workspace=self.workspace, invocation_id="b" * 32,
                                        producer_directory=self.producer))
        self.assertEqual(destination.getvalue(), b"".join(rows))
        files = list((self.private / "worker-evidence").glob("*.json"))
        self.assertEqual(len(files), 1)
        self.assertEqual(list((self.private / "worker-evidence").glob("exit-*.json")), [])
        result = json.loads(files[0].read_text())
        self.assertFalse(result["executionTerminated"])
        self.assertEqual(result["executionFinalHead"], self.git("rev-parse", "HEAD").decode().strip())

    def test_changed_journal_or_producer_before_publish_refuses_stale_candidate(self):
        for mutate in [lambda: (self.private / "state.json").unlink(),
                       lambda: (self.producer / "codex-rotate").write_text("changed")]:
            self.save()
            value = self.candidate()
            def fake_stream(_source, _destination, _reader, publish):
                mutate(); publish(value); return True
            with patch.object(capture, "capture_stream", fake_stream):
                with self.assertRaises((ValueError, OSError)):
                    capture.capture(io.BytesIO(), io.BytesIO(), gem_workspace=self.gem,
                                    workspace=self.workspace, invocation_id="b" * 32,
                                    producer_directory=self.producer)
            self.assertFalse((self.private / "worker-evidence").exists())


    def test_git_head_race_oversized_output_and_command_failure_never_qualify(self):
        def result(value): return subprocess.CompletedProcess([], 0, stdout=value)
        with patch.object(capture.subprocess, "run", side_effect=[
            result(str(self.workspace).encode()), result(b"a" * 40), result(b""), result(b"b" * 40)
        ]):
            with self.assertRaisesRegex(ValueError, "head changed"):
                capture.git_snapshot(self.workspace)
        with patch.object(capture.subprocess, "run", return_value=result(b"x" * (capture.LIMIT + 1))):
            with self.assertRaisesRegex(ValueError, "oversized"):
                capture.git_snapshot(self.workspace)
        with patch.object(capture.subprocess, "run", side_effect=subprocess.TimeoutExpired("git", 1)):
            with self.assertRaises(subprocess.TimeoutExpired): capture.git_snapshot(self.workspace)

    def test_file_replaced_in_place_during_read_is_rejected(self):
        original = os.read
        path = self.private / "state.json"
        def changed(fd, size):
            value = original(fd, size)
            path.write_text("{}")
            return value
        with patch.object(capture.os, "read", changed):
            with self.assertRaisesRegex(ValueError, "changed during read"):
                capture.read_owned(path)

    def exit_context(self):
        return dict(gem_workspace=self.gem, workspace=self.workspace,
                    invocation_id="b" * 32, producer_directory=self.producer)

    def prepared_pointer(self):
        value = self.candidate()
        capture.publish_candidate(self.private, value)
        pointer = self.root / "candidate-pointer"
        pointer.write_bytes(b""); pointer.chmod(0o600)
        capture.write_pointer(pointer, value["digest"])
        return pointer, value

    def test_exit_receipt_binds_exact_candidate_and_preserves_both_statuses_without_task_completion(self):
        pointer, candidate = self.prepared_pointer()
        moment = datetime.now(timezone.utc)
        result = capture.record_exit(pointer, 0, 75, **self.exit_context(), now=lambda: moment)
        value = json.loads(result.read_text())
        self.assertEqual(value["candidateDigest"], candidate["digest"])
        self.assertEqual(value["sessionId"], candidate["sessionId"])
        self.assertEqual(value["processExitCode"], 0)
        self.assertEqual(value["launcherExitCode"], 75)
        self.assertTrue(value["workerProcessExited"])
        self.assertFalse(value["taskTerminal"])
        self.assertEqual(capture.record_exit(pointer, 0, 75, **self.exit_context(),
                         now=lambda: moment + timedelta(seconds=1)), result)
        with self.assertRaisesRegex(ValueError, "receipt conflict"):
            capture.record_exit(pointer, 0, 0, **self.exit_context())

    def test_exit_refuses_missing_cross_bound_changed_or_malformed_evidence(self):
        pointer, candidate = self.prepared_pointer()
        for code in (True, -1, 256):
            with self.assertRaisesRegex(ValueError, "exit code invalid"):
                capture.record_exit(pointer, code, 0, **self.exit_context())
        with self.assertRaisesRegex(ValueError, "clock invalid"):
            capture.record_exit(pointer, 0, 0, **self.exit_context(), now=lambda: datetime(2000, 1, 1, tzinfo=timezone.utc))
        with self.assertRaisesRegex(ValueError, "clock invalid"):
            capture.record_exit(pointer, 0, 0, **self.exit_context(), now=lambda: datetime(2026, 1, 1))
        candidate_path = self.private / "worker-evidence" / (candidate["digest"] + ".json")
        original = candidate_path.read_bytes()
        candidate_path.write_text(json.dumps({**candidate, "executionTerminated": True}))
        with self.assertRaisesRegex(ValueError, "candidate cross-bound"):
            capture.record_exit(pointer, 0, 0, **self.exit_context())
        candidate_path.write_bytes(original)
        pointer.write_text("../state.json")
        with self.assertRaisesRegex(ValueError, "pointer invalid"):
            capture.record_exit(pointer, 0, 0, **self.exit_context())
        pointer.write_text(candidate["digest"])
        self.state["active"]["admissionProgress"]["mutationCount"] = 0; self.save()
        with self.assertRaisesRegex(ValueError, "not attempted"):
            capture.record_exit(pointer, 0, 0, **self.exit_context())

    def test_verified_candidate_survives_workspace_cleanup_but_initial_capture_requires_it(self):
        pointer, candidate = self.prepared_pointer()
        shutil.rmtree(self.workspace)
        result = capture.record_exit(pointer, 0, 0, **self.exit_context())
        self.assertEqual(json.loads(result.read_text())["candidateDigest"], candidate["digest"])
        with self.assertRaises(OSError): self.binding()

    def test_capture_pointer_cannot_overwrite_another_attempt_or_follow_symlink(self):
        pointer, candidate = self.prepared_pointer()
        with self.assertRaisesRegex(ValueError, "pointer unsafe"):
            capture.write_pointer(pointer, candidate["digest"])
        pointer.unlink(); pointer.symlink_to(self.private / "state.json")
        with self.assertRaises(OSError): capture.write_pointer(pointer, candidate["digest"])
        value = {"schema": capture.EXIT_SCHEMA, "candidateDigest": "../unsafe"}
        value["digest"] = capture.digest(value)
        with self.assertRaisesRegex(ValueError, "exit reference invalid"):
            capture.publish_candidate(self.private, value)

    def test_main_dispatches_capture_and_exit_only_for_exact_argument_shapes(self):
        with patch.object(capture, "capture", return_value=False) as project:
            self.assertEqual(capture.main(["--candidate-pointer", str(self.root / "pointer")]), 0)
            self.assertEqual(project.call_args.kwargs["pointer"], self.root / "pointer")
        with patch.object(capture, "record_exit") as exited:
            self.assertEqual(capture.main(["--record-exit", str(self.root / "pointer"), "17", "75", str(self.workspace)]), 0)
            self.assertEqual(exited.call_args.args, (self.root / "pointer", 17, 75))
            self.assertEqual(exited.call_args.kwargs["workspace"], self.workspace)
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(capture.main(["--invalid"]), 1)

    def test_main_keeps_errors_constant_and_does_not_print_journal_or_paths(self):
        class BinaryIO:
            buffer = io.BytesIO()
        with patch.object(capture.sys, "stdin", BinaryIO()), patch.object(capture.sys, "stdout", BinaryIO()):
            with patch.object(capture, "capture", return_value=False):
                self.assertEqual(capture.main([]), 0)
            errors = io.StringIO()
            with contextlib.redirect_stderr(errors), patch.object(capture, "capture", side_effect=OSError("SECRET/path")):
                self.assertEqual(capture.main([]), 1)
            self.assertEqual(errors.getvalue(), "worker-evidence: capture-unavailable\n")


if __name__ == "__main__":
    unittest.main()
