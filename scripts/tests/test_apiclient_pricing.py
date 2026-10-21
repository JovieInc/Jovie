"""Python mirror of packages/api-client/pricing.test.ts: blocked providers, spend caps, credential order."""
from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from apiclient.client import ApiClient, BudgetExhaustedError  # noqa: E402
from apiclient.contract import BlockedProviderError, callable_spec, provider_for_url  # noqa: E402
from apiclient.credentials import CredentialUnavailableError, resolve_credential  # noqa: E402
from apiclient.fake import FakeClock  # noqa: E402
from apiclient.policy import credential_state, empty_ledger, prune_ledger, utc_day  # noqa: E402
from apiclient.store import MemoryLedgerStore  # noqa: E402

EXA = "https://api.exa.ai/search"


def priced(statuses, cap=1.0):
    clock, calls, events, store = FakeClock(), [], [], MemoryLedgerStore()

    def transport(method, url, headers, body, timeout_s):
        calls.append(url)
        status = statuses.pop(0) if statuses else 200
        return status, {"content-type": "application/json"}, '{"ok":true}' if status == 200 else "{}"

    client = ApiClient("exa", "cred-a", store=store, transport=transport, now=clock.read, sleep=clock.sleep,
                       random=lambda: 0.5, log=events.append, daily_spend_cap_usd=cap)
    return client, calls, events, store


def spent(store):
    return (store.read("exa")["credentials"].get("cred-a") or {}).get("spend", {}).get("usd", 0)


class PricingTest(unittest.TestCase):
    def test_composio_is_registered_but_blocked(self):
        self.assertEqual(provider_for_url("https://backend.composio.dev/api/v3/tools"), "composio")
        with self.assertRaises(BlockedProviderError):
            callable_spec("composio")
        with self.assertRaisesRegex(BlockedProviderError, "composio is blocked"):
            ApiClient("composio", "x", store=MemoryLedgerStore())

    def test_cap_fails_closed_without_a_network_call(self):
        client, calls, events, store = priced([], cap=0.25)
        client.request(EXA, method="POST", price_usd=0.1)
        client.request(EXA, method="POST", price_usd=0.1)
        self.assertAlmostEqual(spent(store), 0.2)
        with self.assertRaises(BudgetExhaustedError) as caught:
            client.request(EXA, method="POST", price_usd=0.1)
        self.assertEqual((caught.exception.kind, caught.exception.status, caught.exception.cap_usd),
                         ("budget_exhausted", 402, 0.25))
        self.assertEqual(len(calls), 2)
        self.assertEqual(events[-1]["outcome"], "budget_exhausted")

    def test_priced_call_without_a_cap_is_refused(self):
        client, calls, _, _ = priced([], cap=None)
        with self.assertRaisesRegex(BudgetExhaustedError, "no daily spend cap"):
            client.request(EXA, method="POST", price_usd=0.01)
        self.assertEqual(calls, [])

    def test_failed_calls_are_refunded_and_402_stops(self):
        client, calls, _, store = priced([400, 402])
        self.assertEqual(client.request(EXA, method="POST", price_usd=0.5).status, 400)
        self.assertEqual(spent(store), 0)
        with self.assertRaises(BudgetExhaustedError):
            client.request(EXA, method="POST", price_usd=0.5)
        self.assertEqual(len(calls), 2)
        self.assertEqual(spent(store), 0)

    def test_todays_spender_survives_prune_until_the_next_day(self):
        now = int(datetime(2026, 10, 21, 12, tzinfo=timezone.utc).timestamp() * 1000)
        ledger = empty_ledger("exa")
        credential_state(ledger, "spender", now)["spend"] = {"day": utc_day(now), "usd": 0.3}
        credential_state(ledger, "idle", now)
        prune_ledger(ledger, now + 3 * 3_600_000)
        self.assertEqual(list(ledger["credentials"]), ["spender"])
        prune_ledger(ledger, now + 13 * 3_600_000)
        self.assertEqual(list(ledger["credentials"]), [])


class CredentialOrderTest(unittest.TestCase):
    def test_order_logging_and_fail_closed(self):
        events = []
        self.assertEqual(resolve_credential("exa", {"own": lambda: "mine", "shared": lambda: "team"},
                                            log=events.append), ("own", "mine"))
        self.assertEqual(events, [])
        self.assertEqual(resolve_credential("exa", {"own": lambda: None, "shared": lambda: "team"},
                                            log=events.append), ("shared", "team"))
        self.assertEqual((events[-1]["skipped"], events[-1]["outcome"]), (["own"], "fallback"))
        with self.assertRaises(CredentialUnavailableError):
            resolve_credential("exa", {"own": lambda: "", "pooled": lambda: "pool"}, log=events.append)
        self.assertEqual((events[-1]["tried"], events[-1]["outcome"]), (["own"], "unavailable"))
        self.assertEqual(resolve_credential("exa", {"pooled": lambda: "pool"}, allow_pooled=True,
                                            log=events.append), ("pooled", "pool"))


if __name__ == "__main__":
    unittest.main()
