"""Python API client core against the fake provider: budgets, priorities, breaker, cache, ledger."""
from __future__ import annotations

import io
import os
import shutil
import sys
import tempfile
import threading
import time
import unittest
from contextlib import redirect_stderr
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from apiclient.cache import FileResponseCache, cacheable, to_cached  # noqa: E402
from apiclient.client import ApiClient, ApiError  # noqa: E402
from apiclient.contract import priority_policy, provider_for_url, provider_spec, resource_for  # noqa: E402
from apiclient.fake import FakeClock, FakeProvider  # noqa: E402
from apiclient.policy import credential_state  # noqa: E402
from apiclient.store import (  # noqa: E402
    FileLedgerStore, MemoryLedgerStore, credential_label, default_state_root, hash_credential,
)

GH = "https://api.github.com"


def quiet(_event):
    return None


class Harness:
    def __init__(self, style="github", store=None, clock=None, **extra):
        self.clock = clock or FakeClock()
        self.fake = FakeProvider(style, self.clock)
        self.events = []
        provider = {"github": "github", "linear": "linear"}.get(style, "vercel")
        self.store = store or MemoryLedgerStore()
        self.client = ApiClient(provider, "cred-a", store=self.store, transport=self.fake, now=self.clock.read,
                                sleep=self.clock.sleep, random=lambda: 0.5, log=self.events.append, **extra)


def tmp(test: unittest.TestCase) -> Path:
    path = Path(tempfile.mkdtemp(prefix="apiclient-"))
    test.addCleanup(shutil.rmtree, path, True)
    return path


class ClientTest(unittest.TestCase):
    def test_polling_is_shed_below_reserve_while_merges_land(self):
        h = Harness()
        h.fake.set_remaining("core", 1300)
        h.client.request(f"{GH}/repos/o/r/pulls", priority="poll")
        h.fake.set_remaining("core", 1200)
        h.client.request(f"{GH}/repos/o/r/pulls/1", priority="merge")
        with self.assertRaises(ApiError) as caught:
            h.client.request(f"{GH}/repos/o/r/pulls/2", priority="poll")
        self.assertEqual((caught.exception.kind, caught.exception.exit_code), ("shed", 75))
        merged = h.client.request(f"{GH}/repos/o/r/pulls/3/merge", method="PUT", priority="merge")
        self.assertEqual(merged.status, 200)
        self.assertFalse([c for c in h.fake.calls if c["path"].endswith("/pulls/2")])

    def test_retry_after_is_honored(self):
        h = Harness("generic")
        h.fake.fault({"kind": "status", "status": 429, "retryAfterS": 7})
        start = h.clock.now
        res = h.client.request("https://api.vercel.com/v6/deployments")
        self.assertEqual((res.status, res.attempts), (200, 2))
        self.assertGreaterEqual(h.clock.now - start, 7000)

    def test_secondary_limit_opens_breaker_and_good_probe_closes_it(self):
        h = Harness()
        h.fake.fault({"kind": "secondary", "retryAfterS": 60})
        with self.assertRaises(ApiError):
            h.client.request(f"{GH}/repos/o/r", max_wait_ms=0)
        self.assertEqual(h.events[-1]["schema"], "jovie.api-client.breaker/v1")
        with self.assertRaises(ApiError) as caught:
            h.client.request(f"{GH}/repos/o/r/issues", priority="poll")
        self.assertEqual(caught.exception.kind, "shed")
        h.clock.now += 61_000
        h.client.request(f"{GH}/repos/o/r/issues")
        self.assertEqual([f"{e['from']}->{e['to']}" for e in h.events],
                         ["closed->open", "open->half-open", "half-open->closed"])
        self.assertEqual(len(h.fake.calls), 2)

    def test_reads_retry_on_5xx_but_failed_posts_are_not_resent(self):
        h = Harness()
        h.fake.fault({"kind": "status", "status": 502}, {"kind": "network"})
        self.assertEqual(h.client.request(f"{GH}/repos/o/r").attempts, 3)
        h.fake.fault({"kind": "status", "status": 502})
        with self.assertRaises(ApiError) as caught:
            h.client.request(f"{GH}/repos/o/r/issues", method="POST", body={"title": "t"})
        self.assertEqual((caught.exception.kind, caught.exception.status), ("exhausted", 502))
        self.assertEqual(len([c for c in h.fake.calls if c["method"] == "POST"]), 1)

    def test_exhausted_bucket_defers_normal_work_and_critical_waits_for_reset(self):
        h = Harness()
        h.fake.set_remaining("graphql", 0)
        query = {"query": "{ viewer { login } }"}
        with self.assertRaises(ApiError) as caught:
            h.client.request(f"{GH}/graphql", method="POST", body=query)
        self.assertEqual((caught.exception.kind, caught.exception.failure), ("exhausted", "primary"))
        with self.assertRaises(ApiError) as caught:
            h.client.request(f"{GH}/graphql", method="POST", body={"query": "{ a }"})
        self.assertEqual(caught.exception.kind, "budget")
        self.assertEqual(len(h.fake.calls), 1)
        reset = h.fake.budget("graphql")["resetAt"]
        res = h.client.request(f"{GH}/graphql", method="POST", body=query, priority="merge", max_wait_ms=3_600_000)
        self.assertEqual(res.status, 200)
        self.assertGreaterEqual(h.clock.now, reset)

    def test_etag_and_ttl_caches_spend_no_budget(self):
        h = Harness()
        h.client.request(f"{GH}/repos/o/r/pulls")
        before = h.fake.budget("core")["remaining"]
        again = h.client.request(f"{GH}/repos/o/r/pulls")
        self.assertEqual(again.from_cache, "etag")
        self.assertEqual(again.json(), {"ok": True, "path": "/repos/o/r/pulls"})
        self.assertEqual(h.fake.budget("core")["remaining"], before)
        h.client.request(f"{GH}/repos/o/r", cache_ttl_ms=60_000)
        hit = h.client.request(f"{GH}/repos/o/r", cache_ttl_ms=60_000)
        self.assertEqual(hit.from_cache, "ttl")
        self.assertEqual([c["status"] for c in h.fake.calls], [200, 304, 200])
        usage = list(h.client.state()["usage"].values())[0]["default"]
        self.assertEqual((usage["cacheHits"], usage["notModified"]), (1, 1))

    def test_linear_ratelimited_400_empties_the_bucket(self):
        h = Harness("linear")
        h.fake.set_remaining("requests", 0)
        with self.assertRaises(ApiError) as caught:
            h.client.request("https://api.linear.app/graphql", method="POST", body={"query": "{ viewer { id } }"},
                             max_wait_ms=0)
        self.assertEqual(caught.exception.failure, "primary")
        with self.assertRaises(ApiError) as caught:
            h.client.request("https://api.linear.app/graphql", method="POST", body={"query": "{ a }"}, priority="poll")
        self.assertEqual(caught.exception.kind, "shed")
        self.assertEqual(len(h.fake.calls), 1)

    def test_file_ledger_shares_one_budget_across_processes(self):
        root = tmp(self)
        clock = FakeClock()
        first = Harness(store=FileLedgerStore(root, clock.read), clock=clock)
        first.fake.set_remaining("core", 1000)
        first.client.request(f"{GH}/repos/o/r")
        second = ApiClient("github", "cred-a", store=FileLedgerStore(root, clock.read), transport=first.fake,
                           now=clock.read, sleep=clock.sleep, log=quiet)
        with self.assertRaises(ApiError):
            second.request(f"{GH}/repos/o/r/pulls", priority="poll")
        self.assertEqual(second.state()["buckets"]["core"]["remaining"], 999)

    def test_writes_are_spaced(self):
        h = Harness()
        start = h.clock.now
        for _ in range(2):
            h.client.request(f"{GH}/repos/o/r/issues", method="POST", body={}, priority="repair")
        self.assertGreaterEqual(h.clock.now - start, 1000)


class StoreTest(unittest.TestCase):
    def test_concurrent_transactions_serialize(self):
        store = FileLedgerStore(tmp(self))

        def bump():
            def fn(ledger):
                credential_state(ledger, "c", int(time.time() * 1000))["lastWriteAt"] += 1
            store.transact("github", fn)

        threads = [threading.Thread(target=bump) for _ in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(store.read("github")["credentials"]["c"]["lastWriteAt"], 20)

    def test_separate_stores_on_one_dir_serialize(self):
        root = tmp(self)
        stores = [FileLedgerStore(root, lock_timeout_ms=60_000) for _ in range(3)]

        def bump(store):
            def fn(ledger):
                credential_state(ledger, "c", int(time.time() * 1000))["lastWriteAt"] += 1
            for _ in range(10):
                store.transact("github", fn)

        threads = [threading.Thread(target=bump, args=(s,)) for s in stores]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(stores[0].read("github")["credentials"]["c"]["lastWriteAt"], 30)

    def test_lock_timeout_returns_decision_without_clobbering_holder(self):
        store = FileLedgerStore(tmp(self), lock_timeout_ms=50)
        store.transact("github", lambda ledger: credential_state(ledger, "c", int(time.time() * 1000)).update(lastWriteAt=7))
        lock = store.dir / "github.lock.d"
        lock.mkdir()
        (lock / "owner").write_text("other-process")

        def fn(ledger):
            credential_state(ledger, "c", int(time.time() * 1000))["lastWriteAt"] = 999
            return "decided"

        with redirect_stderr(io.StringIO()):
            self.assertEqual(store.transact("github", fn), "decided")
        self.assertEqual(store.read("github")["credentials"]["c"]["lastWriteAt"], 7)
        self.assertEqual((lock / "owner").read_text(), "other-process")

    def test_lock_timing_ignores_an_injected_fake_clock(self):
        clock = FakeClock()
        store = FileLedgerStore(tmp(self), clock.read, lock_timeout_ms=50)
        lock = store.dir / "github.lock.d"
        lock.mkdir(parents=True)
        with redirect_stderr(io.StringIO()):
            self.assertIsNone(store.transact("github", lambda ledger: None))

    def test_stale_lock_is_broken_and_torn_file_reads_empty(self):
        store = FileLedgerStore(tmp(self))
        lock = store.dir / "linear.lock.d"
        lock.mkdir(parents=True)
        old = time.time() - 60
        os.utime(lock, (old, old))
        store.path("linear").write_text('{"schema":')
        self.assertEqual(store.read("linear")["credentials"], {})
        store.transact("linear", lambda ledger: credential_state(ledger, "k", int(time.time() * 1000)))
        self.assertEqual(list(store.read("linear")["credentials"]), ["k"])
        self.assertEqual(oct(store.path("linear").stat().st_mode & 0o777), "0o600")

    def test_roots_hashes_labels_and_contract_lookups(self):
        self.assertEqual(default_state_root({"JOVIE_API_STATE_DIR": "/x"}), Path("/x"))
        self.assertEqual(default_state_root({"LANES_STATE": "/l"}), Path("/l"))
        self.assertEqual(default_state_root({}, "/home/u"), Path("/home/u/.local/state/jovie-lanes"))
        digest = hash_credential("https://api.linear.app/graphql", "lin_api_secret")
        self.assertEqual(len(digest), 64)
        self.assertEqual(credential_label(digest), digest[:12])
        self.assertEqual(credential_label("app-installation:1"), "app-installation:1")
        self.assertEqual(provider_for_url("https://sentry.io/api/0/projects/"), "sentry")
        self.assertIsNone(provider_for_url("https://sentry.io/welcome/"))
        self.assertEqual(resource_for("github", f"{GH}/search/issues"), "search")
        with self.assertRaises(ValueError):
            provider_spec("nope")
        with self.assertRaises(ValueError):
            priority_policy("urgent")

    def test_file_cache_round_trips_and_prunes(self):
        cache = FileResponseCache(tmp(self), "github", max_age_ms=1000)
        now = int(time.time() * 1000)
        headers = {"etag": '"a"', "content-type": "application/json"}
        cache.set("k1", to_cached(200, headers, '{"a":1}', now))
        self.assertEqual(cache.get("k1")["etag"], '"a"')
        self.assertIsNone(cache.get("missing"))
        stale = cache.dir / "old.json"
        stale.write_text("{}")
        os.utime(stale, (time.time() - 10, time.time() - 10))
        for i in range(50):
            cache.set(f"k{i + 2}", to_cached(200, headers, "{}", now))
        self.assertIsNone(cache.get("old"))
        self.assertFalse(cacheable(200, {"cache-control": "no-store"}, "{}"))


if __name__ == "__main__":
    unittest.main()
