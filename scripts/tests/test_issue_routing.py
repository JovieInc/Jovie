"""Cost-aware issue routing across the lanes (JOV-7706)."""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ["LANES_EXECUTION_BACKEND"] = "local-test"
ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("lane_runner", ROOT / "scripts/lanes/lane_runner.py")
lane = importlib.util.module_from_spec(SPEC)
sys.modules["lane_runner"] = lane
SPEC.loader.exec_module(lane)
remediation = lane.remediation

PROVIDERS = json.loads((ROOT / "scripts/lanes/providers.json").read_text())
# Quota numbers (softRuns, windowS) live in ops/registry/capacity.json, not providers.json.
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import capacity_registry  # noqa: E402
capacity_registry.apply_limits(PROVIDERS, capacity_registry.load(ROOT / "ops/registry/capacity.json"))
POLICY = json.loads((ROOT / "scripts/lanes/routing.json").read_text())


def issue(identifier="JOV-1", title="Tab indicator collapses on narrow screens", labels=(), description="body"):
    return {"identifier": identifier, "title": title, "description": description, "labels": list(labels)}


def lane_issue(identifier="JOV-1", title="Tab indicator collapses", labels=(), description="body"):
    return lane.Issue("id-" + identifier, identifier, title, description, 2, "2026-10-01T00:00:00Z", list(labels))


def availability(down=(), pressure=None):
    pressure = pressure or {}
    return lambda name, _route: {"ok": name not in down, "why": "down" if name in down else "ok",
                                 "pressure": pressure.get(name, 0)}


def chosen(decision):
    return decision["chosen"] and (decision["chosen"]["lane"], decision["chosen"]["model"])


class CapabilityFloorTest(unittest.TestCase):
    def test_default_is_standard(self):
        self.assertEqual(remediation.required_capability("Fix tab", "", [], POLICY)["capability"], "standard")
        self.assertEqual(remediation.capability_rank("galaxy-brain"), remediation.capability_rank("standard"))

    def test_protected_surfaces_need_frontier(self):
        for title in ("Production controller never authorizes staging", "Merge queue drops batches",
                      "Model routing ignores quota", "Summer governor reorders P0s",
                      "Add migration for entitlements"):
            need = remediation.required_capability(title, "", [], POLICY)
            self.assertEqual(need["capability"], "frontier", title)
            self.assertTrue(need["reasons"][0].startswith("title:"))
        body = remediation.required_capability("Fix a flake", "touches .github/workflows/staging-controller.yml",
                                               [], POLICY)
        self.assertEqual(body["capability"], "frontier")
        label = remediation.required_capability("Fix", "", ["ws:release-deploy"], POLICY)
        self.assertEqual(label, {"capability": "frontier", "reasons": ["label:ws:release-deploy"]})

    def test_frozen_plan_is_bounded_unless_it_touches_a_protected_surface(self):
        self.assertEqual(remediation.required_capability("Rename helper", "<!-- frozen-plan v1 -->", [], POLICY),
                         {"capability": "bounded", "reasons": ["marker:<!-- frozen-plan"]})
        self.assertEqual(remediation.required_capability("Docs", "", ["ws:docs-changelog"], POLICY)["capability"],
                         "bounded")
        self.assertEqual(remediation.required_capability("Merge queue rename", "<!-- frozen-plan -->", [],
                                                         POLICY)["capability"], "frontier")


class RouteIssueTest(unittest.TestCase):
    def route(self, item, **kwargs):
        return remediation.route_issue(item, PROVIDERS, POLICY, kwargs.pop("availability", availability()), **kwargs)

    def test_standard_work_keeps_eligible_cost_order(self):
        self.assertEqual(chosen(self.route(issue())), ("devin", "swe-2-medium"))
        self.assertEqual(chosen(self.route(issue(), availability=availability({"devin"}))),
                         ("hyperagent", "z-ai/glm-5.3"))
        decision = self.route(issue(), availability=availability({"devin", "hyperagent"}))
        self.assertEqual(chosen(decision), ("grok", "grok-4.7"))
        self.assertIn("cheaper skipped: devin/swe-2-medium=down, hyperagent/z-ai/glm-5.3=down", decision["rationale"])

    def test_bounded_work_takes_the_cheapest_lane(self):
        decision = self.route(issue(labels=["mechanical"]))
        self.assertEqual(decision["required"], "bounded")
        self.assertEqual(chosen(decision), ("devin", "swe-2-medium"))

    def test_frontier_uses_capable_codex_without_spending_protected_subscription(self):
        work = issue(title="Production controller rebinds superseded generations")
        decision = self.route(work)
        self.assertEqual(chosen(decision), ("codex", "codex-default"))
        self.assertIn("below floor:", decision["rationale"])
        self.assertIn("devin/swe-2-medium", decision["rationale"])
        busy = self.route(work, availability=availability(pressure={"claude": 0.5}))
        self.assertEqual(chosen(busy), ("codex", "codex-default"))
        self.assertEqual(busy["chosen"]["effectiveCost"], 3.5)

    def test_frontier_never_falls_to_a_cheaper_lane(self):
        decision = self.route(issue(title="Merge queue admission"), availability=availability({"claude", "codex"}))
        self.assertIsNone(decision["chosen"])
        self.assertIn("held, never downgraded", decision["rationale"])
        self.assertEqual({row["lane"] for row in decision["candidates"]}, {"codex"})

    def test_no_enabled_route_for_the_floor_is_held(self):
        only_cheap = {"devin": PROVIDERS["devin"]}
        decision = remediation.route_issue(issue(title="Merge queue"), only_cheap, POLICY, availability())
        self.assertIsNone(decision["chosen"])
        self.assertIn("no enabled route", decision["rationale"])

    def test_explicit_labels_pin_only_eligible_lanes_above_the_floor(self):
        for labels in (["route:claude:opus"], ["claude"]):
            self.assertEqual(chosen(self.route(issue(labels=labels))), ("devin", "swe-2-medium"))
        self.assertEqual(chosen(self.route(issue(labels=["route:codex"]))), ("codex", "codex-default"))
        pinned = self.route(issue(title="Merge queue stalls", labels=["devin"]))
        self.assertEqual(chosen(pinned), ("codex", "codex-default"))
        self.assertEqual(pinned["notes"], ["explicit-below-floor-or-disabled:devin"])

    def test_sensitive_work_stays_on_the_guarded_lane(self):
        decision = self.route(issue(title="Merge queue"), only_lanes={"codex"})
        self.assertEqual(chosen(decision), ("codex", "codex-default"))

    def test_disabled_and_malformed_routes_are_ignored(self):
        providers = {"a": {"enabled": False, "routes": [{"model": "x", "cost": 0}]},
                     "b": {"routes": ["bad", {"cost": 0}, {"model": "y", "cost": 5}]}}
        rows = remediation.issue_routes(providers)
        self.assertEqual([(row["lane"], row["model"]) for row in rows], [("b", "y")])


class AdmissionTest(unittest.TestCase):
    def test_routed_and_held_rejections(self):
        to_devin = lambda _issue: {"chosen": {"lane": "devin"}, "required": "standard"}
        held = lambda _issue: {"chosen": None, "required": "frontier"}
        item = lane_issue()
        self.assertEqual(lane.admission_rejection(item, {}, time.time(), frozenset(), "claude", to_devin),
                         "routed:devin")
        self.assertIsNone(lane.admission_rejection(item, {}, time.time(), frozenset(), "devin", to_devin))
        self.assertEqual(lane.admission_rejection(item, {}, time.time(), frozenset(), "devin", held),
                         "route-held:frontier")
        self.assertEqual(lane.pick_issue([item], {}, provider="claude", route=to_devin), None)
        self.assertEqual(lane.pick_issue([item], {}, provider="devin", route=to_devin), item)


class AvailabilityTest(unittest.TestCase):
    def setUp(self):
        # Route availability fixtures assume current Free eligibility; expiry is
        # exercised against real Host slots in test_devin_free_policy.py.
        self.free = patch.object(lane.devin_free_policy, 'admission_open', return_value=True)
        self.free.start()
        self.addCleanup(self.free.stop)
        self.tmp = tempfile.TemporaryDirectory()
        self.host = lane.Host(state=Path(self.tmp.name), linear_env=Path(self.tmp.name) / "none")
        self.env = patch.dict(os.environ, {"LANES_SLOTS_CODEX": "0"})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def write(self, name, data):
        (self.host.state / name).parent.mkdir(parents=True, exist_ok=True)
        (self.host.state / name).write_text(json.dumps(data) if not isinstance(data, str) else data)

    def test_self_is_available_others_need_slots_health_and_a_free_seat(self):
        seen = lane.lane_availability(self.host, "claude", PROVIDERS)
        self.assertEqual(seen("claude", {})["ok"], True)
        self.assertEqual(seen("codex", {}), {"ok": False, "why": "no-slots-on-host", "pressure": 0})
        self.assertTrue(seen("devin", {})["ok"])
        held = [lane.Locked(self.host.state / "slots" / f"devin.{index}.lock", blocking=False) for index in range(4)]
        try:
            self.assertEqual(lane.lane_availability(self.host, "claude", PROVIDERS)("devin", {})["why"], "saturated")
        finally:
            for lock in held:
                lock.release()

    def test_cooling_unhealthy_and_blocked_lanes_are_unavailable(self):
        lane.cool_down(self.host, "devin")
        self.write("tick.json", {"unhealthy": ["hyperagent"]})
        self.write("worker-idle.json", {"claude": {"at": lane.now_iso(), "reason": "pr-budget"}})
        seen = lane.lane_availability(self.host, "codex", PROVIDERS)
        self.assertEqual(seen("devin", {})["why"], "cooling")
        self.assertEqual(seen("hyperagent", {})["why"], "unhealthy")
        self.assertEqual(seen("claude", {})["why"], "blocked:pr-budget")

    def test_claude_bank_and_window_pressure(self):
        now = time.time()
        self.write("claude-quota.json", {"runs": [{"at": now - 10, "model": "claude-opus-5-5"}] * 6})
        pressure = lane.quota_pressure(self.host, "claude", PROVIDERS["claude"], now)
        self.assertEqual(pressure["pressure"], 0.5)
        self.write("claude-quota.json", {"bank": {"kind": "usage-limit", "until": now + 60}})
        self.assertEqual(lane.quota_pressure(self.host, "claude", PROVIDERS["claude"], now)["why"],
                         "banked:usage-limit")

    def test_ledger_window_counts_issue_runs_and_enforces_a_cap(self):
        now = time.time()
        rows = [{"provider": "hyperagent", "startedAt": lane.now_iso()},
                {"provider": "hyperagent", "kind": "fix-red", "startedAt": lane.now_iso()},
                {"provider": "devin", "startedAt": lane.now_iso()},
                {"provider": "hyperagent", "startedAt": "2020-01-01T00:00:00+00:00"}]
        self.write("runs/ledger.jsonl", "\n".join(json.dumps(row) for row in rows) + "\nnot json\n")
        spec = {"quota": {"source": "ledger", "windowS": 3600, "softRuns": 4, "maxRuns": 1}}
        self.assertEqual(lane.recent_lane_runs(self.host, "hyperagent", 3600, now), 1)
        self.assertEqual(lane.quota_pressure(self.host, "hyperagent", spec, now)["why"], "window-cap 1/1")
        spec["quota"]["maxRuns"] = 5
        self.assertEqual(lane.quota_pressure(self.host, "hyperagent", spec, now)["pressure"], 0.25)
        self.assertEqual(lane.recent_lane_runs(lane.Host(state=Path(self.tmp.name) / "none"), "x", 1, now), 0)

    def test_codex_pressure_reads_account_status(self):
        fake = type("Codex", (), {"status": staticmethod(lambda now: {"accounts": {
            "a": {"available": False}, "b": {"available": True}}})})
        with patch.object(lane, "codex_lane_module", return_value=fake):
            self.assertEqual(lane.quota_pressure(self.host, "codex", PROVIDERS["codex"], 0)["pressure"], 0.5)
        fake.status = staticmethod(lambda now: {"accounts": {"a": {"available": False,
                                                                  "exhaustedUntil": "2026-10-20T17:00:00Z"}}})
        with patch.object(lane, "codex_lane_module", return_value=fake):
            self.assertEqual(lane.quota_pressure(self.host, "codex", PROVIDERS["codex"], 0)["why"],
                             "all-accounts-banked")
        # Gem 2026-10-20: stale identity evidence, not a bank, made both accounts unavailable.
        fake.status = staticmethod(lambda now: {"accounts": {
            "a": {"available": False, "exhaustedUntil": None}, "b": {"available": False,
                                                                  "exhaustedUntil": "2026-10-20T17:00:00Z"}}})
        with patch.object(lane, "codex_lane_module", return_value=fake):
            verdict = lane.quota_pressure(self.host, "codex", PROVIDERS["codex"], 0)
        self.assertFalse(verdict["ok"])
        self.assertEqual(verdict["why"], "all-accounts-unavailable (1 banked, 1 without fresh capacity evidence)")
        with patch.object(lane, "codex_lane_module", side_effect=OSError):
            self.assertEqual(lane.quota_pressure(self.host, "codex", PROVIDERS["codex"], 0)["why"], "accounts unread")

    def test_router_end_to_end_logs_its_rationale(self):
        # The router reads the wall clock for pool expiry, and Hyperagent's allowance ends at UTC midnight.
        # Pin UTC noon so the protected open-window fixture never races the company pool's reset.
        now = 1_794_484_800.0  # 2026-11-12T12:00:00Z
        with patch.object(lane.time, "time", return_value=now):
            self._router_end_to_end(now)

    def _router_end_to_end(self, now: float):
        router = lane.issue_router(self.host, "codex", PROVIDERS, POLICY)
        frontier = lane_issue("JOV-9", "Staging controller blocks every authorization")
        self.assertIsNone(lane.admission_rejection(frontier, {}, now, frozenset(), "codex", router))
        self.assertEqual(lane.admission_rejection(lane_issue("JOV-10"), {}, now, frozenset(), "codex", router),
                         "routed:hyperagent")
        self.assertNotIn("claude-subscription", [row["pool"] for row in router.decisions["JOV-10"]["pool"]["considered"]])
        self.write("claude-quota.json", {"runs": [{"at": now - 4 * 3600, "model": "claude-opus-5-5"}]})
        opened = lane.issue_router(self.host, "codex", PROVIDERS, POLICY)
        self.assertEqual(lane.admission_rejection(lane_issue("JOV-11"), {}, now, frozenset(), "codex", opened),
                         "routed:hyperagent")
        decision = router.decisions["JOV-9"]
        self.assertEqual(decision["chosen"]["model"], "codex-default")
        lane.log_route(self.host, "codex", decision)
        logged = json.loads((self.host.state / "runs" / "routing.jsonl").read_text().splitlines()[0])
        self.assertEqual(logged["claimedBy"], "codex")
        self.assertEqual(logged["chosen"]["lane"], "codex")

    def test_sensitive_issue_is_routed_to_codex_only(self):
        with patch.dict(os.environ, {"LANES_SLOTS_CODEX": "3"}):
            router = lane.issue_router(self.host, "codex", PROVIDERS, POLICY)
            sensitive = lane_issue("JOV-11", "Fix login copy", labels=["area:auth"])
            self.assertEqual(router(sensitive)["chosen"]["lane"], "codex")

    def test_registry_without_routes_keeps_first_come_admission(self):
        self.assertIsNone(lane.issue_router(self.host, "devin", {"devin": {"label": "devin"}}, POLICY))


class NewAutomatedAssignmentTest(unittest.TestCase):
    def setUp(self):
        self.providers = {
            "codex": {"tier": 1, "accountClass": "chatgpt-oauth", "cmd": ["codex"],
                      "routes": [{"model": "codex-default", "capability": "frontier", "costClass": "subscription", "cost": 3.5}]},
            "personal": {**PROVIDERS["claude"], "model": "claude-opus-5-5", "routes": [
                {"model": "claude-opus-5-5", "alias": "opus", "capability": "frontier", "cost": 3}]},
            "hyperagent": {**PROVIDERS["hyperagent"], "routes": [
                {"model": "claude-opus-5-5", "capability": "frontier", "cost": 3.5}]},
        }
        self.issue = {"identifier": "JOV-1", "title": "controller repair", "labels": [],
                      "description": "", "trusted": True, "requestedBy": "operator"}
        self.policy = {"frontier": {"titlePatterns": ["controller"]}}

    def route(self, **extra):
        return remediation.route_issue({**self.issue, **extra}, self.providers, self.policy,
                                       lambda *_: {"ok": True, "pressure": 0})

    def test_cost_and_untrusted_labels_cannot_authorize_personal_pool(self):
        for labels in ([], ["claude"], ["route:personal:opus"]):
            with self.subTest(labels=labels):
                result = self.route(labels=labels)
                self.assertEqual(result["chosen"]["lane"], "codex")
                self.assertNotIn("personal", {row["lane"] for row in result["candidates"]})
                self.assertEqual(result["assignmentRejected"], [{"lane": "personal",
                                 "why": "protected-subscription-task-authorization-required"}])

    def test_company_route_retains_frontier_floor_when_codex_is_unavailable(self):
        decision = remediation.route_issue(self.issue, self.providers, self.policy,
                                          lambda name, _: {"ok": name != "codex"})
        self.assertEqual((decision["chosen"]["lane"], decision["chosen"]["capability"]),
                         ("hyperagent", "frontier"))
        self.assertEqual(decision["required"], "frontier")

    def test_no_personal_availability_or_expiry_probe(self):
        def available(lane, _route):
            self.assertNotEqual(lane, "personal")
            return {"ok": True, "pressure": 0}
        result = remediation.route_issue(self.issue, self.providers, self.policy,
                                         lane.model_pools.guarded(available, self.providers, lane.model_pools.load()))
        def expiry(lane):
            self.assertNotEqual(lane, "personal")
            return {"expiresAt": None}
        self.assertEqual(lane.model_pools.balanced(result, self.providers, expiry, lane.model_pools.load())["chosen"]["lane"], "codex")

    def test_failover_and_event_dispatch_do_not_use_personal_pool(self):
        original = json.loads(json.dumps(self.providers))
        healthy = lambda name, _spec: name != "personal" or self.fail("personal health probe")
        self.assertIsNone(remediation.route_lane(self.providers, exclude={"codex"}, healthy=healthy))
        self.assertIsNone(remediation.failover(self.providers, "codex", "quota", healthy=healthy)["to"])
        self.assertNotEqual(remediation.event_dispatch_lane(self.providers, [], healthy=healthy)["lane"], "personal")
        self.assertEqual(self.providers, original)

    def test_prior_personal_attempt_keeps_its_escalation_ceiling(self):
        result = remediation.select_escalation_lane(self.providers, {"personal"}, top_rung_used=False)
        self.assertEqual((result["lane"], result["topRung"]), ("codex", True))
        self.assertIsNone(remediation.select_escalation_lane(self.providers, {"personal"}, top_rung_used=True))

    def test_stale_personal_chosen_is_not_reinserted(self):
        codex = {"lane": "codex", "model": "codex-default", "capability": "frontier", "available": True, "pressure": 0, "cost": 3.5}
        old = {"lane": "personal", "model": "claude-opus-5-5", "capability": "frontier", "available": True,
               "pressure": 0, "cost": 3, "alias": "opus", "costClass": "subscription"}
        decision = {"chosen": old, "candidates": [old, codex], "rationale": "old cached decision",
                    "pool": {"chosenPool": "claude-subscription"}}
        routed = lane.model_pools.balanced(decision, self.providers, lambda lane: {"expiresAt": None}, lane.model_pools.load())
        self.assertEqual(routed["chosen"]["lane"], "codex")
        self.assertNotEqual((routed.get("pool") or {}).get("chosenPool"), "claude-subscription")
        self.assertEqual((routed["chosen"]["alias"], routed["chosen"]["cost"], routed["chosen"]["costClass"]),
                         (None, 3.5, "subscription"))
        held = lane.model_pools.balanced({**decision, "candidates": [old]}, self.providers, lambda _: self.fail("expiry probe"), lane.model_pools.load())
        self.assertIsNone(held["chosen"])
        self.assertNotIn("pool", held)

    def test_conflicting_account_class_cannot_hide_personal_executor(self):
        providers = {"renamed": {**self.providers["personal"], "accountClass": "hyperagent-credits"}, "codex": self.providers["codex"]}
        result = remediation.route_issue(self.issue, providers, self.policy, lambda *_: {"ok": True})
        self.assertEqual(result["chosen"]["lane"], "codex")

    def test_expiry_primitive_filters_personal_pool(self):
        chosen, record = lane.model_pools.choose([
            {"lane": "personal", "pool": "claude-subscription", "expiry": {"expiresAt": "2026-11-11T12:01:00Z"}},
            {"lane": "codex", "pool": "codex-subscription", "expiry": {"expiresAt": "2026-11-12T00:00:00Z"}},
        ])
        self.assertEqual(chosen["lane"], "codex")
        self.assertNotIn("claude-subscription", {row["pool"] for row in record["considered"]})

    def test_personal_run_is_refused_before_process_even_without_model(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict("os.environ", {"LANES_STATE": tmp}), \
                patch.object(lane.subprocess, "Popen", side_effect=AssertionError("provider process would start")) as popen:
            for args in (["run"], ["run", "--model", ""], ["run", "--model", "claude-opus-5-5"]):
                with self.subTest(args=args), self.assertRaises(lane.model_pools.ModelPoolRefused):
                    lane.run_agent(["python3", "/release/claude_lane.py", *args], Path(tmp), None, 5)
            popen.assert_not_called()

    def test_personal_run_stays_closed_when_pool_table_is_unreadable(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(lane.model_pools.ModelPoolRefused):
                lane.model_pools.command_guard(["python3", "claude_lane.py", "run"], table={}, state_dir=tmp)

    def test_canonical_pool_and_registry_identity_stay_closed_without_table(self):
        import capacity_registry
        for table in ({}, {"schema": "other"}):
            with self.subTest(table=table), patch.object(lane.model_pools, "load", return_value=table):
                providers = {"renamed": {**self.providers["personal"], "cmd": ["unknown-runner"]},
                             "codex": self.providers["codex"]}
                result = remediation.route_issue(self.issue, providers, self.policy, lambda *_: {"ok": True})
                self.assertEqual(result["chosen"]["lane"], "codex")
                registry = {"providers": [{"id": "anthropic-claude", "usageModel": "subscription-pool"},
                                           {"id": "openai-codex", "usageModel": "capped-quota"}]}
                self.assertEqual([row["provider"] for row in capacity_registry.routing_order(registry, 0)], ["openai-codex"])

    def test_existing_claim_and_attempt_bytes_are_untouched_by_spawn_refusal(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict("os.environ", {"LANES_STATE": tmp}):
            state = Path(tmp)
            originals = {"claims.json": b'{"task":"existing","owner":"personal"}\n',
                         "execution-attempts.json": b'{"task":{"count":2,"status":"active"}}\n'}
            for name, content in originals.items():
                (state / name).write_bytes(content)
            with self.assertRaises(lane.model_pools.ModelPoolRefused):
                lane.model_pools.command_guard(["python3", "claude_lane.py", "run", "--model", "claude-opus-5-5"])
            self.assertEqual({name: (state / name).read_bytes() for name in originals}, originals)

    def test_personal_status_health_and_company_anthropic_remain_usable(self):
        with tempfile.TemporaryDirectory() as tmp:
            for subcommand in ("health", "status"):
                self.assertIsNone(lane.model_pools.command_guard(["python3", "claude_lane.py", subcommand], table=lane.model_pools.load(), state_dir=tmp))
            self.assertEqual(lane.model_pools.command_guard(["hyperagent", "--model", "claude-opus-5-5"], table=lane.model_pools.load(), state_dir=tmp), "hyperagent")
            self.assertIsNone(lane.model_pools.verdict("claude-opus-5-5", "claude-subscription", lane.model_pools.load()))

if __name__ == "__main__":
    unittest.main()
