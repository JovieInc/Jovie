"""Capacity admission, diagnostic PR census and idle expiry (scripts/lanes/pr_wip.py).

Run with:
    python3 -m unittest scripts.tests.test_pr_wip -v
"""
from __future__ import annotations

import io
import json
import os
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import pr_wip  # noqa: E402

NOW = 1_793_500_000.0
DAY = 86400
HEALTHY = {"allowed": True, "known": True, "reason": "within-capacity", "blockers": [], "unknown": []}
POLICY = {"minCap": 2, "defaultCap": 3, "caps": {"codex": 2, "opus": 4}, "exemptProducers": ["tim", "dependabot"],
          "liveWindowHours": 48, "expire": {"enabled": False, "ownerlessIdleDays": 7, "anyIdleDays": 21,
                                            "maxClosesPerTick": 2}}


def iso(epoch: float) -> str:
    from datetime import datetime, timezone
    return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def pr(number, branch, *, idle_days=0.0, age_days=1.0, labels=(), state="BLOCKED", draft=False, queued=False):
    return {"number": number, "headRefName": branch, "updatedAt": iso(NOW - 60),
            "lastCommitAt": iso(NOW - idle_days * DAY),
            "createdAt": iso(NOW - max(age_days, idle_days) * DAY), "labels": [{"name": name} for name in labels],
            "mergeStateStatus": state, "isDraft": draft, "isInMergeQueue": queued}


class PolicyFile(unittest.TestCase):
    def test_checked_in_policy_is_valid_and_expiry_waits_for_the_invariant(self):
        policy = pr_wip.load_policy()
        self.assertEqual(policy["schema"], "jovie-pr-wip-policy/v1")
        self.assertTrue(all(isinstance(cap, int) and cap >= policy["minCap"] for cap in policy["caps"].values()))
        self.assertIn("tim", policy["exemptProducers"])
        # JOV-INV-011: automatic close needs an explicit duplicate label until the founder amends it.
        self.assertFalse(policy["expire"]["enabled"])


class Admission(unittest.TestCase):
    def test_producer_is_the_branch_prefix(self):
        self.assertEqual(pr_wip.producer_of("codex/jov-1-20261101"), "codex")
        self.assertEqual(pr_wip.producer_of("Opus/mesh"), "opus")
        self.assertEqual(pr_wip.producer_of("main"), "(none)")

    def test_twelve_prs_against_eight_is_diagnostic_when_capacity_is_healthy(self):
        prs = [pr(n, f"codex/jov-{n}", draft=n < 10, state="DIRTY" if n < 6 else "BLOCKED") for n in range(12)]
        policy = {**POLICY, "caps": {"codex": 8}}
        out = pr_wip.admit(prs, "codex", policy, capacity=HEALTHY)
        self.assertEqual((out["allowed"], out["used"], out["cap"], out["reason"]), (True, 12, 8, "within-capacity"))
        self.assertEqual(out["reservation"], "at-request", "a prospective check does not invent an entire PR's quota cost")

    def test_holds_and_other_producers_remain_count_diagnostics_only(self):
        prs = [pr(1, "codex/a"), pr(2, "codex/b", labels=["hold"]), pr(3, "opus/x")]
        out = pr_wip.admit(prs, "codex", POLICY, capacity=HEALTHY)
        self.assertEqual((out["allowed"], out["used"]), (True, 1))

    def test_exempt_producers_and_unknown_inventory_cannot_bypass_actual_exhaustion(self):
        exhausted = {"allowed": False, "known": True, "reason": "github-quota:core", "blockers": ["github-quota:core"]}
        for producer in ("codex", "tim", "dependabot"):
            with self.subTest(producer=producer):
                out = pr_wip.admit(None, producer, POLICY, capacity=exhausted)
                self.assertFalse(out["allowed"])
                self.assertEqual(out["reason"], "github-quota:core")
        unknown = pr_wip.admit(None, "codex", POLICY)
        self.assertEqual((unknown["allowed"], unknown["known"], unknown["reason"]), (True, False, "capacity-unknown"))

    def test_min_cap_floors_a_tiny_cap(self):
        self.assertEqual(pr_wip.cap_for("x", {**POLICY, "caps": {"x": 0}}), 2)


class Census(unittest.TestCase):
    def test_counts_age_mergeability_and_over_cap(self):
        prs = [pr(1, "codex/a", age_days=1, state="CLEAN"), pr(2, "codex/b", age_days=3, state="DIRTY"),
               pr(3, "opus/x", age_days=10, draft=True)]
        with patch.object(pr_wip, "capacity_snapshot", side_effect=AssertionError("census must not probe capacity")):
            out = pr_wip.census(prs, NOW, POLICY)
        self.assertEqual((out["open"], out["drafts"]), (3, 1))
        self.assertEqual(out["mergeable"], {"CLEAN": 1, "DIRTY": 1, "BLOCKED": 1})
        self.assertEqual(out["ageP50Hours"], 72.0)
        self.assertEqual(out["ageP95Hours"], 240.0)
        self.assertEqual(out["overCap"], ["codex"])
        self.assertEqual(out["byProducer"]["codex"], {"open": 2, "wip": 2, "cap": 2, "overCap": True})
        json.dumps(out)  # the lanes feed is JSON


class Expiry(unittest.TestCase):
    def test_disabled_policy_closes_nothing_unless_forced(self):
        prs = [pr(1, "ui/old", idle_days=9)]
        self.assertEqual(pr_wip.expiry_candidates(prs, NOW, POLICY), [])
        self.assertEqual([row[0]["number"] for row in pr_wip.expiry_candidates(prs, NOW, POLICY, force=True)], [1])

    def test_ownerless_idle_and_long_idle_expire_but_held_live_and_queued_stay(self):
        policy = {**POLICY, "expire": {**POLICY["expire"], "enabled": True}}
        prs = [pr(1, "ui/old", idle_days=9),                       # ownerless, idle > 7d
               pr(2, "codex/old", idle_days=9), pr(3, "codex/new"),  # codex is live: kept
               pr(4, "codex/ancient", idle_days=30),               # live producer, idle > 21d
               pr(5, "tim/old", idle_days=60), pr(6, "ui/held", idle_days=60, labels=["hold"]),
               pr(7, "ui/queued", idle_days=60, queued=True)]
        found = pr_wip.expiry_candidates(prs, NOW, policy)
        self.assertEqual([row[0]["number"] for row in found], [4, 1], "oldest first")
        self.assertIn("idle 30 days", found[0][1])
        self.assertIn("no live owner", found[1][1])

    def test_label_churn_does_not_make_an_idle_pr_look_live(self):
        policy = {**POLICY, "expire": {**POLICY["expire"], "enabled": True}}
        stale = pr(1, "ui/old", idle_days=9, age_days=12)
        self.assertEqual(stale["updatedAt"], iso(NOW - 60), "fixture: a bot touched it a minute ago")
        self.assertEqual([row[0]["number"] for row in pr_wip.expiry_candidates([stale], NOW, policy)], [1])

    def test_expire_respects_the_per_tick_cap_and_keeps_failed_closes_open(self):
        policy = {**POLICY, "expire": {**POLICY["expire"], "enabled": True, "maxClosesPerTick": 2}}
        prs = [pr(n, f"ui/b{n}", idle_days=10 + n) for n in range(1, 5)]
        attempted = []

        def close(number, body):
            attempted.append(number)
            self.assertIn("branch `ui/b", body)
            return number != 4
        closed = pr_wip.expire(prs, NOW, policy, close)
        self.assertEqual(attempted, [4, 3])
        self.assertEqual([row["pr"] for row in closed], [3])


class CapacitySnapshot(unittest.TestCase):
    def setUp(self):
        sys.path.insert(0, str(ROOT / "scripts"))
        from apiclient.store import MemoryLedgerStore
        from apiclient.policy import empty_credential
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.store = MemoryLedgerStore()
        self.credential = "app-installation:caller"
        self.state = empty_credential(int(NOW * 1000))
        self.state["buckets"] = {resource: {"remaining": 4000, "limit": 5000, "resetAt": (NOW + 3600) * 1000,
                                           "observedAt": NOW * 1000} for resource in ("core", "graphql")}
        self.store.transact("github", lambda ledger: ledger["credentials"].update({self.credential: self.state}))
        self.flow(queuedRuns=0, queuedOldestMin=None)

    def flow(self, **over):
        value = {"schema": "symphony-release-flow/v1", "observedAt": NOW, **over}
        (self.root / "release-flow.json").write_text(json.dumps(value))

    def snapshot(self, **over):
        return pr_wip.capacity_snapshot(store=self.store, credential=self.credential, state_dir=self.root, now=over.get("now", NOW))

    def test_healthy_empty_ci_queue_needs_no_oldest_age_and_does_not_reserve(self):
        before = self.store.read("github")
        out = self.snapshot()
        self.assertEqual((out["allowed"], out["known"], out["reason"]), (True, True, "within-capacity"))
        self.assertEqual(out["quota"]["scope"], "caller")
        self.assertEqual(self.store.read("github"), before)

    def test_zero_balance_stays_exhausted_until_reset_even_when_sample_is_stale(self):
        bucket = self.state["buckets"]["core"]
        bucket.update(remaining=0, observedAt=(NOW - 600) * 1000)
        before = self.snapshot()
        self.assertFalse(before["allowed"])
        self.assertEqual((before["reason"], before["retryAt"]), ("github-quota:core", NOW + 3600))
        after = self.snapshot(now=NOW + 3600)
        self.assertTrue(after["allowed"], "passed reset is unknown, not proof of exhaustion")
        self.assertFalse(after["known"], "passed reset must not manufacture a refill")
        self.assertIn("github:core", after["unknown"])

    def test_stale_positive_future_and_malformed_quota_are_unknown(self):
        bucket = self.state["buckets"]["core"]
        original = dict(bucket)
        for changes in ({"observedAt": (NOW - 61) * 1000}, {"observedAt": (NOW + 1) * 1000},
                        {"remaining": "4000"}, {"remaining": True}, {"remaining": -1}, {"resetAt": None}):
            with self.subTest(changes=changes):
                bucket.clear(); bucket.update(original, **changes)
                out = self.snapshot()
                self.assertTrue(out["allowed"])
                self.assertFalse(out["known"])
                self.assertIn("github:core", out["unknown"])

    def test_current_breaker_and_inflight_probe_are_unavailability_not_empty_quota(self):
        for state, field, token in (("open", "openUntil", "github-breaker:secondary-rate-limit"),
                                    ("half-open", "probeUntil", "github-breaker-probe-in-flight")):
            with self.subTest(state=state):
                self.state["breaker"].update(state=state, reason="secondary-rate-limit", **{field: (NOW + 60) * 1000})
                out = self.snapshot()
                self.assertFalse(out["allowed"])
                self.assertEqual(out["reason"], token)
                self.assertEqual(out["retryAt"], NOW + 60)
                self.assertEqual(out["quota"]["buckets"]["core"]["remaining"], 4000)
        self.state["breaker"].update(state="open", openUntil=(NOW - 1) * 1000)
        self.assertTrue(self.snapshot()["allowed"])

    def test_malformed_breaker_never_certifies_capacity_with_otherwise_healthy_evidence(self):
        for breaker in (["bad"], {}, {"state": "open", "openUntil": "bad"},
                        {"state": "half-open", "probeUntil": float("inf")}):
            with self.subTest(breaker=breaker):
                self.state["breaker"] = breaker
                out = self.snapshot()
                self.assertTrue(out["allowed"])
                self.assertFalse(out["known"])
                self.assertIn("github:breaker", out["unknown"])

    def test_other_installation_headroom_is_never_substituted_for_callers_shared_bucket(self):
        other = json.loads(json.dumps(self.state))
        self.store.transact("github", lambda ledger: ledger["credentials"].update({"app-installation:other": other}))
        self.state["buckets"]["graphql"]["remaining"] = 0
        out = self.snapshot()
        self.assertFalse(out["allowed"])
        self.assertEqual(out["reason"], "github-quota:graphql")
        self.assertEqual(out["quota"]["credential"], self.credential)
        self.store.transact("github", lambda ledger: ledger["credentials"].pop(self.credential))
        unknown = self.snapshot()
        self.assertTrue(unknown["allowed"])
        self.assertFalse(unknown["known"])
        self.assertIn("github:graphql", unknown["unknown"])

    def test_current_shared_client_reservations_and_priority_reserve_limit_intake(self):
        from apiclient.policy import decide
        self.state["buckets"]["core"].update(remaining=1, limit=1)
        def reserve(ledger):
            return decide(ledger["credentials"][self.credential], "repair", {"core": 1}, int(NOW * 1000))
        self.assertEqual(self.store.transact("github", reserve)["action"], "go")
        self.assertFalse(self.snapshot()["allowed"])
        self.state["buckets"]["core"].update(remaining=250, limit=5000)
        self.assertFalse(self.snapshot()["allowed"], "new intake preserves the existing request priority reserve")

    def test_qualified_repair_priority_uses_existing_reserve_but_never_empty_quota_or_ci(self):
        self.state["buckets"]["core"].update(remaining=100, limit=5000)
        self.assertFalse(self.snapshot()["allowed"])
        options = dict(store=self.store, credential=self.credential, state_dir=self.root, now=NOW, priority="repair")
        self.assertTrue(pr_wip.capacity_snapshot(**options)["allowed"])
        self.state["buckets"]["core"]["remaining"] = 0
        self.assertFalse(pr_wip.capacity_snapshot(**options)["allowed"])
        self.state["buckets"]["core"]["remaining"] = 100
        self.flow(queuedRuns=400, queuedOldestMin=1)
        self.assertEqual(pr_wip.capacity_snapshot(**options)["reason"], "ci-runner-backlog")

    def test_corrupt_ci_json_remains_unknown_without_breaking_admission(self):
        for payload in ('not json', '[]', 'null', '42'):
            with self.subTest(payload=payload):
                (self.root / "release-flow.json").write_text(payload)
                out = self.snapshot()
                self.assertTrue(out["allowed"])
                self.assertFalse(out["known"])
                self.assertIn("ci", out["unknown"])

    def test_ci_evidence_fifo_symlink_and_oversize_are_unknown(self):
        path = self.root / "release-flow.json"
        for kind in ("fifo", "symlink", "oversize"):
            with self.subTest(kind=kind):
                path.unlink(missing_ok=True)
                if kind == "fifo":
                    os.mkfifo(path)
                elif kind == "symlink":
                    target = self.root / "other.json"
                    target.write_text(json.dumps({"schema": "symphony-release-flow/v1", "observedAt": NOW, "queuedRuns": 0}))
                    path.symlink_to(target)
                else:
                    path.write_bytes(b" " * 65537)
                out = self.snapshot()
                self.assertTrue(out["allowed"])
                self.assertFalse(out["known"])
                self.assertIn("ci", out["unknown"])

    def test_malformed_ledger_subshapes_are_unknown(self):
        original = json.loads(json.dumps(self.state))
        for changes in ({"buckets": []}, {"buckets": {"core": 42}}, {"breaker": []}, {"breaker": "unreadable"}):
            with self.subTest(changes=changes):
                self.store.transact("github", lambda ledger: ledger["credentials"].update({self.credential: {**original, **changes}}))
                out = self.snapshot()
                self.assertTrue(out["allowed"])
                if "buckets" in changes:
                    self.assertFalse(out["known"])
                    self.assertIn("github:core", out["unknown"])

    def test_file_ledger_requires_the_canonical_schema_and_provider(self):
        from apiclient.store import FileLedgerStore
        store = FileLedgerStore(self.root)
        store.dir.mkdir()
        for schema, provider in (("wrong", "github"), ("jovie-api-ledger/v1", "linear")):
            with self.subTest(schema=schema, provider=provider):
                store.path("github").write_text(json.dumps({"schema": schema, "provider": provider,
                                                          "credentials": {self.credential: self.state}}))
                out = pr_wip.capacity_snapshot(store=store, credential=self.credential, state_dir=self.root, now=NOW)
                self.assertFalse(out["known"])
                self.assertIn("github:core", out["unknown"])

    def test_only_fresh_complete_ci_saturation_blocks(self):
        for queued, oldest in ((400, 1), (1, 15)):
            with self.subTest(queued=queued, oldest=oldest):
                self.flow(queuedRuns=queued, queuedOldestMin=oldest)
                out = self.snapshot()
                self.assertFalse(out["allowed"])
                self.assertIn("ci-runner-backlog", out["blockers"])
        for changes in ({"observedAt": NOW - 901}, {"observedAt": NOW + 1}, {"queuedRuns": None},
                        {"queuedOldestMin": None}, {"schema": "wrong"}):
            with self.subTest(changes=changes):
                self.flow(**{"queuedRuns": 400, "queuedOldestMin": 15, **changes})
                out = self.snapshot()
                self.assertTrue(out["allowed"])
                self.assertFalse(out["known"])
                self.assertIn("ci", out["unknown"])


class CapacityObservation(unittest.TestCase):
    def test_unknown_quota_gets_one_bounded_refresh_on_this_invocation(self):
        unknown = {"allowed": True, "known": False, "unknown": ["github:core", "ci"]}
        with patch.object(pr_wip, "capacity_snapshot", side_effect=[unknown, HEALTHY]), \
                patch("apiclient.run_gh", return_value={"code": 0}) as refresh:
            self.assertEqual(pr_wip.observe_capacity(refresh=True), HEALTHY)
        refresh.assert_called_once()
        args, options = refresh.call_args
        self.assertEqual(args, (["api", "rate_limit"],))
        self.assertEqual((options["priority"], options["max_attempts"], options["max_wait_ms"]), ("repair", 1, 0))
        self.assertTrue(callable(options["run"]), "the single probe uses a time-bounded runner")

    def test_known_exhaustion_and_unknown_ci_do_not_start_quota_probes(self):
        for snapshot in ({"allowed": False, "known": False, "unknown": ["ci"], "reason": "github-quota:core"},
                         {"allowed": True, "known": False, "unknown": ["ci"]}):
            with self.subTest(snapshot=snapshot), patch.object(pr_wip, "capacity_snapshot", return_value=snapshot), \
                    patch("apiclient.run_gh") as refresh:
                self.assertEqual(pr_wip.observe_capacity(refresh=True), snapshot)
                refresh.assert_not_called()

    def test_failed_refresh_never_manufactures_capacity_or_retries(self):
        unknown = {"allowed": True, "known": False, "unknown": ["github:core"]}
        with patch.object(pr_wip, "capacity_snapshot", return_value=dict(unknown)), \
                patch("apiclient.run_gh", return_value={"code": 75}) as refresh:
            out = pr_wip.observe_capacity(refresh=True)
        self.assertFalse(out["known"])
        self.assertEqual(out["refresh"], "unavailable")
        refresh.assert_called_once()


class AdmissionCommand(unittest.TestCase):
    def test_admission_uses_one_capacity_observation_without_spending_a_pr_census(self):
        for capacity, code in ((HEALTHY, 0),
                               ({"allowed": False, "known": True, "reason": "github-quota:core", "blockers": ["github-quota:core"]}, 75)):
            with self.subTest(capacity=capacity), patch.object(pr_wip, "observe_capacity", return_value=capacity) as observe, \
                    patch.object(pr_wip, "fetch_open_prs", side_effect=AssertionError("admission must not read PR count")), \
                    patch.object(pr_wip.time, "time", return_value=NOW), patch("sys.stdout", new_callable=io.StringIO) as output:
                self.assertEqual(pr_wip.main(["admit", "--branch", "tim/payment-correction"]), code)
                decision = json.loads(output.getvalue())
                self.assertEqual(decision["allowed"], capacity["allowed"])
                self.assertEqual(decision["reason"], capacity["reason"])
                observe.assert_called_once_with(refresh=True, priority="default")


class LaneBudget(unittest.TestCase):
    def test_capacity_controls_new_issues_while_wip_is_diagnostic(self):
        import lane_runner as lane
        cap = pr_wip.cap_for("codex", pr_wip.load_policy())
        prs = [pr(n, f"codex/jov-{n}-20261101") for n in range(cap + 4)]
        healthy = lane.new_issue_budget("codex", 3, prs, capacity=HEALTHY)
        self.assertEqual((healthy["allowed"], healthy["wip"], healthy["wipCap"]), (True, cap + 4, cap))
        exhausted = {"allowed": False, "known": True, "reason": "github-quota:core", "blockers": ["github-quota:core"]}
        self.assertFalse(lane.new_issue_budget("codex", 3, prs, capacity=exhausted)["allowed"])
        self.assertEqual(lane.new_issue_budget("codex", 0, prs, capacity=HEALTHY)["reason"], "provider-disabled")

    def test_exhausted_escalated_and_poisoned_prs_remain_diagnostic_exclusions(self):
        parked = [pr(n, "codex/x", labels=(label,)) for n, label in enumerate(("lane-fix-exhausted", "lane-fix-escalating", "queue-poison"), 1)]
        self.assertEqual(pr_wip.admit(parked + [pr(9, "codex/y")], "codex", POLICY)["used"], 1)

    def test_unreadable_inventory_does_not_hide_capacity_decision(self):
        import lane_runner as lane
        exhausted = {"allowed": False, "known": True, "reason": "github-quota:graphql", "blockers": ["github-quota:graphql"]}
        with patch.object(lane, "open_prs_summary", side_effect=RuntimeError("github down")), \
                patch.object(pr_wip, "capacity_snapshot", return_value=exhausted) as snapshot:
            result = lane.read_new_issue_budget("codex", 3)
        self.assertEqual((result["allowed"], result["reason"], result["wip"], result["error"]), (False, "github-quota:graphql", None, None))
        snapshot.assert_called_once()


class AutoscaleCapacityTest(unittest.TestCase):
    """Admission evidence precedence and recovery, independent of PR-count diagnostics."""
    lane = staticmethod(lambda state, name: state["lanes"][name])

    def setUp(self):
        import autoscale
        self.autoscale, self.now = autoscale, 1_800_000_000.0
        self.config = {"mode": "apply", "max": {"codex": 6}, "hostMax": None}
        self.host_sample = {"cpuCount": 16, "load1": 1.0, "memAvailableBytes": 16 * 1024 ** 3,
                            "psi": {"cpuSomeAvg10": 1.0, "memoryFullAvg10": 0.0, "ioFullAvg10": 0.0}}

    def observation(self, **over):
        base = {"doctorFresh": True, "runningByProvider": {"codex": 3}, "eligiblePoolByProvider": {"codex": 50},
                "maintenanceQueueByProvider": {"codex": 20}, "newIssueBudgetByProvider": {"codex": {"capacity": HEALTHY}},
                "cooling": [], "cooldownAt": {}, "rateBankAt": {}, "unhealthy": [], "codexUnleasedAvailable": 2,
                "githubRemaining": 4000, "mergeThroughputFresh": True, "disk": {"admitted": True, "freePct": 40}}
        return {**base, **over}

    def test_stale_proxy_counts_and_historical_merge_dwell_do_not_veto_intake(self):
        seen = self.observation(runningByProvider={"codex": 3}, eligiblePoolByProvider={"codex": 50}, maintenanceQueueByProvider={"codex": 20},
                   openPRCount=315, wipMax=80, quotaDeferredHeads=2,
                   mergeThroughput={"queueDepth": 9, "queueWaitP50Minutes": 45, "mergedPerHour": 9, "openedPerHour": 5, "ejectionRate": 0.0},
                   newIssueBudgetByProvider={"codex": {"reason": "wip-cap"}})
        row = self.lane(self.autoscale.decide(None, seen, self.host_sample, {"codex": 3}, self.config, self.now), "codex")
        self.assertEqual(row["intakeBlockers"], [])
        self.assertGreater(row["intakeEffective"], 3)


    def test_unknown_capacity_allows_existing_base_but_never_growth_and_recovers_on_fresh_evidence(self):
        unknown = {"allowed": True, "known": False, "reason": "capacity-unknown", "unknown": ["ci"]}
        seen = self.observation(runningByProvider={"codex": 3}, eligiblePoolByProvider={"codex": 50}, maintenanceQueueByProvider={"codex": 20},
                   newIssueBudgetByProvider={"codex": {"reason": "capacity-unknown", "capacity": unknown}})
        held = self.autoscale.decide(None, seen, self.host_sample, {"codex": 3}, self.config, self.now)
        row = self.lane(held, "codex")
        self.assertEqual((row["effective"], row["intakeEffective"]), (3, 3))
        self.assertEqual(row["lastReason"], "hold:capacity-unknown")
        self.assertEqual(row["intakeBlockers"], [])
        healthy = self.observation(runningByProvider={"codex": 3}, eligiblePoolByProvider={"codex": 50}, maintenanceQueueByProvider={"codex": 20})
        recovered = self.autoscale.decide(held, healthy, self.host_sample, {"codex": 3}, self.config, self.now + self.autoscale.HOST_SETTLE_S)
        self.assertGreater(self.lane(recovered, "codex")["intakeEffective"], 3)


    def test_fresh_global_capacity_supersedes_cached_provider_and_scalar_proxies(self):
        healthy = {"allowed": True, "known": True, "reason": "within-capacity", "blockers": [], "observedAt": self.now,
                   "ci": {"known": True, "queuedRuns": 0, "oldestMin": None}}
        for old in ({"reason": "wip-cap"},
                    {"reason": "capacity-unknown", "capacity": {"allowed": True, "known": False}},
                    {"reason": "github-quota:core", "capacity": {"allowed": False, "known": True, "blockers": ["github-quota:core"]}}):
            with self.subTest(old=old):
                seen = self.observation(admissionCapacity=healthy, githubRemaining=0, quotaDeferredHeads=3, openPRCount=999,
                           newIssueBudgetByProvider={"codex": old}, runningByProvider={"codex": 3},
                           eligiblePoolByProvider={"codex": 50}, maintenanceQueueByProvider={"codex": 20})
                row = self.lane(self.autoscale.decide(None, seen, self.host_sample, {"codex": 3}, self.config, self.now), "codex")
                self.assertGreater(row["intakeEffective"], 3)
                self.assertEqual(row["intakeBlockers"], [])


    def test_global_capacity_unknown_does_not_trust_positive_legacy_scalar_or_deadlock_recovery(self):
        unknown = {"allowed": True, "known": False, "reason": "capacity-unknown", "unknown": ["github:core", "ci"]}
        seen = self.observation(admissionCapacity=unknown, githubRemaining=4000, runningByProvider={"codex": 3},
                   eligiblePoolByProvider={"codex": 50}, maintenanceQueueByProvider={"codex": 20})
        row = self.lane(self.autoscale.decide(None, seen, self.host_sample, {"codex": 3}, self.config, self.now), "codex")
        self.assertEqual((row["effective"], row["intakeEffective"]), (3, 3))
        self.assertEqual(row["lastReason"], "hold:capacity-unknown")


    def test_global_real_zero_blocks_intake_without_eliminating_recovery(self):
        zero = {"allowed": False, "known": True, "reason": "github-quota:core", "blockers": ["github-quota:core"], "retryAt": self.now + 60}
        seen = self.observation(admissionCapacity=zero, githubRemaining=4000, runningByProvider={"codex": 3},
                   eligiblePoolByProvider={"codex": 50}, maintenanceQueueByProvider={"codex": 20})
        row = self.lane(self.autoscale.decide(None, seen, self.host_sample, {"codex": 3}, self.config, self.now), "codex")
        self.assertEqual(row["intakeEffective"], 0)
        self.assertIn("github-quota:core", row["intakeBlockers"])
        self.assertGreater(row["effective"], 0)


class CappedRepairOrderTest(unittest.TestCase):
    """A producer at its WIP cap has its stuck PRs repaired before older PRs of other producers."""

    def dirty(self, number, branch):
        return {"number": number, "headRefName": branch, "headRefOid": f"{number:040d}", "isDraft": True,
                "mergeStateStatus": "DIRTY", "labels": [], "statusCheckRollup": []}

    def test_capped_producer_dirty_prs_go_before_older_prs(self):
        import lane_runner as lane  # noqa: PLC0415
        prs = [self.dirty(100, "opus/old"), self.dirty(200, "codex/a"), self.dirty(201, "codex/b")]
        capped = pr_wip.capped_producers(prs, POLICY)
        self.assertEqual(capped, frozenset({"codex"}))
        self.assertEqual(lane.red_pr(prs, {}, {}, capped)["number"], 200)
        self.assertEqual(lane.red_pr(prs, {}, {})["number"], 100, "no pressure keeps oldest first")

    def test_unknown_inventory_has_no_capped_producers(self):
        self.assertEqual(pr_wip.capped_producers(None, POLICY), frozenset())


if __name__ == "__main__":
    unittest.main()
