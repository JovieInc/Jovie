#!/usr/bin/env python3
"""Fail-closed GPT-6 Astra readiness contract; never schedules or executes work."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import pathlib
import tempfile
import time

HERE = pathlib.Path(__file__).resolve().parent
CONTRACT_PATH = HERE / "contract.json"
TERMINAL = {"completed", "cancelled", "timed_out"}


class ContractError(ValueError):
    pass


def _valid_sha256(value):
    return (
        isinstance(value, str)
        and len(value) == 64
        and all(character in "0123456789abcdef" for character in value)
    )


def load_contract(path=CONTRACT_PATH):
    data = json.loads(pathlib.Path(path).read_text())
    if data.get("schema") != "jovie-astra-readiness/v1":
        raise ContractError("unsupported Astra contract schema")
    if data.get("model") != "gpt-6-astra" or data["activation"].get("enabled"):
        raise ContractError("Astra readiness must remain disabled and model-specific")
    if data["activation"].get("access") != "UNKNOWN":
        raise ContractError("checked-in live Astra access must remain UNKNOWN")
    required = {"execution", "delegation", "testing", "state"}
    if set(data.get("prompt_sections", {})) != required:
        raise ContractError("canonical prompt sections are incomplete")
    if data["async_tool_eligibility"].get("eligible"):
        raise ContractError("no current Symphony tool has proven async eligibility")
    return data


def compile_prompt(task, contract=None):
    contract = contract or load_contract()
    required = (
        "intent", "constraints", "authority", "model_fit", "budget", "completion", "tests",
        "steering", "escalation", "receipts",
    )
    missing = [key for key in required if not str(task.get(key, "")).strip()]
    if missing:
        raise ContractError(f"task prompt missing: {', '.join(missing)}")
    prefix_lines = [
        f"ASTRA_PROMPT_CONTRACT={contract['prompt_version']}",
        "This contract supplements higher-priority repository instructions.",
    ]
    for name, lines in contract["prompt_sections"].items():
        prefix_lines.append(f"[{name.upper()}]")
        prefix_lines.extend(f"- {line}" for line in lines)
    prefix = "\n".join(prefix_lines)
    digest = hashlib.sha256(prefix.encode()).hexdigest()
    task_lines = ["[TASK]"] + [f"{key.upper()}: {task[key].strip()}" for key in required]
    return {"version": contract["prompt_version"], "prefix_sha256": digest, "prompt": prefix + "\n" + "\n".join(task_lines)}


def validate_responses_request(request, endpoint, contract=None):
    """Return a copy; non-Astra requests are deliberately untouched."""
    contract = contract or load_contract()
    result = copy.deepcopy(request)
    if request.get("model") != contract["model"]:
        return result
    if endpoint != contract["request"]["endpoint"]:
        raise ContractError("Astra tool/reasoning requests require /v1/responses")
    bad = sorted(set(request) & set(contract["request"]["unsupported_parameters"]))
    if bad:
        raise ContractError(f"unsupported Astra parameters: {', '.join(bad)}")
    effort = (request.get("reasoning") or {}).get("effort")
    if effort not in contract["request"]["reasoning_efforts"]:
        raise ContractError("Astra reasoning effort must be low, medium, high, xhigh, or max")
    cache = request.get("prompt_cache_options")
    if cache is not None and cache != contract["request"]["prompt_cache_options"]:
        raise ContractError("Astra prompt cache options must use ttl=30m")
    tools = request.get("tools") or []
    async_tools = [tool for tool in tools if tool.get("async") is True]
    if any(tool.get("type") not in {"function", "custom"} for tool in async_tools):
        raise ContractError("only client function/custom tools may be async")
    if any("code_interpreter" in tool.get("allowed_callers", []) for tool in async_tools):
        raise ContractError("programmatic callers cannot invoke async tools")
    has_agent = any(tool.get("type") == "agent" for tool in tools)
    if has_agent and async_tools and request.get("parallel_tool_calls") is not False:
        raise ContractError("multi-agent async tools require parallel_tool_calls=false")
    if has_agent and (
        request.get("max_tool_calls") is not None
        or (request.get("reasoning") or {}).get("summary") is not None
        or request.get("compact") is not None
    ):
        raise ContractError("multi-agent excludes max_tool_calls, reasoning summaries, and standalone compact")
    outputs = [item for item in request.get("input", []) if isinstance(item, dict) and item.get("type") in {"function_call_output", "custom_tool_call_output"}]
    if outputs and not (request.get("previous_response_id") or request.get("conversation")):
        raise ContractError("tool continuations must preserve Responses conversation/reasoning state")
    return result


def validate_configuration_update(current, update):
    if current.get("model") != "gpt-6-astra":
        raise ContractError("configuration_update is Astra-only in this contract")
    if current.get("multi_agent"):
        raise ContractError("configuration_update is single-agent only")
    if current.get("previous_event") == "configuration_update":
        raise ContractError("configuration updates cannot be adjacent")
    if current.get("auto_compaction") or current.get("truncation"):
        raise ContractError("configuration_update conflicts with automatic compaction/truncation")
    effort = update.get("reasoning_effort")
    if effort not in {"low", "medium", "high", "xhigh", "max"}:
        raise ContractError("invalid Astra reasoning update")
    return {**current, "reasoning_effort": effort, "prompt_cache_key": current.get("prompt_cache_key"), "previous_event": "configuration_update"}


def activation_decision(enabled, probe, now=None, contract=None, required_capabilities=()):
    contract = contract or load_contract()
    if not enabled:
        return {"selected": False, "reason": "disabled"}
    if not required_capabilities:
        return {"selected": False, "reason": "task_capabilities_missing"}
    if (
        isinstance(probe, dict)
        and probe.get("schema") == contract["activation"]["required_probe_schema"]
        and probe.get("model") == contract["model"]
        and probe.get("available") is False
        and probe.get("failure") in contract["activation"]["terminal_unavailable_reasons"]
        and _valid_sha256(probe.get("account_scope_sha256"))
        and _valid_sha256(probe.get("useful_turn_receipt_sha256"))
    ):
        return {"selected": False, "reason": "capability_unavailable", "failure": probe["failure"], "retryable": False}
    now = time.time() if now is None else now
    required = {
        "schema": contract["activation"]["required_probe_schema"],
        "model": contract["model"], "available": True,
        "responses_transport": True, "dynamic_tool_async": True,
        "turn_steer": True, "thread_resume": True,
        "durable_pending_call_registry": True, "evidence_accepted": True,
    }
    if not isinstance(probe, dict) or any(probe.get(k) != v for k, v in required.items()):
        return {"selected": False, "reason": "capability_unproven"}
    if not _valid_sha256(probe.get("account_scope_sha256")) or not _valid_sha256(
        probe.get("useful_turn_receipt_sha256")
    ):
        return {"selected": False, "reason": "capability_unproven"}
    if not set(required_capabilities).issubset(set(probe.get("capabilities", []))):
        return {"selected": False, "reason": "capability_mismatch"}
    age = now - probe.get("probed_at", 0)
    if age < 0 or age > contract["activation"]["max_probe_age_seconds"]:
        return {"selected": False, "reason": "probe_stale"}
    return {"selected": True, "reason": "verified"}


class ReceiptJournal:
    """Durable evidence registry only; native transports own execution and queues."""

    def __init__(self, path):
        self.path = pathlib.Path(path)
        try:
            self.data = json.loads(self.path.read_text())
        except FileNotFoundError:
            self.data = {"schema": "jovie-astra-receipts/v1", "sequence": 0, "calls": {}, "steers": []}

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, name = tempfile.mkstemp(prefix=self.path.name + ".", dir=self.path.parent)
        try:
            with os.fdopen(fd, "w") as handle:
                json.dump(self.data, handle, sort_keys=True)
                handle.flush(); os.fsync(handle.fileno())
            os.replace(name, self.path)
        finally:
            if os.path.exists(name): os.unlink(name)

    def register(self, call_id, idempotency_key, tool, input_digest):
        expected = {"idempotency_key": idempotency_key, "tool": tool, "input_digest": input_digest}
        prior = self.data["calls"].get(call_id)
        if prior:
            if any(prior.get(k) != v for k, v in expected.items()):
                raise ContractError("call_id reuse changed identity or input")
            return prior
        if any(call["idempotency_key"] == idempotency_key for call in self.data["calls"].values()):
            raise ContractError("idempotency_key must be conversation-unique")
        self.data["sequence"] += 1
        record = {**expected, "state": "pending", "sequence": self.data["sequence"]}
        self.data["calls"][call_id] = record; self._save(); return record

    def finish(self, call_id, state, receipt_digest):
        if state not in TERMINAL:
            raise ContractError("invalid terminal async state")
        record = self.data["calls"].get(call_id)
        if not record:
            raise ContractError("unknown async call_id")
        if record["state"] in TERMINAL:
            if record["state"] != state or record.get("receipt_digest") != receipt_digest:
                raise ContractError("terminal receipt conflicts with durable result")
            return record
        record.update(state=state, receipt_digest=receipt_digest); self._save(); return record

    def pending(self):
        return [key for key, value in sorted(self.data["calls"].items(), key=lambda item: item[1]["sequence"]) if value["state"] == "pending"]

    def steer(self, steer_id, sequence_number, input_digest, preserved_receipts):
        if any(item["steer_id"] == steer_id or item["sequence_number"] == sequence_number for item in self.data["steers"]):
            raise ContractError("duplicate native steering identity/order")
        if self.data["steers"] and sequence_number <= self.data["steers"][-1]["sequence_number"]:
            raise ContractError("native steering sequence must increase")
        completed = {value["receipt_digest"] for value in self.data["calls"].values() if value["state"] == "completed"}
        if not completed.issubset(set(preserved_receipts)):
            raise ContractError("steering lost completed-work receipts")
        item = {"steer_id": steer_id, "sequence_number": sequence_number, "input_digest": input_digest, "state": "accepted", "preserved_receipts": sorted(preserved_receipts)}
        self.data["steers"].append(item); self._save(); return item

    def disconnect(self):
        for item in self.data["steers"]:
            if item["state"] == "accepted": item["state"] = "unknown_not_persisted"
        self._save()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("validate", "compile", "decide"))
    parser.add_argument("--input")
    args = parser.parse_args()
    if args.command == "validate": output = {"valid": True, "prompt_version": load_contract()["prompt_version"]}
    else:
        document = json.loads(pathlib.Path(args.input).read_text())
        output = compile_prompt(document) if args.command == "compile" else activation_decision(document.get("enabled", False), document.get("probe"), required_capabilities=document.get("required_capabilities", ()))
    print(json.dumps(output, sort_keys=True))


if __name__ == "__main__":
    main()
