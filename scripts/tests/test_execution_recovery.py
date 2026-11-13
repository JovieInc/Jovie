"""Contract tests for the durable execution-attempt ledger (JOV-5926)."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import threading
import unittest
import copy
import io
import runpy
from datetime import datetime, timezone
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / "scripts/lanes/execution_attempt.py"
SPEC = importlib.util.spec_from_file_location("execution_attempt", MODULE)
attempt = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(attempt)
LOCAL = {"kind": "local-test"}
def policy(**overrides):
    return {"attempts": 2, "concurrency": 1, "wallSeconds": 60, "spend": 2, "mutations": 2,
            "leaseSeconds": 10, "version": "test-v1", **overrides}
def owner(name="worker-a"):
    return {"owner": name, "runtime": "test", "provider": "fixture", "model": "none", "tool": "unit", "accountPool": "test"}
from scripts.tests import test_execution_attempt as fixtures

class StaleStatusSweepTest(unittest.TestCase):
    """Every jovie-execution/* status on a PR head ends unless a live lease still owns it."""
    def setUp(self):
        enabled = patch.object(attempt, "IMMUTABLE_WRITER_ENABLED", True)
        enabled.start(); self.addCleanup(enabled.stop)
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        self.sha = "b" * 40
        self.coord = {"kind": "github-status", "repository": "JovieInc/Jovie", "sha": self.sha}
        self.creator = {"login": "jovie-bot[bot]", "type": "Bot", "id": 12}
        self.ident = attempt.identity("pr-remediation", {"repository": "JovieInc/Jovie", "pr": 9, "failure": 0}, {"headSha": self.sha})
        self.statuses, self.posts, self.refs, self.tags = [], [], {}, {}
        self.transport = patch.object(attempt, "_gh", side_effect=self.gh); self.transport.start(); self.addCleanup(self.transport.stop)
    def gh(self, coord, method, endpoint, body=None):
        if method == "POST":
            if endpoint.endswith("/git/tags"):
                sha = attempt.hashlib.sha1(json.dumps(body, sort_keys=True).encode()).hexdigest()
                self.tags[sha] = {**copy.deepcopy(body), "sha": sha, "object": {"type": body["type"], "sha": body["object"]}}
                return copy.deepcopy(self.tags[sha])
            if endpoint.endswith("/git/refs"):
                if body["ref"] in self.refs: return None
                self.refs[body["ref"]] = {"ref": body["ref"], "object": {"type": "tag", "sha": body["sha"]}}
                return copy.deepcopy(self.refs[body["ref"]])
            self.posts.append(body)
            self.statuses.append({**body, "id": len(self.statuses) + 1, "creator": dict(self.creator)}); return {}
        if "/statuses?" in endpoint: return [copy.deepcopy(self.statuses)]
        if "/git/matching-refs/" in endpoint:
            prefix = "refs/" + endpoint.split("/git/matching-refs/", 1)[1]
            return [[copy.deepcopy(ref) for name, ref in self.refs.items() if name.startswith(prefix)]]
        if "/git/tags/" in endpoint: return [copy.deepcopy(self.tags[endpoint.rsplit("/", 1)[1]])]
        self.fail(f"unexpected endpoint: {endpoint}")
    def publish(self, rows, *, legacy=True, creator=None):
        """Mirror the ledger to statuses as the pre-fix writer did (every non-terminal row pending)."""
        previous = None
        for row in rows:
            number = len(self.statuses) + 1
            packed = {**row, "_remote": {"prevStatusId": previous, "eventId": f"fixture-{number}"}}
            state = "pending" if legacy and not row.get("terminalState") else attempt.status_state(row)
            self.statuses.append({"id": number, "context": f"jovie-execution/{self.ident['identityDigest']}", "state": state,
                                  "creator": creator or dict(self.creator),
                                  "target_url": f"https://github.com/JovieInc/Jovie/commit/{self.sha}#jovie-execution={attempt._pack(packed)}"})
            previous = number
    def local(self, *, finish=None, now=100):
        path = self.dir / f"worker-{len(list(self.dir.glob('worker-*.jsonl')))}.jsonl"
        start = attempt.claim(path, self.ident, owner(), policy(leaseSeconds=50, wallSeconds=1000), {"triggerId": "run-1"}, now, LOCAL)
        attempt.boundary(path, self.ident, start["fencingToken"], {"spend": 1, "mutations": 1}, now + 1, LOCAL)
        if finish:
            attempt.finish(path, self.ident, start["fencingToken"], "failed_known", {"failureClass": finish, "failureFingerprint": "f"}, now + 2, LOCAL)
        return attempt._rows(path)
    def sweep(self, now):
        return [item["outcome"] for item in attempt.finalize_stale_statuses(self.dir / "sweep.jsonl", self.coord, now=now)]
    def test_ended_retryable_attempt_is_finalized_without_consuming_its_retry(self):
        self.publish(self.local(finish="repair_incomplete"))
        self.assertEqual(self.sweep(200), ["finalized"])
        self.assertEqual([body["state"] for body in self.posts], ["success"])
        marker = attempt._unpack(self.posts[0]["target_url"].split("#jovie-execution=", 1)[1])
        self.assertEqual((marker["event"], marker["finalizes"], marker["_remote"]["prevStatusId"]), (attempt.FINALIZED, "attempt_finished", 3))
        chain, head = attempt._status_rows(self.statuses, self.ident, strict=True, coordination=self.coord)
        self.assertEqual(([row["event"] for row in chain], head), (["attempt_started", "boundary_admitted", "attempt_finished"], marker["_remote"]["reservationSha"]))
        self.assertEqual(self.sweep(300), [], "a terminal latest status is never rewritten")
        retried = attempt.claim(self.dir / "next.jsonl", self.ident, owner(), policy(leaseSeconds=50, wallSeconds=1000), {"triggerId": "run-2"}, 400, self.coord)
        self.assertTrue(retried["admitted"]); self.assertEqual(retried["attempt"], 2)
        self.assertEqual(self.posts[-1]["state"], "pending")
    def test_readback_rehydrates_missing_or_holed_capability_mirror_in_canonical_order(self):
        rows = self.local()[:1]
        rows += [{**rows[0], "event": "capability_checkpoint", "at": at,
                  "capability": {"checkpoint": marker}} for at, marker in ((101, "A"), (102, "B"))]
        self.publish(rows)
        canonical, _ = attempt._status_rows(self.statuses, self.ident, coordination=self.coord)
        for subset in ([], [canonical[0], canonical[2]]):
            with self.subTest(existing=len(subset)):
                path = self.dir / f"mirror-{len(subset)}.jsonl"
                if subset:
                    path.write_text("".join(json.dumps(row) + "\n" for row in subset))
                result = attempt.resume(path, self.ident, rows[0]["fencingToken"], owner(), now=110, coordination=self.coord)
                self.assertTrue(result["admitted"])
                self.assertEqual([r.get("capability", {}).get("checkpoint") for r in attempt._rows(path)], [None, "A", "B"])
                before = path.read_bytes()
                again = attempt.claim(path, self.ident, owner(), policy(), {"triggerId": "duplicate"}, 111, self.coord)
                self.assertEqual(again["reason"], "duplicate_active")
                self.assertEqual(path.read_bytes(), before)
        self.assertEqual(self.posts, [])

    def test_capability_checkpoint_remains_pending_and_expires_through_original_lease(self):
        rows = self.local()[:1]
        rows.append({**rows[0], "event": "capability_checkpoint", "at": 101,
                     "capability": {"execution": {"outcome": "not-started"}}})
        self.publish(rows)
        self.assertEqual(self.sweep(140), ["live"])
        self.assertEqual(self.posts, [])
        self.assertEqual(self.sweep(151), ["expired"])
        self.assertEqual(self.posts[-1]["state"], "failure")

    def test_live_lease_is_left_pending(self):
        self.publish(self.local())
        self.assertEqual(self.sweep(140), ["live"])
        self.assertEqual(self.posts, [])
    def test_expired_lease_records_the_lost_worker_failure_a_claim_would(self):
        self.publish(self.local())
        self.assertEqual(self.sweep(151), ["expired"])
        self.assertEqual([body["state"] for body in self.posts], ["failure"])
        row = attempt._unpack(self.posts[0]["target_url"].split("#jovie-execution=", 1)[1])
        self.assertEqual((row["terminalState"], row["failureClass"]), ("failed_unknown", "lost_worker"))
        self.assertEqual(attempt._rows(self.dir / "sweep.jsonl")[-1]["failureClass"], "lost_worker")
        self.assertEqual(attempt.claim(self.dir / "next.jsonl", self.ident, owner(), policy(), {}, 400, self.coord)["reason"], "generation_terminal")
        self.assertEqual(self.sweep(500), [])
    def test_untrusted_sealed_or_malformed_pending_statuses_are_not_touched(self):
        self.publish(self.local(finish="repair_incomplete"), creator={"login": "someone", "type": "User"})
        self.assertEqual(self.sweep(200), [])
        self.statuses.clear()
        rows = self.local(finish="repair_incomplete")
        self.publish([*rows, {**rows[-1], "event": "completion_fenced", "sealedAttempt": 2}])
        self.assertEqual(self.sweep(200), ["skipped-sealed"])
        self.statuses.clear()
        self.statuses.append({"id": 1, "context": "jovie-execution/" + "0" * 64, "state": "pending", "creator": dict(self.creator),
                              "target_url": "https://github.com/x#jovie-execution=not-a-receipt"})
        self.statuses.append({"id": 2, "context": "Fork PR Gate", "state": "pending", "creator": dict(self.creator)})
        self.assertEqual(self.sweep(200), ["skipped-malformed"])
        self.assertEqual(self.posts, [])
    def test_new_writer_posts_terminal_for_ended_attempts_so_nothing_needs_sweeping(self):
        self.publish(self.local(finish="repair_incomplete"), legacy=False)
        self.assertEqual([status["state"] for status in self.statuses], ["pending", "pending", "success"])
        self.assertEqual(self.sweep(200), [])
    def test_sweep_requires_live_github_coordination(self):
        with self.assertRaisesRegex(ValueError, "coordination-required"):
            attempt.finalize_stale_statuses(self.dir / "x.jsonl", LOCAL)
        with self.assertRaisesRegex(ValueError, "coordinator-malformed"):
            attempt.finalize_stale_statuses(self.dir / "x.jsonl", {**self.coord, "sha": "nope"})


class CapabilityCheckpointTest(unittest.TestCase):
    setUp = fixtures.ExecutionAttemptTest.setUp
    claim = fixtures.ExecutionAttemptTest.claim

    def checkpoint(self, claimed, **extra):
        import execution_capability as capability
        job = {"id": "run-1", "head": "a" * 40, "action": "issue-dispatch", "principal": "fixture",
               "environment": "test", "owner": "worker-a"}
        return capability.checkpoint(self.path, self.ident, claimed["fencingToken"], extra.pop("who", owner()),
                                     extra.pop("job", job), [{"kind": "tool", "capability": "provider", "scope": "test"}], {},
                                     now=extra.pop("now", 101), coordination=extra.pop("coordination", LOCAL), **extra)

    def test_native_checkpoint_retains_owner_fence_and_does_not_charge_spend(self):
        claimed = self.claim()
        blocked = self.checkpoint(claimed)
        self.assertFalse(blocked["allowed"])
        self.assertEqual(blocked["reason"], "await-explicit-resolution")
        record = blocked["record"]
        self.assertEqual(record["custody"]["lease"], claimed["fencingToken"])
        self.assertEqual(record["capabilityRequests"][0]["kind"], "tool")
        self.assertEqual(attempt._usage(attempt._rows(self.path), 102)["spend"], 0)
        self.assertEqual(attempt.status_state(attempt._rows(self.path)[-1]), "pending")
        self.assertFalse(self.checkpoint(claimed)["allowed"])
        self.assertEqual(self.checkpoint(claimed)["record"]["capabilityRequests"][0]["id"], record["capabilityRequests"][0]["id"])

    def test_no_local_fallback_expired_or_foreign_owner_and_executed_attempt(self):
        claimed = self.claim()
        for arguments in ({"who": owner("other")}, {"now": 111}):
            self.assertEqual(self.checkpoint(claimed, **arguments)["reason"], "accepted-custody-required")
        with self.assertRaisesRegex(ValueError, "execution-coordination-required"):
            self.checkpoint(claimed, coordination=None)
        attempt.boundary(self.path, self.ident, claimed["fencingToken"], {"spend": 1}, now=102,
                         coordination=LOCAL, boundary_id="issue-dispatch")
        self.assertEqual(self.checkpoint(claimed, now=103)["reason"], "execution-readback-required")

    def test_existing_tick_recovers_checkpoint_to_outbox_crash_without_new_execution(self):
        import capability_outbox
        claimed = self.claim()
        job = {"id": "run-1", "head": "a" * 40, "action": "issue-dispatch", "principal": "fixture",
               "environment": "test", "owner": "worker-a", "linearIssueId": "cause"}
        self.checkpoint(claimed, job=job)
        state = Path(self.tmp.name) / "state"
        ledger = state / "runs" / "execution-attempts.jsonl"
        ledger.parent.mkdir(parents=True)
        ledger.write_text(self.path.read_text())
        capability_outbox.reconcile(state)
        first = (state / "linear" / "outbox.json").read_text()
        capability_outbox.reconcile(state)
        self.assertEqual((state / "linear" / "outbox.json").read_text(), first)
        self.assertEqual(len(json.loads(first)["capabilityRequests"]), 1)
        self.assertEqual(attempt._usage(attempt._rows(ledger), 102)["attempts"], 1)

    def test_canceled_checkpoint_cannot_create_or_send_a_new_capability_request(self):
        import capability_outbox
        claimed = self.claim()
        job = {"id": "run-1", "head": "a" * 40, "action": "issue-dispatch", "principal": "fixture",
               "environment": "test", "owner": "worker-a", "linearIssueId": "cause"}
        self.checkpoint(claimed, job=job)
        attempt.finish(self.path, self.ident, claimed["fencingToken"], "canceled", {}, now=102, coordination=LOCAL)
        state = Path(self.tmp.name) / "state"
        ledger = state / "runs" / "execution-attempts.jsonl"
        ledger.parent.mkdir(parents=True)
        ledger.write_text(self.path.read_text())
        with patch.object(capability_outbox, "transition") as bridge:
            self.assertEqual(capability_outbox.flush(state, None, lambda _: True, now=103), [])
            bridge.assert_not_called()
        self.assertFalse((state / "linear" / "outbox.json").exists())

    def test_native_signed_resolution_reserves_same_fence_once_under_concurrent_callers(self):
        import capability_outbox
        import execution_capability
        source = """
import { readFileSync } from 'node:fs';
import { nativeCapabilityTransition } from './scripts/lib/native-capability-adapter.mjs';
import { keys, receipt } from './scripts/lib/__tests__/fixtures/capability-request.mjs';
import { CAPABILITY_PROBE_SCHEMA } from './scripts/lib/capability-request.mjs';
const input = JSON.parse(readFileSync(0, 'utf8'));
keys.fixture.owner = input.record.job.owner;
input.resolution = {}; input.probe = {};
for (const req of input.record.capabilityRequests ?? []) {
  const times = { issuedAt: new Date(input.nowMs).toISOString(), expiresAt: req.expiresAt };
  input.resolution[req.id] = receipt(req, undefined, times);
  input.probe[req.id] = receipt(req, CAPABILITY_PROBE_SCHEMA, times);
}
process.stdout.write(JSON.stringify(await nativeCapabilityTransition(input, keys)));
"""
        claimed = self.claim(now=1794600000, policy=policy(leaseSeconds=600))
        first = self.checkpoint(claimed, now=1794600001)
        def signed(payload):
            ran = subprocess.run(["node", "--input-type=module", "-e", source], cwd=ROOT,
                                 input=json.dumps(payload), capture_output=True, text=True, check=True, timeout=10)
            return json.loads(ran.stdout)
        with patch.object(capability_outbox, "transition", signed):
            with ThreadPoolExecutor(max_workers=2) as pool:
                answers = list(pool.map(lambda _: self.checkpoint(claimed, now=1794600002), range(2)))
        self.assertEqual(sum(result["allowed"] for result in answers), 1)
        accepted = next(result for result in answers if result["allowed"])
        self.assertEqual(accepted["record"]["custody"]["lease"], claimed["fencingToken"])
        self.assertEqual(accepted["record"]["job"], first["record"]["job"])
        attempt.boundary(self.path, self.ident, claimed["fencingToken"], {"spend": 1}, now=1794600003,
                         coordination=LOCAL, boundary_id="issue-dispatch")
        self.assertEqual(self.checkpoint(claimed, now=1794600004)["reason"], "execution-readback-required")
        self.assertEqual(attempt._usage(attempt._rows(self.path), 1794600004)["attempts"], 1)


    def test_changed_head_and_untrusted_resolution_cannot_resume(self):
        claimed = self.claim()
        blocked = self.checkpoint(claimed)
        record = blocked["record"]
        changed = self.checkpoint(claimed, job={**record["job"], "head": "b" * 40})
        self.assertFalse(changed["allowed"])
        self.assertEqual(changed["reason"], "current-job-binding-unverified")
        req = record["capabilityRequests"][0]
        result = self.checkpoint(claimed, resolution={req["id"]: {"decision": "approved", "signature": "untrusted"}})
        self.assertFalse(result["allowed"])


if __name__ == "__main__": unittest.main()
