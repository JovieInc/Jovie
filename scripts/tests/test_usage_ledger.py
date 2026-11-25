"""Hermetic checks for the lanes Python usage-ledger reader."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from scripts.lanes import usage_ledger


FIXTURE = Path(__file__).resolve().parents[1] / "lib/__tests__/fixtures/cursor-usage-quota-event.json"


class UsageLedgerReaderTest(unittest.TestCase):
    def test_python_reader_matches_fixture_event(self):
        payload = json.loads(FIXTURE.read_text())
        ledger = {
            "schema": usage_ledger.LEDGER_SCHEMA,
            "events": [
                {
                    "schema": "jovie.usage-limit-event/v1",
                    "provider": "cursor",
                    "accountId": payload["accountId"],
                    "pool": payload["pool"],
                    "condition": "exhausted",
                    "observedAt": payload["observedAt"],
                    "remaining": {"unit": "percent", "value": None},
                    "source": {"channel": "cursor-cli", "receipt": {"transcript": "redacted"}},
                }
            ],
        }
        now = usage_ledger._parse_iso(payload["observedAt"])
        assert now is not None
        state = usage_ledger.pool_state(
            ledger,
            "cursor",
            payload["accountId"],
            payload["pool"],
            now=now + 60,
        )
        self.assertEqual(state["condition"], "exhausted")
        self.assertEqual(state["freshness"], "fresh")
        projection = usage_ledger.project_ovie_pools(ledger)
        self.assertEqual(projection["controls"], "read-only")
        self.assertEqual(len(projection["pools"]), 1)


if __name__ == "__main__":
    unittest.main()