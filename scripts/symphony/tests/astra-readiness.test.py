#!/usr/bin/env python3
import copy
import importlib.util
import json
import pathlib
import subprocess
import tempfile
import time
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/symphony/astra/astra_readiness.py"
SPEC = importlib.util.spec_from_file_location("astra_readiness", SOURCE)
astra = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(astra)


class AstraReadinessTests(unittest.TestCase):
    ACCOUNT_SCOPE_SHA256 = "a" * 64
    USEFUL_TURN_RECEIPT_SHA256 = "b" * 64

    def setUp(self):
        self.contract = astra.load_contract()
        self.request = {
            "model": "gpt-6-astra",
            "reasoning": {"effort": "high"},
            "prompt_cache_options": {"ttl": "30m"},
        }
        self.task = {
            "intent": "Certify the bounded surface.",
            "constraints": "Do not deploy or merge.",
            "authority": "May edit and test the assigned files.",
            "model_fit": "A cheaper proven model failed the required reasoning eval.",
            "budget": "One attempt; stop before any paid overage.",
            "completion": "Return source and test evidence separately.",
            "tests": "Run the exact structural selector with coverage.",
            "steering": "Apply native ordered steering; preserve receipts.",
            "escalation": "Stop at credentials, money, or changed scope.",
            "receipts": "Provide SHA, commands, and unresolved UNKNOWNs.",
        }

    def assert_contract_error(self, function, *args):
        with self.assertRaises(astra.ContractError):
            function(*args)

    def test_contract_is_disabled_unknown_and_has_no_async_eligible_tools(self):
        self.assertFalse(self.contract["activation"]["enabled"])
        self.assertEqual(self.contract["activation"]["access"], "UNKNOWN")
        self.assertEqual(self.contract["async_tool_eligibility"]["eligible"], [])

    def test_contract_rejects_activation_or_async_claims(self):
        for mutation in ("enabled", "access", "eligible"):
            changed = copy.deepcopy(self.contract)
            if mutation == "enabled": changed["activation"]["enabled"] = True
            elif mutation == "access": changed["activation"]["access"] = "AVAILABLE"
            else: changed["async_tool_eligibility"]["eligible"] = ["linear_graphql"]
            with tempfile.TemporaryDirectory() as directory:
                path = pathlib.Path(directory) / "contract.json"
                path.write_text(json.dumps(changed))
                self.assert_contract_error(astra.load_contract, path)

    def test_prompt_is_versioned_cache_stable_and_complete(self):
        first = astra.compile_prompt(self.task)
        changed = {**self.task, "intent": "Certify another bounded surface."}
        second = astra.compile_prompt(changed)
        self.assertEqual(first["version"], self.contract["prompt_version"])
        self.assertEqual(first["prefix_sha256"], second["prefix_sha256"])
        for value in self.task.values(): self.assertIn(value, first["prompt"])
        self.assertIn("Do not create a competing controller", first["prompt"])

    def test_prompt_rejects_every_missing_task_contract_field(self):
        for key in self.task:
            changed = {**self.task, key: ""}
            self.assert_contract_error(astra.compile_prompt, changed)

    def test_valid_astra_request_is_preserved(self):
        self.assertEqual(
            astra.validate_responses_request(self.request, "/v1/responses"),
            self.request,
        )

    def test_non_astra_request_is_a_behavior_preserving_copy(self):
        request = {"model": "gpt-5.6-sol", "temperature": 0.2, "tools": [{"type": "function"}]}
        result = astra.validate_responses_request(request, "/v1/chat/completions")
        self.assertEqual(result, request)
        self.assertIsNot(result, request)

    def test_astra_requires_responses_and_supported_reasoning(self):
        self.assert_contract_error(astra.validate_responses_request, self.request, "/v1/chat/completions")
        for effort in (None, "none", "minimal", "extreme"):
            changed = copy.deepcopy(self.request)
            changed["reasoning"] = {"effort": effort}
            self.assert_contract_error(astra.validate_responses_request, changed, "/v1/responses")

    def test_astra_rejects_each_unsupported_parameter(self):
        for key in self.contract["request"]["unsupported_parameters"]:
            self.assert_contract_error(
                astra.validate_responses_request,
                {**self.request, key: 0},
                "/v1/responses",
            )

    def test_astra_rejects_wrong_cache_and_async_tool_combinations(self):
        bad_cache = {**self.request, "prompt_cache_options": {"ttl": "24h"}}
        self.assert_contract_error(astra.validate_responses_request, bad_cache, "/v1/responses")
        hosted = {**self.request, "tools": [{"type": "web_search", "async": True}]}
        self.assert_contract_error(astra.validate_responses_request, hosted, "/v1/responses")
        programmatic = {**self.request, "tools": [{"type": "custom", "async": True, "allowed_callers": ["code_interpreter"]}]}
        self.assert_contract_error(astra.validate_responses_request, programmatic, "/v1/responses")
        multi = {**self.request, "tools": [{"type": "agent"}, {"type": "function", "async": True}]}
        self.assert_contract_error(astra.validate_responses_request, multi, "/v1/responses")
        multi["parallel_tool_calls"] = False
        self.assertEqual(astra.validate_responses_request(multi, "/v1/responses"), multi)

    def test_persisted_reasoning_and_multi_agent_incompatibilities(self):
        output = {"type": "function_call_output", "call_id": "call-1", "output": "done"}
        continuation = {**self.request, "input": [output]}
        self.assert_contract_error(astra.validate_responses_request, continuation, "/v1/responses")
        continuation["previous_response_id"] = "resp-1"
        self.assertEqual(astra.validate_responses_request(continuation, "/v1/responses"), continuation)
        for field, value in (("max_tool_calls", 2), ("compact", {})):
            multi = {**self.request, "tools": [{"type": "agent"}], field: value}
            self.assert_contract_error(astra.validate_responses_request, multi, "/v1/responses")
        summary = {**self.request, "tools": [{"type": "agent"}], "reasoning": {"effort": "high", "summary": "auto"}}
        self.assert_contract_error(astra.validate_responses_request, summary, "/v1/responses")

    def test_reasoning_update_preserves_cache_and_rejects_incompatible_state(self):
        current = {"model": "gpt-6-astra", "reasoning_effort": "low", "prompt_cache_key": "stable"}
        updated = astra.validate_configuration_update(current, {"reasoning_effort": "xhigh"})
        self.assertEqual(updated["reasoning_effort"], "xhigh")
        self.assertEqual(updated["prompt_cache_key"], "stable")
        for bad in (
            {**current, "model": "gpt-5.6-sol"},
            {**current, "multi_agent": True},
            {**current, "previous_event": "configuration_update"},
            {**current, "auto_compaction": True},
            {**current, "truncation": "auto"},
        ):
            self.assert_contract_error(astra.validate_configuration_update, bad, {"reasoning_effort": "high"})
        self.assert_contract_error(astra.validate_configuration_update, current, {"reasoning_effort": "none"})

    def test_activation_fails_closed_then_accepts_only_a_fresh_complete_probe(self):
        now = time.time()
        complete = {
            "schema": "jovie-astra-capability/v1", "model": "gpt-6-astra", "available": True,
            "responses_transport": True, "dynamic_tool_async": True, "turn_steer": True,
            "thread_resume": True, "durable_pending_call_registry": True,
            "evidence_accepted": True, "account_scope_sha256": self.ACCOUNT_SCOPE_SHA256,
            "useful_turn_receipt_sha256": self.USEFUL_TURN_RECEIPT_SHA256, "probed_at": now,
        }
        capabilities = ["code", "tools"]
        complete["capabilities"] = capabilities
        self.assertEqual(astra.activation_decision(False, complete, now, required_capabilities=capabilities)["reason"], "disabled")
        for key in complete:
            if key == "probed_at": continue
            missing = {name: value for name, value in complete.items() if name != key}
            self.assertFalse(astra.activation_decision(True, missing, now, required_capabilities=capabilities)["selected"])
        stale = {**complete, "probed_at": now - 901}
        self.assertEqual(astra.activation_decision(True, stale, now, required_capabilities=capabilities)["reason"], "probe_stale")
        self.assertEqual(astra.activation_decision(True, complete, now)["reason"], "task_capabilities_missing")
        self.assertEqual(astra.activation_decision(True, complete, now, required_capabilities=["computer"])["reason"], "capability_mismatch")
        self.assertTrue(astra.activation_decision(True, complete, now, required_capabilities=capabilities)["selected"])

    def test_activation_rejects_malformed_receipt_hashes(self):
        now = time.time()
        complete = {
            "schema": "jovie-astra-capability/v1", "model": "gpt-6-astra", "available": True,
            "responses_transport": True, "dynamic_tool_async": True, "turn_steer": True,
            "thread_resume": True, "durable_pending_call_registry": True,
            "evidence_accepted": True, "account_scope_sha256": self.ACCOUNT_SCOPE_SHA256,
            "useful_turn_receipt_sha256": self.USEFUL_TURN_RECEIPT_SHA256,
            "probed_at": now, "capabilities": ["code"],
        }
        for malformed in ("", "short", "g" * 64, "A" * 64, "a" * 63, "a" * 65):
            for field in ("account_scope_sha256", "useful_turn_receipt_sha256"):
                probe = {**complete, field: malformed}
                decision = astra.activation_decision(
                    True, probe, now, required_capabilities=["code"]
                )
                self.assertEqual(decision["reason"], "capability_unproven")
                self.assertFalse(decision["selected"])

    def test_usage_limit_is_terminal_until_a_new_successful_probe(self):
        exhausted = {
            "schema": "jovie-astra-capability/v1", "model": "gpt-6-astra",
            "available": False, "failure": "usage_limit", "probed_at": time.time(),
            "account_scope_sha256": self.ACCOUNT_SCOPE_SHA256,
            "useful_turn_receipt_sha256": self.USEFUL_TURN_RECEIPT_SHA256,
        }
        decision = astra.activation_decision(True, exhausted, required_capabilities=["code"])
        self.assertEqual(decision["reason"], "capability_unavailable")
        self.assertFalse(decision["retryable"])
        exhausted["failure"] = "transient_network"
        self.assertEqual(astra.activation_decision(True, exhausted, required_capabilities=["code"])["reason"], "capability_unproven")

        exhausted["failure"] = "usage_limit"
        exhausted["account_scope_sha256"] = "not-a-hash"
        self.assertEqual(astra.activation_decision(True, exhausted, required_capabilities=["code"])["reason"], "capability_unproven")

    def test_async_receipts_survive_restart_and_are_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "receipts.json"
            journal = astra.ReceiptJournal(path)
            journal.register("call-1", "idem-1", "safe_read", "input-a")
            journal.register("call-2", "idem-2", "safe_read", "input-b")
            self.assertEqual(astra.ReceiptJournal(path).pending(), ["call-1", "call-2"])
            completed = journal.finish("call-1", "completed", "result-a")
            self.assertEqual(journal.finish("call-1", "completed", "result-a"), completed)
            journal.finish("call-2", "cancelled", "cancel-a")
            self.assertEqual(astra.ReceiptJournal(path).pending(), [])

    def test_async_identity_and_terminal_conflicts_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = astra.ReceiptJournal(pathlib.Path(directory) / "receipts.json")
            journal.register("call-1", "idem-1", "safe_read", "input-a")
            self.assert_contract_error(journal.register, "call-1", "idem-1", "safe_read", "changed")
            self.assert_contract_error(journal.register, "call-2", "idem-1", "safe_read", "input-b")
            self.assert_contract_error(journal.finish, "missing", "completed", "result")
            self.assert_contract_error(journal.finish, "call-1", "running", "result")
            journal.finish("call-1", "timed_out", "timeout")
            self.assert_contract_error(journal.finish, "call-1", "completed", "late-result")

    def test_native_steering_is_ordered_preserves_work_and_never_cancels_calls(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "receipts.json"
            journal = astra.ReceiptJournal(path)
            journal.register("done", "idem-done", "safe_read", "input")
            journal.finish("done", "completed", "result-done")
            journal.register("pending", "idem-pending", "safe_read", "input-2")
            self.assert_contract_error(journal.steer, "steer-1", 1, "new-intent", [])
            journal.steer("steer-1", 1, "new-intent", ["result-done"])
            self.assertEqual(journal.pending(), ["pending"])
            self.assert_contract_error(journal.steer, "steer-2", 1, "newer", ["result-done"])
            journal.steer("steer-2", 2, "newer", ["result-done"])
            journal.finish("pending", "cancelled", "native-cancel-receipt")
            journal.disconnect()
            states = [item["state"] for item in astra.ReceiptJournal(path).data["steers"]]
            self.assertEqual(states, ["unknown_not_persisted", "unknown_not_persisted"])

    def test_cli_validates_contract(self):
        result = subprocess.run(["python3", str(SOURCE), "validate"], text=True, capture_output=True, check=True)
        self.assertTrue(json.loads(result.stdout)["valid"])


if __name__ == "__main__":
    unittest.main()
