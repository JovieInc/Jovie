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
        F.write_private(F.ROOT / "state.json", {"cooldowns": {}})
        self.now = datetime.now(timezone.utc)
        self.proof = F.proof(self.now, "boundary")
        self.context = F.context([self.proof])
        F.refresh(self.now)

    def project(self, rows, context=None):
        return P.build_receipt(rows, {}, self.now, context=context or self.context)

    def validate(self, receipt):
        return C.v2_validate_capacity_receipt(receipt, self.now, **T.validation_args(self.context))

    def test_legacy_contract_remains_byte_identical(self):
        import hashlib
        legacy = Path(C.__file__).read_text().split("\n\n# Additive v2 substrate.")[0]
        self.assertEqual(hashlib.sha256(legacy.encode()).hexdigest(), "fbfd5b8e23f54f159efa8bf865bce19be9400354aad953843cd50f839f289004")

    def test_positive_round_trip_and_exact_bounds(self):
        for count in (0, 1, 10, 40, 41):
            rows = [F.proof(self.now, f"bound-{i}") for i in range(count)]
            context = F.context(rows)
            receipt = self.project(rows, context)
            self.assertEqual(receipt["target"], min(count, 40))
            accepted, _, verified = C.v2_validate_capacity_receipt(receipt, self.now, **T.validation_args(context))
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
        self.assertFalse(C.v2_validate_capacity_receipt(self.project([self.proof]), self.now)[0])

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

    def test_canonical_json_consumer_accepts_bound_proof_and_rejects_invalid_requests(self):
        import io
        receipt = self.project([self.proof])
        request = {"receipt": receipt, "now": self.now.isoformat(), "maxAgeMs": 86400000}
        for value, accepted, status in ((request, True, 0), ({**request, "maxAgeMs": True}, False, 78), ({**request, "maxAgeMs": 86400001}, False, 78), ({**request, "now": "bad"}, False, 78), (None, False, 78)):
            with mock.patch.object(sys, "stdin", io.StringIO(json.dumps(value))), mock.patch("builtins.print") as printed:
                self.assertEqual(T.main(), status)
                self.assertEqual(json.loads(printed.call_args.args[0])["accepted"], accepted)
        with mock.patch.object(sys, "stdin", io.StringIO("x" * 1048577)), mock.patch("builtins.print"):
            self.assertEqual(T.main(), 78)

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



class LiveBindingTests(unittest.TestCase):
    def test_context_git_measurement_ignores_hostile_path(self):
        now = datetime.now(timezone.utc)
        F.write_private(F.ROOT / "state.json", {"cooldowns": {}})
        F.proof(now, "hostile-path")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            marker = root / "invoked"
            for name in ("git", "systemctl"):
                fake = root / name
                fake.write_text("#!/bin/sh\nprintf invoked > '" + str(marker) + "'\nprintf forged\n")
                fake.chmod(0o700)
            with mock.patch.dict(os.environ, {"PATH": directory}):
                self.assertEqual(T.load_context(now)["runtime"], F.RUNTIME)
                with mock.patch.object(T.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "MainPID=123\nControlGroup=/system.slice/symphony-elixir.service\nActiveState=active", "")) as run:
                    self.assertEqual(T.service_identity()[0], 123)
                    self.assertEqual(run.call_args.args[0][:3], ["/usr/bin/systemctl", "--user", "show"])
            self.assertFalse(marker.exists())

    def test_systemd_identity_requires_active_service(self):
        for output, valid in (("MainPID=123\nControlGroup=/system.slice/symphony-elixir.service\nActiveState=active", True), ("MainPID=0\nActiveState=active", False), ("MainPID=123\nActiveState=inactive", False)):
            with mock.patch.object(T.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, output, "")) as run:
                if valid:
                    self.assertEqual(T.service_identity()[0], 123)
                else:
                    with self.assertRaises(ValueError): T.service_identity()
                run.assert_called_once_with(["/usr/bin/systemctl", "--user", "show", C.V2_OFFICIAL_RUNTIME_SERVICE, "--property=MainPID,ControlGroup,ActiveState"], capture_output=True, text=True, check=True, timeout=5)

    def test_live_runtime_requires_pid_cgroup_command_listener_and_stable_generation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            process = root / "123"
            (process / "fd").mkdir(parents=True)
            (process / "net").mkdir()
            (process / "stat").write_text("123 (beam) " + " ".join(["0"] * 19 + ["12345"]))
            (process / "cgroup").write_text("0::/system.slice/symphony-elixir.service\n")
            value = {"binaryPath": str(F.RUNTIME_BINARY.resolve()), "workflowPath": str((F.SOURCE / "scripts/symphony/WORKFLOW.md").resolve())}
            (process / "cmdline").write_bytes((value["binaryPath"] + "\0" + value["workflowPath"] + "\0").encode())
            (process / "fd/3").symlink_to("socket:[567]")
            (process / "net/tcp").write_text("header\n0: 0100007F:0FC9 00000000:0000 0A 0 0 0 0 0 567\n")
            (process / "net/tcp6").write_text("header\n")
            identity = (123, "/system.slice/symphony-elixir.service")
            with mock.patch.object(T, "PROC_ROOT", root), mock.patch.object(T, "service_identity", return_value=identity):
                self.assertEqual(len(F.REAL_LIVE_RUNTIME(value)), 64)
                for file, changed in (("cgroup", "0::/other\n"), ("cmdline", "/other\0wrong\0"), ("net/tcp", "header\n0: 0100007F:0FCA 00000000:0000 0A 0 0 0 0 0 567\n")):
                    path = process / file
                    original = path.read_text()
                    path.write_text(changed)
                    with self.assertRaises(ValueError): F.REAL_LIVE_RUNTIME(value)
                    path.write_text(original)
                with mock.patch.object(T, "service_identity", side_effect=[identity, (124, identity[1])]):
                    with self.assertRaises(ValueError): F.REAL_LIVE_RUNTIME(value)
                # The actual Type=simple unit has a wrapper parent and listener child.
                import shutil
                child = root / "456"
                shutil.copytree(process, child, symlinks=True)
                parent_stat = (process / "stat").read_text()
                (child / "stat").write_text("456 (beam) " + " ".join(["S", "123"] + ["0"] * 17 + ["67890"]))
                (process / "fd/3").unlink()
                (process / "cmdline").write_text("python3\0symphony_official_runtime.py\0")
                generation = F.REAL_LIVE_RUNTIME(value)
                (child / "stat").write_text((child / "stat").read_text().replace("67890", "67891"))
                self.assertNotEqual(F.REAL_LIVE_RUNTIME(value), generation)
                (child / "stat").write_text((child / "stat").read_text().replace("S 123", "S 1"))
                with self.assertRaises(ValueError): F.REAL_LIVE_RUNTIME(value)
                (process / "stat").write_text(parent_stat.replace("12345", "12346"))
                (child / "stat").write_text((child / "stat").read_text().replace("S 1 ", "S 123 "))
                self.assertNotEqual(F.REAL_LIVE_RUNTIME(value), generation)
                (process / "stat").unlink()
                with self.assertRaises(OSError): F.REAL_LIVE_RUNTIME(value)

    def test_existing_capacity_is_invalid_after_account_or_process_or_runner_change(self):
        now = datetime.now(timezone.utc)
        F.write_private(F.ROOT / "state.json", {"cooldowns": {}})
        p = F.proof(now, "live-state")
        receipt = P.build_receipt([p], {}, now, context=F.context([p]))
        self.assertTrue(T.validate_local_receipt(receipt, now)[0])
        account = Path(F.ACCOUNTS[p["profile"]]["accountPath"])
        for state in ({"cooldowns": {account.name: int(now.timestamp()) + 60}}, {"cooldowns": {account.name: int(now.timestamp()) - 1}}, {"last_error": {account.name: "rate limited"}}, {"cooldowns": []}):
            F.write_private(F.ROOT / "state.json", state)
            self.assertFalse(T.validate_local_receipt(receipt, now)[0])
        F.write_private(F.ROOT / "state.json", {"cooldowns": {}})
        with mock.patch.object(T, "live_runtime", return_value="a" * 64):
            self.assertFalse(T.validate_local_receipt(receipt, now)[0])
        original = F.RUNNER.read_text()
        F.RUNNER.write_text("#!/bin/sh\nexit 0\n")
        self.assertFalse(T.validate_local_receipt(receipt, now)[0])
        F.RUNNER.write_text(original)
        p2 = {**p, "runtimeGeneration": None}
        self.assertEqual(P.build_receipt([p2], {}, now, context=F.context([p]))["target"], 0)


class ProducerTests(unittest.TestCase):
    def setUp(self):
        F.write_private(F.ROOT / "state.json", {"cooldowns": {}})
        now = datetime.now(timezone.utc)
        self.p = F.proof(now, "producer")
        self.account = Path(F.ACCOUNTS[self.p["profile"]]["accountPath"])
        F.write_private(self.account.parent / "state.json", {"cooldowns": {}})
        self.real_run = subprocess.run

    def fake(self, args, **kwargs):
        if Path(args[0]).name == "git":
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
            p = PRODUCER.produce(F.CONTEXT, self.account, F.RUNNER)
        context = T.load_context(datetime.now(timezone.utc))
        self.assertEqual(context["attestations"][p["probeId"]], p)
        receipt = P.build_receipt([p], {}, datetime.now(timezone.utc), context=context)
        self.assertEqual(receipt["target"], 1)
        self.assertTrue(T.validate_local_receipt(receipt, datetime.now(timezone.utc))[0])

    def test_caller_selected_fake_runner_is_rejected_before_execution(self):
        with tempfile.TemporaryDirectory() as directory:
            fake = Path(directory) / "fake-codex"
            fake.write_text("#!/bin/sh\nexit 0\n")
            fake.chmod(0o700)
            with self.assertRaisesRegex(ValueError, "not enrolled"):
                PRODUCER.produce(F.CONTEXT, self.account, fake)

    def test_relative_enrolled_runner_executes_absolute_path_despite_hostile_path(self):
        with tempfile.TemporaryDirectory() as directory:
            fake = Path(directory) / F.RUNNER.name
            fake.write_text("#!/bin/sh\nexit 0\n")
            fake.chmod(0o700)
            def invoke(args, **kwargs):
                if Path(args[0]).name != "git":
                    self.assertEqual(args[0], str(F.RUNNER.resolve()))
                return self.fake(args, **kwargs)
            previous = Path.cwd()
            try:
                os.chdir(F.ROOT)
                with mock.patch.dict(os.environ, {"PATH": directory + os.pathsep + os.environ["PATH"]}), mock.patch.object(subprocess, "run", side_effect=invoke):
                    proof = PRODUCER.produce(F.CONTEXT, self.account, Path(F.RUNNER.name))
                self.assertEqual(proof["rc"], 0)
            finally:
                os.chdir(previous)

    def test_nonzero_or_stdout_only_creates_no_artifact(self):
        before = set(F.ARTIFACTS.iterdir())
        for rc in (0, 78):
            def fake(args, **kwargs):
                if Path(args[0]).name == "git":
                    return self.real_run(args, **kwargs)
                return subprocess.CompletedProcess(args, rc, b"success", b"")
            with mock.patch.object(subprocess, "run", side_effect=fake), self.assertRaises(ValueError):
                PRODUCER.produce(F.CONTEXT, self.account, F.RUNNER)
        self.assertEqual(before, set(F.ARTIFACTS.iterdir()))

    def test_cooling_account_is_never_invoked(self):
        F.write_private(self.account.parent / "state.json", {"cooldowns": {self.account.name: int(datetime.now().timestamp()) + 600}})
        with mock.patch.object(subprocess, "run", side_effect=self.fake), self.assertRaisesRegex(ValueError, "cooling"):
            PRODUCER.produce(F.CONTEXT, self.account, F.RUNNER)

    def test_limiter_event_during_completion_wins(self):
        def fake(args, **kwargs):
            result = self.fake(args, **kwargs)
            if Path(args[0]).name != "git":
                F.write_private(self.account.parent / "state.json", {"cooldowns": {self.account.name: 9999999999}})
            return result
        before = set(F.ARTIFACTS.iterdir())
        with mock.patch.object(subprocess, "run", side_effect=fake), self.assertRaisesRegex(ValueError, "cooling|binding or cooldown"):
            PRODUCER.produce(F.CONTEXT, self.account, F.RUNNER)
        self.assertEqual(before, set(F.ARTIFACTS.iterdir()))

    def test_cli_emits_only_verified_proof_or_terminal_failure(self):
        args = ["probe", "--context", str(F.CONTEXT), "--account", str(self.account), "--codex", "fake"]
        with mock.patch.object(sys, "argv", args), mock.patch.object(PRODUCER, "produce", return_value=self.p), mock.patch("builtins.print") as printed:
            self.assertEqual(PRODUCER.main(), 0)
            self.assertEqual(json.loads(printed.call_args.args[0]), self.p)
        with mock.patch.object(sys, "argv", args), mock.patch.object(PRODUCER, "produce", side_effect=ValueError("untrusted")), mock.patch("builtins.print"):
            self.assertEqual(PRODUCER.main(), 78)



if __name__ == "__main__":
    unittest.main()
