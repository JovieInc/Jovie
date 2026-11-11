"""Real journal/flock/execution-fence tests; provider evidence is offline and injected."""
import copy
import json
import os
import subprocess
import tempfile
import sys
from concurrent.futures import ThreadPoolExecutor
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import cloud_lane as cloud
import cloud_lane_state as journal
import codex_lane as codex
import codex_cloud_occupancy as occupancy
import codex_cloud_evidence as evidence
import execution_attempt as execution


class Readback:
    def __init__(self, fixture):
        self.fixture, self.receipt = fixture, None
        self.submit_result = lambda command: subprocess.CompletedProcess(command, 0, "task_offline", "")

    def compatibility(self, account, env):
        return {"supported": True, "account": account, "environment": env, "cliVersion": "0.162.1",
                "bindingDigest": execution.digest(codex.subscription_binding(self.fixture.profiles[account])),
                "evidenceDigest": "e" * 64, "observedAt": self.fixture.now,
                "checkpointKinds": ["saved-checkpoint", "pushed-artifact"]}

    def submit(self, reservation, command):
        return self.submit_result(command)

    def submit_successor(self, reservation, command):
        self.fixture.assertIn("checkpoint", reservation)
        self.fixture.assertIn("predecessor", reservation)
        return subprocess.CompletedProcess(command, 0, "task_successor", "")

    def readback(self, row):
        return copy.deepcopy(self.receipt)


class CloudOccupancyTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.now = time.time()
        self.path = self.root / "cloud.jsonl"
        self.profiles = {name: {"home": str(self.root / name), "emailSha256": digit * 64, "slots": 1}
                         for name, digit in (("alpha", "a"), ("beta", "b"))}
        self.env = {"LANES_CLOUD_ENABLED": "1", "CLOUD_LANE_LEDGER": str(self.path),
                    "CODEX_CLOUD_ENV": "offline-env", "CODEX_CLOUD_BINARY": "/offline/codex"}
        for manager in (patch.dict(os.environ, self.env), patch.object(codex, "STATE", self.root / "accounts.json"),
                        patch.object(codex, "subscription_pool_mode", return_value=True),
                        patch.object(codex, "subscription_profiles", return_value=self.profiles)):
            manager.start()
            self.addCleanup(manager.stop)
        self.state = {}
        for name, profile in self.profiles.items():
            snapshot = {"rateLimits": {"rateLimits": {key: {"usedPercent": 20, "resetsAt": self.now + 5000,
                                "windowDurationMins": mins} for key, mins in (("primary", 300), ("secondary", 10080))}}}
            self.state[name] = {"subscriptionBinding": codex.subscription_binding(profile),
                                "subscriptionIdentityVerifiedAt": self.now,
                                "capacityLease": codex.build_capacity_lease(name, snapshot, now=self.now)}
        codex.update_state(lambda state: state.update(copy.deepcopy(self.state)))
        self.owner = {"host": "offline-fixture", "worker": "test"}
        self.policy = {"attempts": 4, "concurrency": 1, "wallSeconds": 10000, "spend": 0,
                       "mutations": 10, "leaseSeconds": 10000}
        self.ident = execution.identity("offline-cloud", {"issue": "JOV-TEST"}, {"generation": 1})
        self.execution_path = self.root / "attempts.jsonl"
        claimed = execution.claim(self.execution_path, self.ident, self.owner, self.policy, {}, now=self.now, coordination={"kind": "local-test"})
        self.token = claimed["fencingToken"]
        self.context = {"path": str(self.execution_path), "identity": self.ident, "owner": self.owner, "coordination": {"kind": "local-test"}}
        self.adapter = Readback(self)
        self.driver = occupancy.Occupancy("alpha", self.context, self.adapter, lane=codex, now=lambda: self.now)

    def reserve(self, **kwargs):
        return self.driver.reserve("JOV-TEST", "offline-env", self.token, **kwargs)

    def submitted(self):
        result = self.reserve()
        self.assertTrue(result["ok"], result)
        row = result["reservation"]
        return self.driver.submitted(row["reservationId"], "task_offline")

    def proof(self, row, state="accepted", **changes):
        return {**{k: row[k] for k in ("account", "env", "bindingDigest", "submissionId", "fencingToken")},
                "task": row.get("task", "task_offline"), "workerId": "worker-offline", "supported": True,
                "observedAt": self.now, "state": state, **changes}

    def accepted(self):
        row = self.submitted()
        self.adapter.receipt = self.proof(row)
        result = self.driver.reconcile(row["reservationId"])
        self.assertTrue(result["ok"], result)
        return result["reservation"]

    def test_unknown_submission_survives_restart_and_blocks_local_and_duplicate_cloud(self):
        calls = []
        def timeout(cmd):
            calls.append(cmd)
            raise subprocess.TimeoutExpired("offline", 1)
        self.adapter.submit_result = timeout
        result = cloud.route("JOV-TEST", "codex", ["cloud-lane"], "typo", "fix typo", occupancy=self.driver,
                             run=timeout, main_sha="b" * 40, fencing_token=self.token)
        self.assertEqual(result["reason"], "unknown-submit-outcome")
        self.assertEqual(len(calls), 1)
        self.assertIsNone(codex.lease("alpha"))
        self.assertEqual(codex._free_slots("alpha"), 0)
        probe = "import sys; from pathlib import Path; sys.path.insert(0, sys.argv[1]); import codex_lane as c; c.STATE=Path(sys.argv[2]); h=c.lease('alpha'); print(h is None); h and h.close()"
        result = subprocess.run([sys.executable, "-c", probe, str(Path(codex.__file__).parent), str(codex.STATE)],
                                capture_output=True, text=True, check=True)
        self.assertEqual(result.stdout.strip(), "True")
        restarted = occupancy.Occupancy("alpha", self.context, self.adapter, lane=codex, now=lambda: self.now)
        self.assertFalse(restarted.reserve("JOV-TEST", "offline-env", self.token)["ok"])
        self.assertEqual(journal.live_claim("JOV-TEST")["stage"], "cloud-held")
        row = next(iter(occupancy.reservations().values()))
        self.assertEqual(row["phase"], "unknown")
        self.adapter.receipt = self.proof(row)
        self.assertTrue(restarted.reconcile(row["reservationId"])["ok"])
        self.assertIsNone(codex.lease("alpha"))
        self.assertEqual(len(calls), 1)

    def test_local_flock_blocks_cloud_and_other_account_remains_available(self):
        held = codex.lease("alpha")
        self.assertIsNotNone(held)
        self.addCleanup(held.close)
        self.assertEqual(self.reserve()["reason"], "account-occupancy")
        other = codex.lease("beta")
        self.assertIsNotNone(other)
        other.close()
        self.assertFalse(self.path.exists())

    def test_returned_task_id_is_not_worker_acceptance(self):
        result = cloud.route("JOV-TEST", "codex", ["cloud-lane"], "typo", "fix typo", occupancy=self.driver,
                             run=lambda cmd: subprocess.CompletedProcess(cmd, 0, "task_offline", ""),
                             main_sha="b" * 40, fencing_token=self.token)
        self.assertFalse(result["accepted"])
        row = occupancy.reservations()[result["reservationId"]]
        self.assertEqual(row["phase"], "submitted")
        self.assertEqual(occupancy.publication_reason(journal.read(), "JOV-TEST", "task_offline", self.token,
                                                    self.now), "worker-acceptance-unverified")
        self.adapter.receipt = {"task": "task_offline", "observedAt": self.now}
        self.assertFalse(self.driver.reconcile(row["reservationId"])["ok"])
        self.assertIsNone(codex.lease("alpha"))

    def test_completion_releases_once_and_never_clears_cooldowns(self):
        row = self.accepted()
        codex.update_state(lambda state: state["beta"].update(exhaustedUntil=self.now + 500, lastKind="rate"))
        codex.update_state(lambda state: state["alpha"].update(exhaustedUntil=self.now + 500, lastKind="auth"))
        before = codex.read_state()
        self.adapter.receipt = self.proof(row, "completed", writerStopped=True)
        self.assertTrue(self.driver.reconcile(row["reservationId"])["released"])
        count = len(journal.read())
        self.assertFalse(self.driver.reconcile(row["reservationId"])["released"])
        self.assertEqual(len(journal.read()), count)
        self.assertEqual(codex.read_state(), before)
        self.assertFalse(codex.available("alpha", before, self.now))
        self.assertEqual(codex._free_slots("alpha"), 1)

    def test_stale_identity_mismatch_capacity_windows_reset_and_cooldowns_block(self):
        mutations = [(lambda r: r.update(subscriptionIdentityVerifiedAt=self.now - 3601), "identity-stale"),
                     (lambda r: r["subscriptionBinding"].update(emailSha256="0" * 64), "identity-mismatch"),
                     (lambda r: r["capacityLease"]["sources"]["capacity"].update(observedAt="invalid"), "capacity-stale")]
        for key in ("primary", "secondary"):
            mutations += [(lambda r, k=key: r["capacityLease"]["usableCapacityRemaining"][k].update(remainingPercent=0), f"quota-floor:{key}"),
                          (lambda r, k=key: r["capacityLease"]["usableCapacityRemaining"][k].update(resetsAt=self.now - 1), f"reset-unverified:{key}")]
        for kind, reason in (("auth", "authentication-cooldown"), ("rate", "burst-rate-cooldown"), ("limit", "quota-cooldown")):
            mutations.append((lambda r, k=kind: r.update(exhaustedUntil=self.now + 1, lastKind=k), reason))
        for mutate, reason in mutations:
            with self.subTest(reason=reason):
                state = copy.deepcopy(self.state)
                mutate(state["alpha"])
                codex.update_state(lambda target: target.update(state))
                self.assertEqual(self.reserve()["reason"], reason)
                self.assertFalse(self.path.exists())

    def test_local_profile_does_not_prove_cloud_compatibility(self):
        for change in ({"supported": False}, {"environment": "elsewhere"}, {"cliVersion": "unknown"},
                       {"account": "beta"}, {"bindingDigest": "f" * 64}, {"observedAt": self.now - 3601}):
            with self.subTest(change=change):
                proof = self.adapter.compatibility("alpha", "offline-env")
                with patch.object(self.adapter, "compatibility", return_value={**proof, **change}):
                    self.assertEqual(self.reserve()["reason"], "cloud-compatibility-unverified")
        self.assertFalse(self.path.exists())

    def test_mismatched_acceptance_or_unproven_completion_retains_occupancy(self):
        row = self.submitted()
        for change in ({"account": "beta"}, {"task": "task_other"}, {"submissionId": "wrong"},
                       {"env": "other"}, {"fencingToken": "wrong"}, {"bindingDigest": "wrong"},
                       {"workerId": ""}, {"observedAt": self.now - 3601}, {"state": "completed", "writerStopped": True}):
            with self.subTest(change=change):
                self.adapter.receipt = self.proof(row, **change)
                self.assertFalse(self.driver.reconcile(row["reservationId"])["ok"])
                self.assertIsNone(codex.lease("alpha"))

    def test_old_execution_fence_cannot_reach_publication_intent(self):
        row = self.accepted()
        cloud._disposition("JOV-TEST", "codex", "cloud-pending", "accepted", self.path, self.now,
                           task=row["task"], branch="cloud/test", fencing_token=self.token)
        execution.finish(self.execution_path, self.ident, self.token, "superseded", {}, now=self.now, coordination={"kind": "local-test"})
        with patch.object(cloud.time, "time", return_value=self.now):
            self.assertEqual(cloud._fence(self.path, "JOV-TEST", row["task"], "intent:push", self.token),
                             "stale-execution-fence")
        self.assertFalse(any(r["stage"] == "intent:push" for r in journal.read()))

    def test_successor_requires_saved_provenance_new_fence_and_accepted_ownership(self):
        row = self.accepted()
        saved = {"kind": "pushed-artifact", "reference": "offline-ref", "digest": "d" * 64,
                 "sourceTask": row["task"], "sourceFence": self.token}
        self.adapter.receipt = self.proof(row, "completed", writerStopped=True, checkpoint=saved)
        self.assertTrue(self.driver.reconcile(row["reservationId"])["ok"])
        self.assertFalse(self.reserve(previous=row["reservationId"])["ok"])
        execution.finish(self.execution_path, self.ident, self.token, "superseded", {}, now=self.now, coordination={"kind": "local-test"})
        self.ident = execution.identity("offline-cloud", {"issue": "JOV-TEST"}, {"generation": 2})
        self.context["identity"] = self.ident
        self.token = execution.claim(self.execution_path, self.ident, self.owner, self.policy, {}, now=self.now, coordination={"kind": "local-test"})["fencingToken"]
        self.driver = occupancy.Occupancy("alpha", self.context, self.adapter, lane=codex, now=lambda: self.now)
        new = cloud.route("JOV-TEST", "codex", ["cloud-lane"], "typo", "continue saved work", occupancy=self.driver,
                          previous=row["reservationId"], main_sha="b" * 40, fencing_token=self.token)
        self.assertEqual(new["route"], "cloud", new)
        self.assertFalse(new["accepted"])
        successor = occupancy.reservations()[new["reservationId"]]
        self.adapter.receipt = self.proof(successor)
        self.assertEqual(self.driver.reconcile(successor["reservationId"])["reason"], "checkpoint-provenance-mismatch")
        self.adapter.receipt = self.proof(successor, checkpointDigest=saved["digest"])
        self.assertTrue(self.driver.reconcile(successor["reservationId"])["ok"])
        self.assertIsNone(occupancy.publication_reason(journal.read(), "JOV-TEST", "task_successor", self.token, self.now))
        self.assertEqual(occupancy.publication_reason(journal.read(), "JOV-TEST", row["task"], row["fencingToken"], self.now), "stale-token")

    def test_disabled_public_entrypoints_have_zero_effects(self):
        before = sorted(self.root.rglob("*"))
        with patch.dict(os.environ, {"LANES_CLOUD_ENABLED": ""}), patch.object(self.adapter, "compatibility", side_effect=AssertionError):
            self.assertEqual(self.reserve()["reason"], "disabled")
            self.assertEqual(cloud.route("JOV-TEST", "codex", ["cloud-lane"], "typo", "typo", occupancy=self.driver)["reason"], "disabled")
            self.assertEqual(cloud.reconcile(occupancy=self.driver), [])
            self.assertEqual(self.driver.reconcile("missing")["reason"], "disabled")
            self.assertEqual(self.driver.submitted("missing")["reason"], "disabled")
            self.assertEqual(cloud.publish_candidate("JOV-TEST", "task_offline")["reason"], "disabled")
        self.assertEqual(sorted(self.root.rglob("*")), before)
        self.assertEqual(cloud.route("JOV-TEST", "codex", ["cloud-lane"], "typo", "typo")["reason"], "cloud-compatibility-unverified")
        self.assertFalse(self.path.exists())

    def test_corrupt_journal_blocks_local_leases_and_capacity(self):
        self.path.write_text('{"broken":\n')
        self.assertIsNone(codex.lease("alpha"))
        self.assertEqual(codex._free_slots("alpha"), 0)

    def test_concurrent_reservations_share_the_existing_slot(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.reserve(), range(2)))
        self.assertEqual(sum(r["ok"] for r in results), 1)
        self.assertEqual(len(occupancy.reservations()), 1)
        self.assertIsNone(codex.lease("alpha"))

    def test_missing_or_torn_completion_evidence_cannot_release_a_slot(self):
        row = self.accepted()
        forged = {**row, "phase": "completed", "version": row["version"] + 1}
        journal.append(forged)
        self.assertIsNone(codex.lease("alpha"))
        self.assertEqual(codex._free_slots("alpha"), 0)

    def test_publication_without_account_ownership_has_no_git_effect(self):
        with patch.object(cloud, "_pgit", side_effect=AssertionError("git must not run")):
            self.assertEqual(cloud.publish_candidate("JOV-TEST", "task_offline")["reason"], "account-occupancy-missing")

    def test_telemetry_and_supported_submit_adapter_fail_closed(self):
        self.adapter.submit = None
        result = cloud.route("JOV-TEST", "codex", ["cloud-lane"], "typo", "typo", occupancy=self.driver)
        self.assertEqual(result["reason"], "cloud-submit-binding-unavailable")
        self.assertFalse(self.path.exists())
        row = self.submitted()
        with patch.object(self.adapter, "readback", side_effect=OSError):
            self.assertEqual(self.driver.reconcile(row["reservationId"])["reason"], "worker-readback-unavailable")
        self.assertIsNone(codex.lease("alpha"))

    def test_live_occupancy_remains_a_hold_when_dispatch_is_disabled(self):
        from types import SimpleNamespace
        import cloud_lane_dispatch as dispatch
        self.submitted()
        with patch.dict(os.environ, {"LANES_CLOUD_ENABLED": ""}):
            self.assertIsNone(codex.lease("alpha"))
            result = cloud.route("JOV-TEST", "codex", ["cloud-lane"], "typo", "typo")
            self.assertEqual(result["route"], "held")
            result = dispatch.execution_gate(None, None, SimpleNamespace(identifier="JOV-TEST"), None, "codex", {})
            self.assertEqual(result["verdict"], "cloud-held")

    def test_expired_execution_never_frees_remote_occupancy_or_accepts_new_writer(self):
        row = self.submitted()
        self.now += 20000
        self.adapter.receipt = self.proof(row)
        self.assertEqual(self.driver.reconcile(row["reservationId"])["reason"], "stale-execution-fence")
        self.assertIsNone(codex.lease("alpha"))
        self.assertEqual(codex._free_slots("alpha"), 0)

    def test_existing_provider_limits_are_still_binding(self):
        for issue in ("old1", "old2"):
            journal.append({"issue": issue, "provider": "codex", "stage": "submitted", "at": self.now})
        self.assertEqual(self.reserve()["reason"], "concurrency")
        for issue in ("old1", "old2"):
            journal.append({"issue": issue, "provider": "codex", "stage": "pr_opened", "at": self.now})
        for index in range(6):
            for stage in ("submitted", "pr_opened"):
                journal.append({"issue": f"done{index}", "provider": "codex", "stage": stage, "at": self.now})
        self.assertEqual(self.reserve()["reason"], "daily-cap")
        self.assertFalse(occupancy.reservations())

    def test_public_reconcile_refuses_legacy_claims_or_a_different_journal(self):
        journal.append({"issue": "JOV-TEST", "stage": "cloud-pending", "task": "task_legacy",
                        "branch": "cloud/legacy", "fencingToken": self.token, "at": self.now})
        result = cloud.reconcile(occupancy=self.driver)
        self.assertEqual(result[0]["reason"], "account-occupancy-missing")
        result = cloud.reconcile(occupancy=self.driver, path=self.root / "other.jsonl")
        self.assertEqual(result[0]["reason"], "occupancy-journal-mismatch")

    def test_real_quarantine_publication_requires_acceptance_and_keeps_slot_until_stopped(self):
        import re
        from test_cloud_lane_cases.__tests__.cloud_lane_fixtures import Base, git, mutate_edit
        base = Base(self.root / "repo")
        remote, publish = self.root / "remote.git", self.root / "publisher"
        git(["clone", "-q", "--bare", str(base.dir), str(remote)], self.root)
        git(["clone", "-q", str(base.dir), str(publish)], self.root)
        diff = base.patch(mutate_edit("docs/a.md"))
        result = cloud.route("JOV-TEST", "codex", ["cloud-lane"], "typo", "fix typo", occupancy=self.driver,
                             main_sha=base.sha, fencing_token=self.token)
        self.assertFalse(result["accepted"])
        row = occupancy.reservations()[result["reservationId"]]
        calls = []
        def cli(command):
            calls.append(command)
            action = command[2]
            out = {"status": "[READY] offline", "list": json.dumps({"tasks": [
                {"id": row["task"], "environment_id": "offline-env", "attempt_total": 1}]}), "diff": diff}[action]
            return subprocess.CompletedProcess(command, 0, out, "")
        def gh(command):
            calls.append(command)
            if command[:2] == ["pr", "create"]:
                self.assertIn("--draft", command)
                return subprocess.CompletedProcess(command, 0, "https://github.com/JovieInc/Jovie/pull/7", "")
            head = git(["rev-parse", "refs/heads/" + result["branch"]], remote).stdout.strip()
            return subprocess.CompletedProcess(command, 0, json.dumps({"number": 7, "isDraft": True,
                "baseRefName": "main", "headRefName": result["branch"], "headRefOid": head,
                "url": "https://github.com/JovieInc/Jovie/pull/7"}), "")
        with patch.object(cloud, "PUSH_URL_RE", re.compile(re.escape(str(remote)))):
            before = cloud.reconcile(occupancy=self.driver, repo_dir=publish, url=str(remote), run=cli, gh=gh)
            self.assertEqual(before[0]["disposition"], "held")
            self.assertFalse(calls)
            self.adapter.receipt = self.proof(row)
            after = cloud.reconcile(occupancy=self.driver, repo_dir=publish, url=str(remote), run=cli, gh=gh)
        self.assertEqual(after[0]["disposition"], "cloud-draft-created", after)
        self.assertIsNone(codex.lease("alpha"))
        self.assertEqual(sum(command[:2] == ["pr", "create"] for command in calls), 1)
        self.adapter.receipt = self.proof(row, "completed", writerStopped=True)
        self.assertTrue(self.driver.reconcile(row["reservationId"])["released"])
        handle = codex.lease("alpha")
        self.assertIsNotNone(handle)
        handle.close()

    def test_compatibility_latency_does_not_refresh_stale_identity_or_capacity(self):
        proof = self.adapter.compatibility("alpha", "offline-env")
        def delayed(*args):
            self.now += 4000
            return proof
        with patch.object(self.adapter, "compatibility", side_effect=delayed):
            self.assertEqual(self.reserve()["reason"], "identity-stale")
        self.assertFalse(self.path.exists())

    def test_journal_drift_and_missing_journal_cannot_hide_occupied_slot(self):
        with patch.dict(os.environ, {"CLOUD_LANE_LEDGER": str(self.root / "other.jsonl")}):
            self.assertEqual(self.reserve()["reason"], "occupancy-journal-mismatch")
        self.submitted()
        with patch.dict(os.environ, {"CLOUD_LANE_LEDGER": str(self.root / "other.jsonl")}):
            self.assertIsNone(codex.lease("alpha"))
            moved = occupancy.Occupancy("beta", self.context, self.adapter, lane=codex, now=lambda: self.now)
            self.assertEqual(moved.reserve("JOV-OTHER", "offline-env", self.token)["reason"], "occupancy-journal-mismatch")
        self.path.unlink()
        self.assertIsNone(codex.lease("alpha"))
        self.assertEqual(codex._free_slots("alpha"), 0)

    def test_submit_rechecks_fence_after_base_read_and_before_provider_call(self):
        def moved(*args, **kwargs):
            execution.finish(self.execution_path, self.ident, self.token, "superseded", {}, now=self.now,
                             coordination={"kind": "local-test"})
            return "b" * 40
        with patch.object(cloud, "ls_remote_main", side_effect=moved), patch.object(self.adapter, "submit") as submit:
            result = cloud.route("JOV-TEST", "codex", ["cloud-lane"], "typo", "typo", occupancy=self.driver,
                                 fencing_token=self.token)
        self.assertEqual(result["route"], "held")
        submit.assert_not_called()
        self.assertIsNone(codex.lease("alpha"))

    def test_capacity_lease_must_belong_to_the_same_account_and_supported_schema(self):
        for key, value in (("account", "beta"), ("leaseId", "codex:beta"), ("provider", "other"),
                           ("schema", "unknown"), ("capacityUnit", "unknown")):
            with self.subTest(field=key):
                state = copy.deepcopy(self.state)
                state["alpha"]["capacityLease"][key] = value
                codex.update_state(lambda current: current.update(state))
                self.assertEqual(self.reserve()["reason"], "capacity-identity-mismatch")
        self.assertFalse(self.path.exists())

    def test_malformed_capacity_never_becomes_available(self):
        cases = [(lambda r: r.update(exhaustedUntil="bad"), "cooldown-unreadable"),
                 (lambda r: r["capacityLease"].update(usableCapacityRemaining={}), "capacity-unavailable"),
                 (lambda r: r["capacityLease"]["usableCapacityRemaining"]["primary"].update(remainingPercent=True), "capacity-invalid:primary"),
                 (lambda r: r["capacityLease"]["usableCapacityRemaining"]["primary"].update(remainingPercent=101), "capacity-invalid:primary"),
                 (lambda r: r["capacityLease"]["sources"]["capacity"].update(source="inferred"), "capacity-stale")]
        for mutate, reason in cases:
            with self.subTest(reason=reason):
                state = copy.deepcopy(self.state)
                mutate(state["alpha"])
                codex.update_state(lambda current: current.update(state))
                self.assertEqual(self.reserve()["reason"], reason)
        self.assertFalse(self.path.exists())

    def test_invalid_journal_chain_or_worker_binding_never_frees_slot(self):
        row = self.accepted()
        original = self.path.read_text()
        bad = [{**row, "version": row["version"] + 2},
               {**row, "version": row["version"] + 1, "account": "beta"},
               {**row, "version": row["version"] + 1, "phase": "reserved"},
               {**row, "version": row["version"] + 1, "workerId": "forged"},
               {**row, "version": row["version"] + 1, "savedCheckpoint": {"kind": "live-container"}}]
        for event in bad:
            with self.subTest(changed=event):
                self.path.write_text(original + json.dumps(event) + "\n")
                self.assertIsNone(codex.lease("alpha"))
                self.assertEqual(cloud.reconcile(occupancy=self.driver)[0]["reason"], "occupancy-unreadable")
                self.assertEqual(cloud.publish_candidate("JOV-TEST", "task_offline")["reason"], "occupancy-unreadable")
        self.path.write_text(original)
        self.adapter.receipt = self.proof(row, workerId="different")
        self.assertEqual(self.driver.reconcile(row["reservationId"])["reason"], "acceptance-mismatch:worker")
        self.adapter.receipt = self.proof(row, checkpoint={"kind": "live-container"})
        self.assertEqual(self.driver.reconcile(row["reservationId"])["reason"], "checkpoint-provenance-mismatch")

    def test_slot_pointer_durability_failure_holds_without_provider_submission(self):
        with patch.object(occupancy, "_append", side_effect=OSError("disk full")):
            self.assertEqual(self.reserve()["reason"], "account-evidence-unavailable")
        self.assertIsNone(codex.lease("alpha"))
        self.assertFalse(self.path.exists())
        slot = codex._slot_paths("alpha")[0]
        slot.write_text('{"torn":')
        self.assertIsNone(codex.lease("alpha"))
        slot.write_text('{}\n')
        self.assertIsNone(codex.lease("alpha"))

    def test_stale_execution_or_unbound_account_cannot_reserve(self):
        with patch.object(codex, "subscription_pool_mode", return_value=False):
            self.assertEqual(self.reserve()["reason"], "bound-account-required")
        self.assertEqual(self.reserve(previous="missing")["reason"], "predecessor-missing")
        execution.finish(self.execution_path, self.ident, self.token, "superseded", {}, now=self.now,
                         coordination={"kind": "local-test"})
        self.assertEqual(self.reserve()["reason"], "stale-execution-fence")
        self.assertFalse(self.path.exists())

    def test_wrong_path_or_uncertain_journal_ack_never_falls_back(self):
        args = ("JOV-TEST", "codex", ["cloud-lane"], "typo", "typo")
        self.assertEqual(cloud.route(*args, occupancy=self.driver, path=self.root / "elsewhere")["reason"], "occupancy-journal-mismatch")
        with patch.object(self.driver, "submitted", side_effect=OSError("uncertain disk")):
            result = cloud.route(*args, occupancy=self.driver, main_sha="b" * 40, fencing_token=self.token)
        self.assertEqual(result["route"], "held")
        self.assertIsNone(codex.lease("alpha"))
        self.assertEqual(cloud.reconcile()[0]["reason"], "cloud-compatibility-unverified")

    def test_live_custody_blocks_fallback_after_labels_or_configuration_change(self):
        self.submitted()
        for labels, config in (([], {}), (["cloud-lane"], {"CODEX_CLOUD_BINARY": ""})):
            with self.subTest(labels=labels, config=config), patch.dict(os.environ, config):
                result = cloud.route("JOV-TEST", "codex", labels, "typo", "typo", occupancy=self.driver,
                                     fencing_token=self.token)
                self.assertEqual(result["route"], "held")
                self.assertEqual(result["reason"], "account-occupancy")
                self.assertIsNone(codex.lease("alpha"))
