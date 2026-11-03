"""Lanes read caps and policies from ops/registry/capacity.json; live reads feed the registry (hermetic)."""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))


def load(name, register=True):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/lanes/{name}.py")
    module = importlib.util.module_from_spec(spec)
    if register:  # other suites patch hyperagent_lane through sys.modules; keep theirs
        sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


CR = load("capacity_registry")
CL = load("capacity_live")
CM = load("capacity_metrics")
CP = load("capacity_pricing")
CW = load("capacity_watch")
HA = load("hyperagent_lane", register=False)
NOW = datetime(2026, 10, 25, 2, 0, tzinfo=timezone.utc).timestamp()
REGISTRY = json.loads((ROOT / "ops/registry/capacity.json").read_text())

GROK_SCREEN = """
  │  Context usage  Usage limit  Session info                                               │
  │  Weekly limit (SuperGrok Heavy)                                                         │
  │                                                                                         │
  │  ███████████████████░░░░░░░░░░░  62%                                                    │
  │  Resets: October 26, 21:01                                                              │
"""


def ledger_row(digest, remaining, resets, observed="2026-10-25T01:00:00Z"):
    return {"subscriptionBinding": {"emailSha256": digest + "0" * (64 - len(digest))},
            "capacityLease": {"sources": {"capacity": {"observedAt": observed}},
                              "usableCapacityRemaining": {"primary": {
                                  "remainingPercent": remaining, "resetsAt": resets, "windowDurationMins": 10080}}}}


class LaneReadsRegistry(unittest.TestCase):
    def test_apply_limits_overlays_only_quota_lanes(self):
        providers = {"hyperagent": {"quota": {"source": "ledger"}}, "codex": {"slots": 3}, "grok": {"quota": {"source": "x"}}}
        CR.apply_limits(providers, REGISTRY)
        self.assertEqual(providers["hyperagent"]["quota"], {"source": "ledger", "softRuns": 24, "windowS": 86400})
        self.assertNotIn("quota", providers["codex"])
        self.assertEqual(providers["grok"]["quota"], {"source": "x"})

    def test_lane_runner_providers_carry_registry_numbers_not_constants(self):
        shipped = json.loads((ROOT / "scripts/lanes/providers.json").read_text())
        for lane in ("hyperagent", "claude"):
            self.assertNotIn("softRuns", shipped[lane]["quota"])
            self.assertNotIn("windowS", shipped[lane]["quota"])
        loaded = CR.apply_limits(shipped, REGISTRY)
        self.assertEqual(loaded["claude"]["quota"]["softRuns"], 12)
        self.assertEqual(loaded["claude"]["quota"]["windowS"], 18000)

    def test_a_lane_decision_changes_when_the_registry_changes(self):
        import lane_runner as lane
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            (state / "runs").mkdir()
            rows = [{"provider": "hyperagent", "startedAt": datetime.fromtimestamp(NOW - 60, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")} for _ in range(12)]
            (state / "runs/ledger.jsonl").write_text("\n".join(json.dumps(r) for r in rows) + "\n")
            host = SimpleNamespace(state=state)
            spec = lambda registry: lane.load_providers(registry=registry)["hyperagent"]  # noqa: E731
            half = lane.quota_pressure(host, "hyperagent", spec(REGISTRY), NOW)
            self.assertEqual(half["pressure"], 0.5)
            self.assertEqual(half["why"], "window 12/24")
            tighter = json.loads(json.dumps(REGISTRY))
            next(p for p in tighter["providers"] if p["lane"] == "hyperagent")["limits"].update(softRuns=12, maxRuns=12)
            held = lane.quota_pressure(host, "hyperagent", spec(tighter), NOW)
            self.assertFalse(held["ok"])
            self.assertEqual(held["why"], "window-cap 12/12")

    def test_missing_registry_changes_nothing_and_never_raises(self):
        with patch.dict(os.environ, {"CAPACITY_REGISTRY": "/nonexistent/capacity.json"}):
            self.assertEqual(CR.load(), {})
        providers = {"hyperagent": {"quota": {"source": "ledger"}}}
        self.assertEqual(CR.apply_limits(providers, {}), {"hyperagent": {"quota": {"source": "ledger"}}})

    def test_hyperagent_attestation_cannot_exceed_the_registry_cap(self):
        spec = json.loads((ROOT / "scripts/lanes/providers.json").read_text())["hyperagent"]
        agents = {"agents": [{"id": spec["agentId"], "name": spec["agentName"], "executionMode": "auto"}]}
        call = lambda name, args: agents  # noqa: E731
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "attestation.json"
            base = {"agentId": spec["agentId"], "model": spec["model"], "repository": HA.REPO,
                    "currentInstructions": True, "allInCap": True, "balanceUsd": 4674.34,
                    "expiresAt": NOW + 86400}
            path.write_text(json.dumps({**base, "maxCostUsd": 10.0}))
            proof, reason = HA.refresh_proof(spec, call, NOW, path, REGISTRY)
            self.assertIsNone(reason)
            self.assertEqual(proof["maxCostUsd"], 10.0)
            path.write_text(json.dumps({**base, "maxCostUsd": 25.0}))
            proof, reason = HA.refresh_proof(spec, call, NOW, path, REGISTRY)
            self.assertEqual((proof, reason), (None, "owner-attestation-exceeds-registry-cap"))


def write_live(state: Path, rows: dict) -> None:
    (state / "capacity-live.json").write_text(json.dumps({"accounts": rows}))


def grok_row(used=63, observed=NOW - 60):
    return {"xai-grok/supergrok-heavy": {"quota": {"usedPercent": used, "windowMins": 10080, "resetsAt": "2026-10-26T21:01:00Z",
                                                  "observedAt": CL._iso(observed), "live": "grok-usage"}}}


def codex_rows(current, jovie, lyb, observed=NOW - 60):
    def row(used):
        return {"quota": {"usedPercent": used, "windowMins": 10080, "resetsAt": "2026-10-30T17:41:00Z",
                          "observedAt": CL._iso(observed), "live": "codex-ledger"}}
    return {"openai-codex/current-login": row(current), "openai-codex/jovie-pro": row(jovie), "openai-codex/lyb-pro": row(lyb)}


class PaceRouting(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def test_use_or_lose_quota_behind_pace_is_nearly_free_until_caught_up(self):
        write_live(self.state, grok_row(63))
        behind = CR.pace_adjust(REGISTRY, self.state, "grok", NOW)
        self.assertEqual(behind["adjust"], CR.PACE_FREE_FLOOR)
        self.assertIn("behind-pace", behind["why"])
        write_live(self.state, grok_row(72))
        self.assertEqual(CR.pace_adjust(REGISTRY, self.state, "grok", NOW)["adjust"], 0.0)

    def test_shared_pool_ahead_of_pace_costs_more_and_never_gets_a_discount(self):
        write_live(self.state, codex_rows(22, 16, 57))
        ahead = CR.pace_adjust(REGISTRY, self.state, "codex", NOW)
        self.assertGreater(ahead["adjust"], 0)
        self.assertLessEqual(ahead["adjust"], CR.PACE_AHEAD_CAP)
        write_live(self.state, codex_rows(2, 2, 2))
        self.assertEqual(CR.pace_adjust(REGISTRY, self.state, "codex", NOW)["adjust"], 0.0)

    def test_only_fresh_live_readings_count_never_the_registry_snapshot(self):
        self.assertEqual(CR.pace_adjust(REGISTRY, self.state, "grok", NOW)["why"], "no-fresh-live-reading")
        write_live(self.state, grok_row(63, observed=NOW - 3 * 3600))
        self.assertEqual(CR.pace_adjust(REGISTRY, self.state, "grok", NOW)["adjust"], 0.0)
        self.assertEqual(CR.pace_adjust(REGISTRY, self.state, "claude", NOW)["why"], "no-pace-policy")

    def test_a_lapsed_account_never_counts(self):
        registry = json.loads(json.dumps(REGISTRY))
        write_live(self.state, {**codex_rows(22, 16, 57), "openai-codex/tim-jov-ie": {"quota": {
            "usedPercent": 100, "windowMins": 10080, "resetsAt": "2026-10-30T17:41:00Z", "observedAt": CL._iso(NOW - 60)}}})
        self.assertNotIn("tim-jov-ie", CR.live_deltas(registry, self.state, "openai-codex", NOW))

    def test_routing_shifts_standard_work_to_grok_while_it_is_behind_pace(self):
        import lane_runner as lane
        import remediation
        providers = lane.load_providers(registry=REGISTRY)
        policy = json.loads((ROOT / "scripts/lanes/routing.json").read_text())
        host = SimpleNamespace(state=self.state)
        issue = {"identifier": "JOV-1", "title": "Fix the thing", "description": "", "labels": []}

        def decide():
            availability = lambda name, _route: lane.quota_pressure(host, name, providers[name], NOW)  # noqa: E731
            return remediation.route_issue(issue, providers, policy, availability, only_lanes={"grok", "hyperagent"})

        self.assertEqual(decide()["chosen"]["lane"], "hyperagent")
        write_live(self.state, grok_row(63))
        shifted = decide()
        self.assertEqual(shifted["chosen"]["lane"], "grok")
        self.assertEqual(shifted["chosen"]["paceAdjust"], CR.PACE_FREE_FLOOR)
        self.assertLess(shifted["chosen"]["effectiveCost"], 1)
        write_live(self.state, grok_row(80))
        self.assertEqual(decide()["chosen"]["lane"], "hyperagent")

    def test_codex_leases_the_account_behind_pace_and_backs_off_the_one_ahead(self):
        CX = load("codex_lane", register=False)
        state = {n: {"lastUsed": t} for n, t in (("current-login", 3), ("jovie-pro", 2), ("lyb-pro", 1))}
        with patch.object(CX, "available", return_value=True), patch.object(CX, "reverify_auth_bank", side_effect=lambda s, n: s), \
                patch.object(CX, "lease", side_effect=lambda name: name):
            names = ["current-login", "jovie-pro", "lyb-pro"]
            self.assertEqual(CX.pick(state, NOW, names, deltas={})[0], "lyb-pro")  # plain LRU
            self.assertEqual(CX.pick(state, NOW, names, deltas={"lyb-pro": 38, "jovie-pro": -3, "current-login": 3})[0], "jovie-pro")
            self.assertEqual(CX.pick(state, NOW, names, deltas={"lyb-pro": 38, "jovie-pro": 30, "current-login": -25})[0], "current-login")


def lane_row(provider, pr, category, started="2026-10-24T10:00:00Z", repository="JovieInc/Jovie"):
    return {"provider": provider, "pr": str(pr), "repository": repository, "startedAt": started,
            "attribution": {"category": category}}


class CostPerMerge(unittest.TestCase):
    def test_cost_per_created_merge_uses_receipts_and_the_merge_window(self):
        rows = [lane_row("grok", 1, "autonomous-created"), lane_row("grok", 2, "autonomous-created"),
                lane_row("grok", 3, "autonomous-remediation"), lane_row("codex", 4, "autonomous-created"),
                lane_row("grok", 5, "autonomous-created", started="2026-10-01T00:00:00Z"),  # outside the window
                lane_row("grok", 6, "autonomous-created", repository="JovieInc/LogYourBody")]
        merged = {"JovieInc/Jovie#1", "JovieInc/Jovie#3", "JovieInc/Jovie#4", "JovieInc/Jovie#5"}
        out = CM.compute(REGISTRY, rows, merged, {"providers": []}, NOW)
        grok = out["xai-grok"]
        self.assertEqual((grok["prsCreated"], grok["mergedCreated"], grok["mergedRepaired"]), (2, 1, 1))
        self.assertEqual(grok["costUsd"], round(99 / 30.4375 * 7, 2))
        self.assertEqual(grok["costPerMergedUsd"], grok["costUsd"])
        self.assertEqual(out["openai-codex"]["costUsd"], round(600 / 30.4375 * 7, 2))  # lapsed account excluded
        self.assertEqual(out["openai-codex"]["costBasis"], "amortized-plan")

    def test_no_merges_means_no_ratio_not_zero_and_credits_use_the_recorded_burn(self):
        spend = {"providers": [{"id": "hyperagent-credits", "burnPerDayUsd": {"value": 47.6}}]}
        out = CM.compute(REGISTRY, [lane_row("hyperagent", 9, "autonomous-created")], set(), spend, NOW)
        hyper = out["hyperagent"]
        self.assertIsNone(hyper["costPerMergedUsd"])
        self.assertEqual((hyper["costUsd"], hyper["costBasis"]), (333.2, "credit-burn-estimate"))

    def test_agent_started_merges_join_by_trailer_thread_id_or_glm_prefix(self):
        merged_rows = [{"number": 1, "headRefName": "hyperagent/jov-1-abc", "author": {"login": "itstimwhite"}},
                       {"number": 2, "headRefName": "glm/fix-x", "author": {"login": "itstimwhite"}, "body": "Dispatch ID: thread cmvkjd36b01q406adg01gyra4"},
                       {"number": 3, "headRefName": "glm/fix-y", "author": {"login": "itstimwhite"}, "body": "no id"},
                       {"number": 5, "headRefName": "tim/z", "author": {"login": "itstimwhite"}, "body": "Agent-Path: hyperagent/glm-5.3"},
                       {"number": 6, "headRefName": "ops/q", "author": {"login": "itstimwhite"}},
                       {"number": 4, "headRefName": "grok/z", "author": {"login": "app/jovie-bot"}}]
        merged = {f"JovieInc/Jovie#{n}" for n in (1, 2, 3, 4, 5, 6)}
        rows = [lane_row("grok", 4, "autonomous-created")]
        out = CM.compute(REGISTRY, rows, merged, {"providers": []}, NOW, merged_rows=merged_rows)
        hyper = out["hyperagent"]
        self.assertEqual((hyper["mergedUnreceipted"], hyper["mergedAgentProven"], hyper["mergedAgentInferred"]), (1, 2, 1))
        self.assertEqual(hyper["mergedCreated"], 0)
        self.assertEqual(CM.unattributed(rows, merged_rows, {"hyperagent", "grok", "codex"}),
                         {"total": 1, "byBranchPrefix": {"ops/ (itstimwhite)": 1}})

    def test_credit_burn_cost_divides_by_receipted_plus_thread_attributed_merges(self):
        spend = {"providers": [{"id": "hyperagent-credits", "burnPerDayUsd": {"value": 47.6}}]}
        merged_rows = [{"number": n, "headRefName": f"glm/x{n}"} for n in range(10, 79)]  # 69 inferred
        merged = {"JovieInc/Jovie#9"} | {f"JovieInc/Jovie#{r['number']}" for r in merged_rows}
        out = CM.compute(REGISTRY, [lane_row("hyperagent", 9, "autonomous-created")], merged, spend, NOW, merged_rows=merged_rows)
        hyper = out["hyperagent"]
        self.assertEqual((hyper["mergedCreated"], hyper["mergedAgentInferred"]), (1, 69))
        self.assertEqual(hyper["costPerMergedUsd"], round(333.2 / 70, 2))
        self.assertEqual(hyper["costScope"], "all-usage-over-receipted-plus-thread-attributed-merges")

    def test_an_incomplete_merge_window_is_reported_not_counted(self):
        with tempfile.TemporaryDirectory() as tmp:
            incomplete = lambda *a, **k: {"complete": False, "reason": "max_pages_reached", "prs": []}  # noqa: E731
            self.assertEqual(CL.read_metrics(Path(tmp), REGISTRY, NOW, incomplete), {"incomplete": "max_pages_reached"})
            complete = lambda *a, **k: {"complete": True, "prs": [{"number": 1}, {"number": 2}]}  # noqa: E731
            result = CL.read_metrics(Path(tmp), REGISTRY, NOW, complete)
            self.assertEqual(result["mergedInWindow"], 2)

    def test_the_tick_never_waits_for_the_merge_window(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            spawned = []
            self.assertEqual(CL.metrics_overlay(state, REGISTRY, NOW, spawned.append), {})
            self.assertEqual(spawned, [state])
            self.assertEqual(CL.metrics_overlay(state, REGISTRY, NOW + 60, spawned.append).get("startedAt"), CL._iso(NOW))
            self.assertEqual(len(spawned), 1)  # attempt recorded: no respawn every tick
            self.assertEqual(len(CL.metrics_overlay(state, REGISTRY, NOW + CL.METRICS_INTERVAL_S + 1, spawned.append) and spawned), 2)


VECTORS = json.loads((ROOT / "scripts/tests/fixtures/capacity-pricing-vectors.json").read_text())
MODELS = json.loads((ROOT / "scripts/backlog-orchestrator/config/model-registry.json").read_text())
import model_families as MF  # noqa: E402  (the one family registry; no literal model ids here)
LUNA = MF.resolve(REGISTRY, "openai:luna@latest")
LUNA_TASK = {"inputTokens": 1_000_000, "outputTokens": 100_000, "cachedTokens": 0}


def with_quota(usd):
    registry = json.loads(json.dumps(REGISTRY))
    for row in registry["pricing"]["paths"]:
        if row["accessPath"] == "subscription":
            row["usableQuotaApiUsd"] = usd
    return registry


class AccessPathPricing(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        write_live(self.state, codex_rows(22, 16, 57))

    def test_matches_the_shared_vectors_with_the_js_port(self):
        self.assertAlmostEqual(CP.api_list_usd({"in": 0.2, "out": 1.2, "cached": None}, VECTORS["task"]), VECTORS["apiUsd"], places=9)
        for seat in VECTORS["seats"]:
            got = CP.subscription_marginal(VECTORS["apiUsd"], {"usedPercent": seat["usedPercent"], "elapsedPercent": seat["elapsedPercent"],
                                                               "usableQuotaApiUsd": VECTORS["usableQuotaApiUsd"],
                                                               "planWindowUsd": VECTORS["planWindowUsd"], "status": seat.get("status")})
            self.assertAlmostEqual(got["usd"], seat["usd"], places=5, msg=seat["name"])
            self.assertEqual((got["class"], got["routable"]), (seat["class"], seat["routable"]), seat["name"])

    def test_the_same_luna_task_on_a_pro_seat_versus_the_api(self):
        rows = CP.price_model(with_quota(400), MODELS, self.state, LUNA, LUNA_TASK, NOW)
        api = next(r for r in rows if r["accessPath"] == "api")
        seats = {r["account"]: r for r in rows if r["accessPath"] == "subscription"}
        price = next(m for m in MODELS["models"] if m["model"] == LUNA and m["provider"] == "codex")
        expected = price["list_price_in"] + 0.1 * price["list_price_out"]  # 1M input + 100k output tokens
        self.assertAlmostEqual(api["usd"], expected, places=9)
        self.assertEqual(set(seats), {"current-login", "jovie-pro", "lyb-pro"})
        self.assertTrue(all(seat["usd"] < api["usd"] for seat in seats.values()))
        self.assertLess(seats["jovie-pro"]["usd"], seats["current-login"]["usd"])
        self.assertLess(seats["current-login"]["usd"], seats["lyb-pro"]["usd"])
        self.assertEqual(seats["lyb-pro"]["class"], "ahead-of-pace")

    def test_routing_prefers_the_subsidized_seat_with_headroom_and_the_api_when_seats_are_spent(self):
        registry = with_quota(400)
        self.assertEqual(CP.price_model(registry, MODELS, self.state, LUNA, LUNA_TASK, NOW)[0]["accessPath"], "subscription")
        write_live(self.state, codex_rows(100, 100, 100))
        spent = CP.price_model(registry, MODELS, self.state, LUNA, LUNA_TASK, NOW)
        self.assertEqual(spent[0]["accessPath"], "api")
        self.assertTrue(all(not r["routable"] for r in spent if r["accessPath"] == "subscription"))

    def test_without_a_fresh_reading_or_measured_quota_a_seat_is_unknown_not_free_money(self):
        write_live(self.state, {})
        rows = CP.price_model(REGISTRY, MODELS, self.state, LUNA, LUNA_TASK, NOW)
        seat = next(r for r in rows if r["accessPath"] == "subscription")
        self.assertIsNone(seat["usd"])
        self.assertEqual(seat["class"], "unknown")

    def test_the_same_model_on_two_paths_has_two_priced_rows(self):
        glm = [r for r in CP.price_model(REGISTRY, MODELS, self.state, "glm-5.3", LUNA_TASK, NOW)]
        self.assertEqual(sorted(r["accessPath"] for r in glm), ["api", "credits"])
        self.assertLess(next(r for r in glm if r["accessPath"] == "credits")["usd"], next(r for r in glm if r["accessPath"] == "api")["usd"])


class PlannerRole(unittest.TestCase):
    def test_k3_is_the_planner_until_k31_pro_is_confirmed(self):
        self.assertEqual(CR.resolve_role(REGISTRY, "planner")["chosen"]["model"], "moonshotai/kimi-k3")
        watching = {"moonshotai/kimi-k3.1-pro": {"available": False}}
        self.assertEqual(CR.resolve_role(REGISTRY, "planner", watching)["chosen"]["model"], "moonshotai/kimi-k3")
        flipped = CR.resolve_role(REGISTRY, "planner", {"moonshotai/kimi-k3.1-pro": {"available": True}})
        self.assertEqual(flipped["chosen"]["model"], "moonshotai/kimi-k3.1-pro")

    def test_the_watcher_flips_on_a_hyperagent_agent_named_for_the_model(self):
        none = CW.read_watch(REGISTRY, "t", ["GLM 5.3 Developer", "GLM 5.3 Flash Developer"])
        self.assertFalse(none["models"]["moonshotai/kimi-k3.1-pro"]["available"])
        hit = CW.read_watch(REGISTRY, "t", ["GLM 5.3 Developer", "Kimi K3.1 Pro Developer"])
        self.assertTrue(hit["models"]["moonshotai/kimi-k3.1-pro"]["available"])
        self.assertEqual(hit["models"]["moonshotai/kimi-k3.1-pro"]["agent"], "Kimi K3.1 Pro Developer")
        self.assertFalse(CW.read_watch(REGISTRY, "t", None)["models"]["moonshotai/kimi-k3.1-pro"]["available"])  # unreadable is not available
        self.assertEqual(CW.resolve_roles(REGISTRY, hit)["planner"]["chosen"]["model"], "moonshotai/kimi-k3.1-pro")

    def test_the_tick_publishes_roles_for_agents_that_cannot_import_the_registry(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {}, clear=False):
            for key in ("LANES_SELFTEST", "LANES_EXECUTION_BACKEND"):
                os.environ.pop(key, None)
            state = Path(tmp)
            CL.tick(state, now=NOW, registry=REGISTRY, grok=lambda now: None, agents=lambda: ["Kimi K3.1 Pro Developer"])
            roles = json.loads((state / "state" / "roles.json").read_text())
            self.assertEqual(roles["roles"]["planner"]["chosen"]["model"], "moonshotai/kimi-k3.1-pro")
            live = json.loads((state / "capacity-live.json").read_text())
            self.assertTrue(live["watch"]["models"]["moonshotai/kimi-k3.1-pro"]["available"])


class CoordinationRules(unittest.TestCase):
    def test_delegation_rule_for_non_lane_agents(self):
        rule = CR.delegation_rule(REGISTRY, "dots")
        self.assertEqual(rule["usageModel"], "uncapped-own-model")
        self.assertIn("Codex", rule["delegation"])
        self.assertEqual(CR.delegation_rule(REGISTRY, "nobody"), {})

    def test_routing_order_prefers_uncapped_then_under_pace_quota_then_pool(self):
        order = [r["provider"] for r in CR.routing_order(REGISTRY, NOW)]
        self.assertEqual(set(order[:2]), {"dots", "instinct"})
        self.assertLess(order.index("xai-grok"), order.index("openai-codex"))
        self.assertLess(order.index("openai-codex"), order.index("hyperagent"))
        self.assertNotIn("kimi", order)

    def test_live_row_overrides_the_snapshot_only_when_newer(self):
        account = {"quota": {"remainingPercent": 43, "observedAt": "2026-10-25T00:38:35Z"}}
        newer = {"quota": {"remainingPercent": 10, "observedAt": "2026-10-25T01:00:00Z"}}
        older = {"quota": {"remainingPercent": 99, "observedAt": "2026-10-24T01:00:00Z"}}
        self.assertEqual(CR.merged_quota(account, newer)["remainingPercent"], 10)
        self.assertEqual(CR.merged_quota(account, older)["remainingPercent"], 43)

    def test_pace_and_freshness(self):
        quota = {"usedPercent": 63, "windowMins": 10080, "resetsAt": "2026-10-26T21:01:00Z"}
        self.assertEqual(CR.pace_verdict(quota, NOW), "under-burning")
        self.assertEqual(CR.pace_verdict({**quota, "usedPercent": 95}, NOW), "over-burning")
        self.assertEqual(CR.pace_verdict(quota, NOW + 10 * 86400), "reset-passed")
        fact = {"observedAt": "2026-10-25T00:00:00Z", "live": "grok-usage"}
        self.assertEqual(CR.freshness(fact, REGISTRY, NOW), "fresh")
        self.assertEqual(CR.freshness(fact, REGISTRY, NOW + 2 * 86400), "stale")


class LiveReads(unittest.TestCase):
    def test_grok_usage_is_used_percent_with_reset(self):
        parsed = CL.parse_grok_usage(GROK_SCREEN, NOW)
        self.assertEqual(parsed, {"usedPercent": 62, "resetsAt": "2026-10-26T21:01:00Z"})
        self.assertIsNone(CL.parse_grok_usage("no usage here", NOW))

    def test_codex_ledger_matches_by_hash_and_ignores_fixtures(self):
        ledger = {"_ledger": {}, "lyb-pro": ledger_row("7f31f3ffca1c", 41, 1793382060),
                  "fixture": ledger_row("7f31f3ffca1c", 50, 1007200, observed="1970-01-12T13:46:40Z"),
                  "stranger": ledger_row("aaaaaaaaaaaa", 5, 1793382060)}
        rows = CL.read_codex(REGISTRY, ledger)
        self.assertEqual(list(rows), ["openai-codex/lyb-pro"])
        self.assertEqual(rows["openai-codex/lyb-pro"]["quota"]["remainingPercent"], 41)
        self.assertEqual(rows["openai-codex/lyb-pro"]["quota"]["live"], "codex-ledger")

    def test_grok_reader_drives_tmux_and_always_cleans_up(self):
        calls = []

        def run(cmd, **kwargs):
            calls.append(cmd[1])
            return SimpleNamespace(returncode=0, stdout="❯ " + GROK_SCREEN)

        row = CL.read_grok(NOW, run=run, sleep=lambda s: None)
        self.assertEqual(row["quota"]["usedPercent"], 62)
        self.assertEqual(row["quota"]["live"], "grok-usage")
        self.assertEqual(calls[0], "new-session")
        self.assertEqual(calls[-1], "kill-session")
        calls.clear()
        self.assertIsNone(CL.read_grok(NOW, run=lambda cmd, **k: SimpleNamespace(returncode=1, stdout=""), sleep=lambda s: None))

    def test_tick_writes_the_overlay_then_waits_for_the_interval(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {}, clear=False):
            for key in ("LANES_SELFTEST", "LANES_EXECUTION_BACKEND"):
                os.environ.pop(key, None)
            state = Path(tmp)
            (state / "codex-accounts.json").write_text(json.dumps({"lyb-pro": ledger_row("7f31f3ffca1c", 41, 1793382060)}))
            grok = lambda now: {"quota": {"usedPercent": 63, "observedAt": CL._iso(now)}}  # noqa: E731
            first = CL.tick(state, now=NOW, registry=REGISTRY, grok=grok, agents=lambda: [])
            self.assertEqual(first["status"], "written")
            live = json.loads((state / "capacity-live.json").read_text())
            self.assertEqual(sorted(live["accounts"]), ["openai-codex/lyb-pro", "xai-grok/supergrok-heavy"])
            self.assertEqual(CL.tick(state, now=NOW + 60, registry=REGISTRY, grok=grok, agents=lambda: [])["status"], "current")
            self.assertEqual(CL.tick(state, now=NOW + CL.INTERVAL_S + 1, registry=REGISTRY, grok=grok, agents=lambda: [])["status"], "written")
            self.assertEqual(CR.read_live(state)["accounts"]["xai-grok/supergrok-heavy"]["quota"]["usedPercent"], 63)

    def test_quota_windows_feed_the_coordination_burn_plan(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {}, clear=False):
            for key in ("LANES_SELFTEST", "LANES_EXECUTION_BACKEND"):
                os.environ.pop(key, None)
            state = Path(tmp)
            (state / "codex-accounts.json").write_text(json.dumps({"lyb-pro": ledger_row("7f31f3ffca1c", 41, 1793382060, observed="2026-10-25T01:59:00Z")}))
            grok = lambda now: {"quota": {"usedPercent": 63, "resetsAt": "2026-10-26T21:01:00Z", "windowMins": 10080, "observedAt": CL._iso(now), "source": "grok"}}  # noqa: E731
            CL.tick(state, now=NOW, registry=REGISTRY, grok=grok, agents=lambda: [])
            data = json.loads((state / "state" / "quota-windows.json").read_text())
            by_agent = {w["agent"]: w for w in data["windows"]}
            self.assertEqual(set(by_agent), {"openai-codex:current-login", "openai-codex:jovie-pro", "openai-codex:lyb-pro", "xai-grok:supergrok-heavy"})
            lyb = by_agent["openai-codex:lyb-pro"]
            self.assertEqual((lyb["quota"], lyb["used"], lyb["windowS"]), (100, 59, 604800))
            self.assertEqual(by_agent["xai-grok:supergrok-heavy"]["resetAt"], datetime(2026, 10, 26, 21, 1, tzinfo=timezone.utc).timestamp())
            self.assertNotIn("openai-codex:tim-jov-ie", by_agent)

    def test_selftest_never_reads_the_host(self):
        with patch.dict(os.environ, {"LANES_SELFTEST": "1"}):
            self.assertEqual(CL.tick(Path("/nonexistent"), now=NOW)["status"], "selftest-skipped")


if __name__ == "__main__":
    unittest.main()
