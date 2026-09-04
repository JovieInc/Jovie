#!/usr/bin/env python3
from __future__ import annotations
import copy
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import proof_fixtures as F
import gem_gate_contract as C
import symphony_proof_context as T
import symphony_capacity_evidence as P
import symphony_useful_turn_probe as PRODUCER


class ProofBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)
        self.proof = F.proof(self.now, "boundary")
        self.context = F.context([self.proof])
        F.refresh(self.now)

    def project(self, rows, context=None):
        return P.build_receipt(rows, {}, self.now, context=context or self.context)

    def validate(self, receipt):
        return C.validate_capacity_receipt(receipt, self.now, **T.validation_args(self.context))

    def test_positive_round_trip_and_exact_bounds(self):
        for count in (0, 1, 10, 40, 41):
            rows = [F.proof(self.now, f"bound-{i}") for i in range(count)]
            context = F.context(rows)
            receipt = self.project(rows, context)
            self.assertEqual(receipt["target"], min(count, 40))
            accepted, _, verified = C.validate_capacity_receipt(receipt, self.now, **T.validation_args(context))
            self.assertEqual(accepted, count > 0)
            self.assertEqual(len(verified), min(count, 40))

    def test_pr17213_allowed_one_through_forty_and_denied_exact_zero(self):
        from fleet_admission_receipt import _require_unbound_repair_max_concurrent as check, AdmissionProjectionError
        for count in range(1, 41):
            self.assertEqual(check(count, allowed=True), count)
        self.assertEqual(check(0, allowed=False), 0)
        for allowed, values in ((True, (0, 41, -1, True, "1")), (False, (1, 40, -1, False, None))):
            for value in values:
                with self.assertRaises(AdmissionProjectionError):
                    check(value, allowed=allowed)

    def test_row_claim_cannot_attest_itself(self):
        context = {**self.context, "attestations": {}}
        self.assertEqual(self.project([self.proof], context)["target"], 0)
        self.assertFalse(C.validate_capacity_receipt(self.project([self.proof]), self.now)[0])

    def test_each_bound_field_rejects_substitution(self):
        changes = {"provider": "alternate", "profile": "a" * 64, "model": "other",
            "producer": "untrusted", "agentProfile": "default", "attested": False,
            "probeId": "b" * 64, "contractSha256": "c" * 64,
            "outputDigest": "d" * 64, "outputBytes": 99, "outputTokens": 100,
            "completedAt": (self.now - timedelta(seconds=1)).isoformat()}
        for key, value in changes.items():
            with self.subTest(key=key):
                self.assertEqual(self.project([{**self.proof, key: value}])["target"], 0)
        for key in self.proof["runtime"]:
            value = copy.deepcopy(self.proof)
            value["runtime"][key] = "0" * 64
            self.assertEqual(self.project([value])["target"], 0)

    def test_stale_future_failed_boolean_and_negative_measurements_rejected(self):
        variants = [{"completedAt": (self.now + delta).isoformat()} for delta in (timedelta(days=-2), timedelta(seconds=1))]
        variants += [{"rc": x} for x in (1, False, "0")]
        variants += [{"outputBytes": x} for x in (-1, True, "5")]
        variants += [{"outputBytes": 0, "outputTokens": 0}, {"useful": False}, {"outputDigest": "bad"}]
        for change in variants:
            p = {**self.proof, **change}
            F.attest(p)
            self.assertEqual(self.project([p])["target"], 0, change)

    def test_duplicate_and_contradictory_seats_do_not_survive(self):
        self.assertEqual(self.project([self.proof, self.proof])["target"], 0)
        other = {**self.proof, "model": "gpt-5.5", "probeId": "e" * 64}
        F.attest(other)
        self.assertEqual(self.project([self.proof, other, self.proof])["target"], 0)

    def test_receipt_target_source_runtime_and_enrollment_are_checked(self):
        receipt = self.project([self.proof])
        for field, value in (("target", True), ("target", 2), ("approved", False), ("source", "oauth"),
                             ("severeIncidents", False), ("contractSha256", "f" * 64),
                             ("runtime", {}), ("observedAt", "bad"), ("acceptedEvidence", None)):
            self.assertFalse(self.validate({**receipt, field: value})[0], field)
        self.context["accounts"] = []
        self.assertFalse(self.validate(receipt)[0])

    def test_local_context_remeasures_import_build_and_enrollment(self):
        self.assertEqual(T.load_context(self.now)["runtime"], F.RUNTIME)
        original = json.loads(F.CONTEXT.read_text())
        changes = [{"observedAt": (self.now - timedelta(minutes=11)).isoformat()},
                   {"runtime": {**F.RUNTIME, "contractSha256": "f" * 64}},
                   {"runtime": {**F.RUNTIME, "binarySha256": "f" * 64}},
                   {"accounts": original["accounts"] * 2}]
        for change in changes:
            F.write_private(F.CONTEXT, {**original, **change})
            with self.assertRaises(ValueError):
                T.load_context(self.now)
        F.write_private(F.CONTEXT, original)
        F.CONTEXT.chmod(0o644)
        self.assertFalse(T.validate_local_receipt(self.project([self.proof]), self.now)[0])
        F.CONTEXT.chmod(0o600)
        account = Path(F.ACCOUNTS[self.proof["profile"]]["accountPath"])
        (account / "config.toml").write_text('model="changed"')
        with self.assertRaises(ValueError):
            T.load_context(self.now)
        (account / "config.toml").write_text('model = "gpt-5.6-sol"')

    def test_attestation_permissions_reject_ledger_claims(self):
        path = F.ARTIFACTS / (self.proof["probeId"] + ".json")
        path.chmod(0o644)
        context = T.load_context(self.now)
        self.assertNotIn(self.proof["probeId"], context["attestations"])
        path.chmod(0o600)

    def test_projector_cli_writes_atomic_receipt_and_missing_context_closes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            ledger = root / "ledger.jsonl"
            ledger.write_text(json.dumps(self.proof) + "\ninvalid\n\n")
            output = root / "capacity.json"
            args = ["projector", "--proof-ledger", str(ledger), "--inventory", str(root / "absent"), "--output", str(output)]
            with mock.patch.object(sys, "argv", args), mock.patch("builtins.print"):
                self.assertEqual(P.main(), 0)
            self.assertEqual(json.loads(output.read_text())["target"], 1)
            with mock.patch.dict(os.environ, {"SYMPHONY_PROOF_CONTEXT": str(root / "missing")}), mock.patch.object(sys, "argv", args), mock.patch("builtins.print"):
                self.assertEqual(P.main(), 0)
            self.assertEqual(json.loads(output.read_text())["target"], 0)



class ProducerTests(unittest.TestCase):
    def setUp(self):
        now = datetime.now(timezone.utc)
        self.p = F.proof(now, "producer")
        self.account = Path(F.ACCOUNTS[self.p["profile"]]["accountPath"])
        F.write_private(self.account.parent / "state.json", {"cooldowns": {}})
        self.real_run = subprocess.run

    def fake(self, args, **kwargs):
        if args[0] == "git":
            return self.real_run(args, **kwargs)
        self.assertEqual(kwargs["env"]["CODEX_HOME"], str(self.account.resolve()))
        self.assertEqual(kwargs["env"]["JOVIE_AGENT_PROFILE"], "coder")
        self.assertIn("--model", args)
        import ast
        prompt = args[-1]
        numbers = ast.literal_eval(prompt.split("list of ")[1].split(". Return")[0])
        nonce = prompt.split("nonce must be ")[1].rstrip(".")
        output = Path(args[args.index("--output-last-message") + 1])
        output.write_text(json.dumps({"nonce": nonce, "sorted": sorted(numbers), "sum": sum(numbers)}))
        return subprocess.CompletedProcess(args, 0, b"", b"")

    def test_authenticated_completion_produces_private_bound_artifact_and_capacity(self):
        with mock.patch.object(subprocess, "run", side_effect=self.fake):
            p = PRODUCER.produce(F.CONTEXT, self.account, Path("fake-codex"))
        context = T.load_context(datetime.now(timezone.utc))
        self.assertEqual(context["attestations"][p["probeId"]], p)
        receipt = P.build_receipt([p], {}, datetime.now(timezone.utc), context=context)
        self.assertEqual(receipt["target"], 1)
        self.assertTrue(T.validate_local_receipt(receipt, datetime.now(timezone.utc))[0])

    def test_nonzero_or_stdout_only_creates_no_artifact(self):
        before = set(F.ARTIFACTS.iterdir())
        for rc in (0, 78):
            def fake(args, **kwargs):
                if args[0] == "git":
                    return self.real_run(args, **kwargs)
                return subprocess.CompletedProcess(args, rc, b"success", b"")
            with mock.patch.object(subprocess, "run", side_effect=fake), self.assertRaises(ValueError):
                PRODUCER.produce(F.CONTEXT, self.account, Path("fake"))
        self.assertEqual(before, set(F.ARTIFACTS.iterdir()))

    def test_cooling_account_is_never_invoked(self):
        F.write_private(self.account.parent / "state.json", {"cooldowns": {self.account.name: int(datetime.now().timestamp()) + 600}})
        with mock.patch.object(subprocess, "run", side_effect=self.fake), self.assertRaisesRegex(ValueError, "cooling"):
            PRODUCER.produce(F.CONTEXT, self.account, Path("fake"))

    def test_limiter_event_during_completion_wins(self):
        def fake(args, **kwargs):
            result = self.fake(args, **kwargs)
            if args[0] != "git":
                F.write_private(self.account.parent / "state.json", {"cooldowns": {self.account.name: 9999999999}})
            return result
        before = set(F.ARTIFACTS.iterdir())
        with mock.patch.object(subprocess, "run", side_effect=fake), self.assertRaisesRegex(ValueError, "binding or cooldown"):
            PRODUCER.produce(F.CONTEXT, self.account, Path("fake"))
        self.assertEqual(before, set(F.ARTIFACTS.iterdir()))

    def test_cli_emits_only_verified_proof_or_terminal_failure(self):
        args = ["probe", "--context", str(F.CONTEXT), "--account", str(self.account), "--codex", "fake"]
        with mock.patch.object(sys, "argv", args), mock.patch.object(PRODUCER, "produce", return_value=self.p), mock.patch("builtins.print") as printed:
            self.assertEqual(PRODUCER.main(), 0)
            self.assertEqual(json.loads(printed.call_args.args[0]), self.p)
        with mock.patch.object(sys, "argv", args), mock.patch.object(PRODUCER, "produce", side_effect=ValueError("untrusted")), mock.patch("builtins.print"):
            self.assertEqual(PRODUCER.main(), 78)



class RetryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("reconciler", F.SOURCE / "scripts/symphony/symphony-reconciler.py")
        cls.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)

    def test_terminal_failure_cannot_be_erased_by_changed_generation_or_ready_receipt(self):
        for previous in ({"generation": "old", "retryable": False}, {"generation": "new", "state": "ready"}):
            with mock.patch.object(self.module, "_valid_materialized_routing_receipt", return_value=True):
                result = self.module.controller_retry_decision({"error": "port_exit 78", "generation": "new", "attempt": 9}, previous, routing_receipt={})
            self.assertFalse(result["retryable"])
            self.assertEqual(result["maxAttempts"], 1)
            self.assertIsNone(result["due_at"])
            self.assertFalse(result["handoff"])

    def test_cooldown_preserves_exact_next_eligible_without_repeated_attempts(self):
        eligible = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        obs = {"error": {"schema": "symphony-launcher-failure/v1", "class": "provider-cooldown", "retryable": False, "nextEligibleAt": eligible}}
        result = self.module.controller_retry_decision(obs)
        for _ in range(8):
            result = self.module.controller_retry_decision(obs, result)
        self.assertEqual(result["state"], "deferred")
        self.assertEqual(result["attempt"], 1)
        self.assertEqual(result["due_at"], self.module._iso(self.module._parse_time(eligible)))

    def test_reconciler_persists_exact_deferred_time_without_repair_or_attempt_growth(self):
        eligible = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        item = {"issue_identifier": "JOV-9999", "attempt": 8, "error": {"schema": "symphony-launcher-failure/v1", "class": "provider-cooldown", "retryable": False, "nextEligibleAt": eligible}}
        saved = []
        with mock.patch.object(self.module, "_workspace_state", return_value={"valid": False}), mock.patch.object(self.module, "_read_receipt", side_effect=lambda _: saved[-1] if saved else None), mock.patch.object(self.module, "_write_receipt", side_effect=lambda _, receipt: saved.append(receipt)), mock.patch.object(self.module, "_event"):
            for _ in range(8):
                self.module._reconcile_item(item, "retrying", False, runtime={"runtimeRevision": "fixture"})
        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0]["controllerState"], "deferred")
        self.assertEqual(saved[0]["attempt"], 1)
        self.assertEqual(saved[0]["nextRetryAt"], self.module._iso(self.module._parse_time(eligible)))
        self.assertEqual(saved[0]["nextAutomatedAction"], "await_provider_next_eligible")
        self.assertFalse(saved[0]["retryPolicy"]["retryable"])



if __name__ == "__main__":
    unittest.main()
