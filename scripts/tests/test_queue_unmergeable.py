"""Native queue recovery keeps the hosted writer and its exact-head stop receipt."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from threading import Event

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("queue_unmergeable", ROOT / "scripts/lanes/queue_unmergeable.py")
queue = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(queue)
NOW = 1800000000.0


class QueueRecoveryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = Path(self.tmp.name)
        self.head, self.calls, self.failure = "a" * 40, [], False

    def run_gh(self, args, **kwargs):
        self.calls.append(args)
        if any("mergeQueue" in arg for arg in args):
            nodes = getattr(self, "entries", [{"state": "UNMERGEABLE", "position": 3,
                      "pullRequest": {"id": "PR_1", "number": 26212, "headRefOid": self.head}}] if self.head else [])
            return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({
                "data": {"repository": {"mergeQueue": {"entries": {"nodes": nodes}}}}}))
        self.assertEqual(args[:3], ["workflow", "run", "merge-queue-green-enroll.yml"])
        saved = json.loads((self.state / queue.SEEN_FILE).read_text())
        number = args[-1].split("=", 1)[1]
        self.assertIn("requestedAt", saved[f"{number}@{self.head}"])
        if self.failure == "timeout":
            raise subprocess.TimeoutExpired(args, 60)
        return SimpleNamespace(returncode=int(self.failure), stderr="response lost" if self.failure else "", stdout="")

    def sweep(self, at):
        return queue.sweep(self.state, self.run_gh, at)

    def test_request_once_before_any_queue_mutation_and_preserve_claim_across_absence(self):
        self.assertEqual(self.sweep(NOW)["seen"][0]["pr"], 26212)
        done = self.sweep(NOW + queue.GRACE_S + 1)
        self.assertEqual(done["requested"], [26212])
        self.assertEqual(done["dequeued"], [], "dispatch acknowledgement is not a dequeue receipt")
        self.sweep(NOW + 2 * queue.GRACE_S)
        self.head = None
        self.sweep(NOW + 3 * queue.GRACE_S)
        self.head = "a" * 40
        self.sweep(NOW + 4 * queue.GRACE_S)
        dispatched = [args for args in self.calls if args[0] == "workflow"]
        self.assertEqual(dispatched, [["workflow", "run", "merge-queue-green-enroll.yml",
                                      "--repo", "JovieInc/Jovie", "--ref", "main", "-f", "pr_number=26212"]])
        self.assertFalse(any("dequeuePullRequest" in str(args) for args in self.calls))
        self.assertIn('"action": "central-dequeue-requested"', (self.state / queue.LOG_FILE).read_text())

    def test_ambiguous_dispatch_does_not_retry_and_a_new_head_gets_its_own_grace(self):
        self.failure = "timeout"
        self.sweep(NOW)
        self.assertTrue(self.sweep(NOW + queue.GRACE_S + 1)["errors"])
        self.sweep(NOW + 2 * queue.GRACE_S)
        self.assertEqual(sum(args[0] == "workflow" for args in self.calls), 1)
        self.head, self.failure = "b" * 40, False
        self.sweep(NOW + 3 * queue.GRACE_S)
        self.assertEqual(self.sweep(NOW + 4 * queue.GRACE_S + 1)["requested"], [26212])

    def test_existing_per_tick_request_cap_and_missing_head_are_preserved(self):
        self.entries = [{"state": "UNMERGEABLE", "position": n + 1,
                         "pullRequest": {"number": n + 1, "headRefOid": self.head}} for n in range(5)]
        self.entries.append({"state": "UNMERGEABLE", "pullRequest": {"number": 9}})
        self.sweep(NOW)
        first = self.sweep(NOW + queue.GRACE_S + 1)
        self.assertEqual(first["requested"], [1, 2, 3])
        self.assertTrue(first["errors"], "a missing head never authorizes a request")
        self.assertEqual(self.sweep(NOW + queue.GRACE_S + 2)["requested"], [4, 5])

    def test_legacy_age_is_retained_but_corrupt_request_history_fails_closed(self):
        path = self.state / queue.SEEN_FILE
        path.write_text(json.dumps({f"26212@{self.head}": NOW - queue.GRACE_S - 1}))
        self.assertEqual(self.sweep(NOW)["requested"], [26212])
        for broken in ("broken", "[]", '{"old":null}'):
            with self.subTest(broken=broken):
                path.write_text(broken)
                self.assertTrue(self.sweep(NOW + 2 * queue.GRACE_S)["errors"])
                self.assertEqual(path.read_text(), broken)
        self.assertEqual(sum(args[0] == "workflow" for args in self.calls), 1)

    def test_concurrent_observers_share_the_existing_spent_request(self):
        self.sweep(NOW)
        started, release = Event(), Event()
        real = self.run_gh
        def slow(args, **kwargs):
            if args[0] == "workflow":
                started.set()
                self.assertTrue(release.wait(5))
            return real(args, **kwargs)
        with ThreadPoolExecutor(1) as pool, patch.object(self, "run_gh", side_effect=slow):
            first = pool.submit(self.sweep, NOW + queue.GRACE_S + 1)
            self.assertTrue(started.wait(5))
            try:
                self.assertIn("in progress", self.sweep(NOW + queue.GRACE_S + 2)["errors"][0])
            finally:
                release.set()
            self.assertEqual(first.result()["requested"], [26212])
        self.assertEqual(sum(args[0] == "workflow" for args in self.calls), 1)


class NativeReceiptOrderTest(unittest.TestCase):
    def test_real_native_dequeue_block_stamps_first_and_keeps_the_entry_if_receipt_fails(self):
        source = (ROOT / "scripts/drain-pr-queue.sh").read_text()
        function = source.split("record_unmergeable_eject_receipt()", 1)[1].split("\n}\n", 1)[0]
        block = source.split("# --- DEQUEUE: parked UNMERGEABLE", 1)[1].split("# --- INVENTORY + DEQUEUE:", 1)[0]
        block = block[block.index('echo "=== DEQUEUE'):]
        for failure in (False, True):
            with self.subTest(receipt_failure=failure), tempfile.TemporaryDirectory() as raw:
                log = Path(raw) / "mutations"
                head = "a" * 40
                env = {**os.environ, "ORDER_LOG": str(log), "RECEIPT_FAIL": str(int(failure)),
                       "SNAP": json.dumps([{"n": 26212, "t": "recovery", "q": True, "qs": "UNMERGEABLE",
                                            "m": "MERGEABLE", "headOid": head, "L": []}])}
                fixture = '''
set -euo pipefail
REPO=JovieInc/Jovie
DRY_RUN=0
DRAIN_PROMOTION_MODE=normal
DRAIN_FREEZE_EXISTING_QUEUE=0
MACHINE_HOLD_JQ='false'
UNMERGEABLE_EJECT_CONTEXT=jovie-native-unmergeable/v1
waiting_lane_allows_clean_enroll() { return 0; }
unmergeable_eject_receipt_head() { :; }
fleet_hold_target_url() { echo https://github.com/JovieInc/Jovie/actions/runs/77; }
gh_retry() { echo '{"state":"OPEN","headRefOid":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'; }
gh_mutate_retry() { echo status >> "$ORDER_LOG"; return "$RECEIPT_FAIL"; }
dequeue_strict() { echo dequeue >> "$ORDER_LOG"; }
'''
                done = subprocess.run(["bash", "-c", fixture + "record_unmergeable_eject_receipt()" + function +
                                       "\n}\n" + block], cwd=ROOT, env=env, capture_output=True, text=True)
                self.assertEqual(done.returncode, int(failure), done.stderr)
                self.assertEqual(log.read_text().splitlines(), ["status"] if failure else ["status", "dequeue"])
