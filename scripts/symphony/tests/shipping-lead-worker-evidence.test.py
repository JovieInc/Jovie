"""Native protocol lifecycle regressions; no provider calls or worker launches."""
from datetime import datetime, timedelta, timezone
import importlib.util
import io
import json
from pathlib import Path
import unittest

PATH = Path(__file__).resolve().parents[1] / "shipping_lead_worker_evidence.py"
spec = importlib.util.spec_from_file_location("worker_evidence", PATH)
evidence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evidence)


class NativeEvidenceTest(unittest.TestCase):
    def setUp(self):
        self.binding = {"taskDigest": "a" * 64, "issueId": "00000000-0000-4000-8000-000000006586",
                        "identifier": "JOV-6586", "invocationId": "b" * 32,
                        "runtimeGeneration": "c" * 64, "producerSha256": "d" * 64,
                        "workspace": "/srv/worktrees/JOV-6586"}
        self.head = "e" * 40
        self.clean = True
        self.now = datetime(2026, 9, 25, tzinfo=timezone.utc)
        self.reader = evidence.NativeTurnEvidence(self.binding, git=self.git, now=lambda: self.now)

    def git(self):
        return {"head": self.head, "clean": self.clean}

    def thread(self, **updates):
        return {"method": "thread/started", "params": {"thread": {
            "id": "thread-1", "cwd": self.binding["workspace"], **updates}}}

    def turn(self, method="turn/started", turn_id="turn-1", status="inProgress", **updates):
        return {"method": method, "params": {"threadId": "thread-1", "turn": {
            "id": turn_id, "status": status, "items": [], **updates}}}

    def start(self):
        self.reader.observe(self.thread())
        self.reader.observe(self.turn())
        self.head = "f" * 40
        self.now += timedelta(seconds=30)

    def complete(self, **updates):
        return self.reader.observe(self.turn("turn/completed", status="completed", **updates))

    def test_candidate_binds_observed_worker_and_changed_clean_head_but_never_claims_execution_stop(self):
        self.start()
        result = self.complete()
        self.assertEqual(result["taskDigest"], self.binding["taskDigest"])
        self.assertEqual(result["sessionId"], "thread-1-turn-1")
        self.assertEqual(result["executionBaseHead"], "e" * 40)
        self.assertEqual(result["executionFinalHead"], "f" * 40)
        self.assertFalse(result["executionTerminated"])
        self.assertEqual(result["digest"], evidence.digest({k: v for k, v in result.items() if k != "digest"}))
        self.assertEqual(self.reader.finish(), result)
        result["sessionId"] = "tampered"
        self.assertEqual(self.reader.finish()["sessionId"], "thread-1-turn-1")

    def test_next_turn_invalidates_previous_candidate_until_its_own_completion(self):
        self.start(); self.complete()
        self.reader.observe(self.turn(turn_id="turn-2"))
        self.assertIsNone(self.reader.finish())
        result = self.reader.observe(self.turn("turn/completed", turn_id="turn-2", status="completed"))
        self.assertEqual(result["sessionId"], "thread-1-turn-2")
        self.assertEqual(result["sessionIds"], ["thread-1-turn-1", "thread-1-turn-2"])
        self.assertLessEqual(result["threadStartedAt"], result["startedAt"])
        result["sessionIds"].clear()
        self.assertEqual(self.reader.finish()["sessionIds"], ["thread-1-turn-1", "thread-1-turn-2"])

    def test_failed_interrupted_or_error_bearing_turn_cannot_qualify_changed_git_head(self):
        for status, error in [("failed", {"message": "synthetic failure"}), ("interrupted", None),
                              ("completed", {"message": "inconsistent result"})]:
            with self.subTest(status=status):
                self.setUp(); self.start()
                result = self.reader.observe(self.turn("turn/completed", status=status, error=error))
                self.assertIsNone(result)
                self.assertIsNone(self.reader.finish())

    def test_empty_success_and_dirty_workspace_are_not_useful_work(self):
        for head, clean in [("e" * 40, True), ("f" * 40, False)]:
            with self.subTest(clean=clean):
                self.setUp(); self.start(); self.head = head; self.clean = clean
                self.assertIsNone(self.complete())
                self.assertIsNone(self.reader.finish())

    def test_tool_output_response_and_nested_lifecycle_text_cannot_forge_completion(self):
        self.start()
        for notification in [None, "turn/completed", {**self.turn("turn/completed", status="completed"), "id": 3},
                             {"method": "item/completed", "params": {"output": self.turn("turn/completed", status="completed")}}]:
            self.assertIsNone(self.reader.observe(notification))
        self.assertIsNone(self.reader.finish())
        self.assertIsNotNone(self.complete())

    def test_cross_bound_or_ambiguous_lifecycle_poisons_all_later_proof(self):
        bad = [self.thread(id="thread-2"), self.thread(cwd="/another/workspace"),
               {"method": "turn/completed", "params": None},
               {"method": "turn/completed", "params": {"threadId": "other", "turn": {"id": "turn-1"}}},
               self.turn("turn/completed", turn_id="other", status="completed"),
               self.turn("turn/completed", status="unknown"), self.turn()]
        for value in bad:
            with self.subTest(value=value):
                self.setUp(); self.start()
                with self.assertRaises(ValueError): self.reader.observe(value)
                self.assertIsNone(self.reader.finish())
                with self.assertRaisesRegex(ValueError, "poisoned"): self.complete()

    def test_missing_start_or_duplicate_completion_is_never_a_terminal_receipt(self):
        with self.assertRaisesRegex(ValueError, "cross-bound"): self.complete()
        self.setUp(); self.reader.observe(self.thread())
        with self.assertRaisesRegex(ValueError, "matching start"): self.complete()
        self.setUp(); self.start(); self.complete()
        with self.assertRaisesRegex(ValueError, "matching start"): self.complete()
        self.assertIsNone(self.reader.finish())

    def test_dirty_initial_workspace_and_unreadable_git_fail_closed(self):
        self.clean = False
        with self.assertRaisesRegex(ValueError, "initial workspace is dirty"): self.reader.observe(self.thread())
        self.setUp(); self.start()
        self.reader.git = lambda: {"head": "invalid", "clean": True}
        with self.assertRaisesRegex(ValueError, "Git snapshot invalid"): self.complete()
        self.assertIsNone(self.reader.finish())

    def test_non_utc_or_regressed_clock_fails_closed(self):
        for now in [datetime(2026, 9, 25), datetime(2026, 9, 24, tzinfo=timezone.utc)]:
            with self.subTest(now=now):
                self.setUp(); self.start(); self.now = now
                with self.assertRaisesRegex(ValueError, "clock"): self.complete()
                self.assertIsNone(self.reader.finish())

    def test_invalid_binding_cannot_select_a_different_scope(self):
        for key, value in [("taskDigest", "bad"), ("issueId", "-" * 36), ("identifier", "LYB-1"),
                           ("invocationId", "bad"), ("workspace", "relative"),
                           ("workspace", "/srv/../other"), ("workspace", "/srv/\x00other")]:
            with self.subTest(key=key, value=value), self.assertRaisesRegex(ValueError, "binding invalid"):
                evidence.NativeTurnEvidence({**self.binding, key: value}, git=self.git)

    def test_duplicate_turn_id_and_unbounded_lifecycle_fail_closed(self):
        self.start(); self.complete()
        with self.assertRaisesRegex(ValueError, "lifecycle invalid"): self.reader.observe(self.turn())
        self.setUp(); self.reader.observe(self.thread())
        for n in range(256):
            self.reader.observe(self.turn(turn_id=f"turn-{n}"))
            self.reader.observe(self.turn("turn/completed", turn_id=f"turn-{n}", status="completed"))
        with self.assertRaisesRegex(ValueError, "lifecycle invalid"):
            self.reader.observe(self.turn(turn_id="turn-overflow"))


    def stream_bytes(self):
        notifications = [self.thread(), self.turn(), self.turn("turn/completed", status="completed")]
        return b"".join(json.dumps(value).encode() + b"\n" for value in notifications)

    def stream_reader(self):
        snapshots = iter([{"head": "e" * 40, "clean": True}, {"head": "f" * 40, "clean": True}])
        return evidence.NativeTurnEvidence(self.binding, git=lambda: next(snapshots), now=lambda: self.now)

    def test_native_pipe_copy_preserves_bytes_and_publishes_only_complete_stream(self):
        data = self.stream_bytes(); output = io.BytesIO(); published = []
        self.assertTrue(evidence.capture_stream(io.BytesIO(data), output, self.stream_reader(), published.append))
        self.assertEqual(output.getvalue(), data)
        self.assertEqual(len(published), 1)
        self.assertEqual(published[0]["executionFinalHead"], "f" * 40)
        self.assertFalse(published[0]["executionTerminated"])

    def test_starting_head_is_captured_before_releasing_thread_to_client(self):
        class Lines(io.BytesIO):
            def read1(self, _size): return self.readline()
        owner = self
        class Client(io.BytesIO):
            def write(self, chunk):
                result = super().write(chunk)
                if b'thread/started' in chunk:
                    owner.head = "f" * 40
                return result
        published = []
        self.assertTrue(evidence.capture_stream(Lines(self.stream_bytes()), Client(), self.reader, published.append))
        self.assertEqual(published[0]["executionBaseHead"], "e" * 40)
        self.assertEqual(published[0]["executionFinalHead"], "f" * 40)

    def test_fragmented_stream_preserves_every_byte(self):
        class Fragments(io.BytesIO):
            def read1(self, _size): return self.read(7)
        data = self.stream_bytes(); output = io.BytesIO(); published = []
        self.assertTrue(evidence.capture_stream(Fragments(data), output, self.stream_reader(), published.append))
        self.assertEqual(output.getvalue(), data)
        self.assertEqual(len(published), 1)

    def test_malformed_oversized_or_truncated_stream_forwards_but_cannot_publish(self):
        for suffix, bound in [(b"{\n", 1024), (b"\xff\n", 1024), (b'{"unfinished":', 1024),
                              (b"x" * 1025 + b"\n", 1024), (b"x" * 1025, 1024)]:
            with self.subTest(suffix=suffix[:20]):
                output = io.BytesIO(); published = []; data = self.stream_bytes() + suffix
                self.assertFalse(evidence.capture_stream(io.BytesIO(data), output, self.stream_reader(), published.append,
                                                         max_line_bytes=bound))
                self.assertEqual(output.getvalue(), data)
                self.assertEqual(published, [])

    def test_broken_consumer_pipe_never_publishes_and_persistence_errors_surface(self):
        class Broken:
            def write(self, _chunk): raise BrokenPipeError()
        published = []
        with self.assertRaises(BrokenPipeError):
            evidence.capture_stream(io.BytesIO(self.stream_bytes()), Broken(), self.stream_reader(), published.append)
        self.assertEqual(published, [])
        def unavailable(_candidate): raise OSError("disk unavailable")
        with self.assertRaisesRegex(OSError, "disk unavailable"):
            evidence.capture_stream(io.BytesIO(self.stream_bytes()), io.BytesIO(), self.stream_reader(), unavailable)

    def test_observation_io_failure_cannot_break_native_protocol_or_publish_proof(self):
        def unavailable(): raise OSError("workspace no longer available")
        reader = evidence.NativeTurnEvidence(self.binding, git=unavailable, now=lambda: self.now)
        data = self.stream_bytes(); output = io.BytesIO(); published = []
        self.assertFalse(evidence.capture_stream(io.BytesIO(data), output, reader, published.append))
        self.assertEqual(output.getvalue(), data)
        self.assertEqual(published, [])

    def test_oversized_fragment_is_discarded_until_its_newline(self):
        class Fragments(io.BytesIO):
            def read1(self, _size): return self.read(7)
        data = b"x" * 300 + b"\n" + self.stream_bytes()
        output = io.BytesIO(); published = []
        self.assertFalse(evidence.capture_stream(Fragments(data), output, self.stream_reader(), published.append,
                                                 max_line_bytes=256))
        self.assertEqual(output.getvalue(), data)
        self.assertEqual(published, [])

    def test_empty_stream_and_invalid_bound_do_not_create_evidence(self):
        self.assertFalse(evidence.capture_stream(io.BytesIO(), io.BytesIO(), self.reader, self.fail))
        with self.assertRaisesRegex(ValueError, "line bound"):
            evidence.capture_stream(io.BytesIO(), io.BytesIO(), self.reader, self.fail, max_line_bytes=0)


if __name__ == "__main__":
    unittest.main()
