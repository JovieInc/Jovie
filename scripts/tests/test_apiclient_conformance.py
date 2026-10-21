"""Runs packages/api-client/conformance/*.json against the Python client: TS and Python must agree."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from apiclient.contract import provider_spec  # noqa: E402
from apiclient.headers import classify_failure, parse_budget  # noqa: E402
from apiclient.policy import backoff_ms, credential_state, decide, empty_ledger, observe, record_outcome  # noqa: E402

CASES = ROOT / "packages" / "api-client" / "conformance"
HEADERS = json.loads((CASES / "headers.json").read_text())
POLICY = json.loads((CASES / "policy.json").read_text())


def subset(test: unittest.TestCase, actual: dict, expected: dict, where: str) -> None:
    for key, value in expected.items():
        test.assertIn(key, actual, f"{where}: missing {key}")
        if isinstance(value, dict):
            subset(test, actual[key], value, f"{where}.{key}")
        else:
            test.assertEqual(actual[key], value, f"{where}.{key}")


class HeaderConformanceTest(unittest.TestCase):
    def test_parse(self):
        for case in HEADERS["parse"]:
            with self.subTest(case["name"]):
                got = parse_budget(provider_spec(case["provider"]), case["headers"], case["at"], "fallback")
                self.assertEqual(got, case["expect"])

    def test_classify(self):
        for case in HEADERS["classify"]:
            with self.subTest(case["name"]):
                got = classify_failure(provider_spec(case["provider"]), case["status"], case["headers"],
                                       case.get("body"), case.get("text", ""), case.get("networkError", False),
                                       case["at"])
                self.assertEqual(got, case["expect"])


class PolicyConformanceTest(unittest.TestCase):
    def test_backoff(self):
        for case in POLICY["backoff"]:
            with self.subTest(attempt=case["attempt"], random=case["random"]):
                got = backoff_ms(case["attempt"], {"kind": "transient", "retryAtMs": case["retryAtMs"]}, case["now"],
                                 lambda: case["random"])
                self.assertEqual(got, case["expect"])

    def test_scenarios(self):
        for scenario in POLICY["scenarios"]:
            with self.subTest(scenario["name"]):
                self.run_scenario(scenario)

    def run_scenario(self, scenario: dict) -> None:
        ledger = empty_ledger("test")
        for index, step in enumerate(scenario["steps"]):
            where = f"{scenario['name']}#{index}"
            at = step.get("at", 0)
            state = credential_state(ledger, "cred", at)
            op = step["op"]
            if op == "observe":
                observe(state, step["observations"], at)
            elif op in ("decide", "repeat"):
                for _ in range(step.get("times", 1)):
                    got = decide(state, step.get("priority", "default"), step.get("costs", {}), at,
                                 write=step.get("write", False), min_write_interval_ms=step.get("minWriteIntervalMs"))
                    subset(self, got, step.get("expect", {}), where)
            elif op == "outcome":
                change = record_outcome(state, step.get("priority", "default"), step.get("resource", "core"),
                                        step["failure"], step.get("probe", False), at)
                wanted = step["expect"]["transition"]
                if wanted is None:
                    self.assertIsNone(change, where)
                else:
                    subset(self, change, wanted, where)
            elif op == "expect":
                if "bucket" in step:
                    self.assertEqual(state["buckets"][step["bucket"]]["remaining"], step["remaining"], where)
                if "breaker" in step:
                    self.assertEqual(state["breaker"]["state"], step["breaker"], where)


if __name__ == "__main__":
    unittest.main()
