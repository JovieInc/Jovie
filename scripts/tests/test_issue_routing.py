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

    def test_standard_work_goes_to_free_devin_first_then_subsidized_then_sonnet(self):
        self.assertEqual(chosen(self.route(issue())), ("devin", "swe-2-medium"))
        self.assertEqual(chosen(self.route(issue(), availability=availability({"devin"}))),
                         ("hyperagent", "z-ai/glm-5.3"))
        decision = self.route(issue(), availability=availability({"devin", "hyperagent"}))
        self.assertEqual(chosen(decision), ("claude", "claude-sonnet-5-5"))
        self.assertIn("cheaper skipped: devin/swe-2-medium=down, hyperagent/z-ai/glm-5.3=down", decision["rationale"])

    def test_bounded_work_takes_the_cheapest_lane(self):
        decision = self.route(issue(labels=["mechanical"]))
        self.assertEqual(decision["required"], "bounded")
        self.assertEqual(chosen(decision), ("devin", "swe-2-medium"))

    def test_frontier_goes_to_opus_then_codex_as_claude_quota_fills(self):
        work = issue(title="Production controller rebinds superseded generations")
        decision = self.route(work)
        self.assertEqual(chosen(decision), ("claude", "claude-opus-5-5"))
        self.assertIn("below floor:", decision["rationale"])
        self.assertIn("devin/swe-2-medium", decision["rationale"])
        busy = self.route(work, availability=availability(pressure={"claude": 0.5}))
        self.assertEqual(chosen(busy), ("codex", "codex-default"))
        self.assertEqual(busy["chosen"]["effectiveCost"], 3.5)

    def test_frontier_never_falls_to_a_cheaper_lane(self):
        decision = self.route(issue(title="Merge queue admission"), availability=availability({"claude", "codex"}))
        self.assertIsNone(decision["chosen"])
        self.assertIn("held, never downgraded", decision["rationale"])
        self.assertEqual({row["lane"] for row in decision["candidates"]}, {"claude", "codex"})

    def test_no_enabled_route_for_the_floor_is_held(self):
        only_cheap = {"devin": PROVIDERS["devin"]}
        decision = remediation.route_issue(issue(title="Merge queue"), only_cheap, POLICY, availability())
        self.assertIsNone(decision["chosen"])
        self.assertIn("no enabled route", decision["rationale"])

    def test_explicit_route_label_pins_lane_and_model_above_the_floor(self):
        self.assertEqual(chosen(self.route(issue(labels=["route:claude:opus"]))), ("claude", "claude-opus-5-5"))
        self.assertEqual(chosen(self.route(issue(labels=["claude"]))), ("claude", "claude-sonnet-5-5"))
        pinned = self.route(issue(title="Merge queue stalls", labels=["devin"]))
        self.assertEqual(chosen(pinned), ("claude", "claude-opus-5-5"))
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
        router = lane.issue_router(self.host, "claude", PROVIDERS, POLICY)
        frontier = lane_issue("JOV-9", "Staging controller blocks every authorization")
        self.assertIsNone(lane.admission_rejection(frontier, {}, time.time(), frozenset(), "claude", router))
        self.assertEqual(lane.admission_rejection(lane_issue("JOV-10"), {}, time.time(), frozenset(), "claude",
                                                  router), "routed:devin")
        decision = router.decisions["JOV-9"]
        self.assertEqual(decision["chosen"]["model"], "claude-opus-5-5")
        lane.log_route(self.host, "claude", decision)
        logged = json.loads((self.host.state / "runs" / "routing.jsonl").read_text().splitlines()[0])
        self.assertEqual(logged["claimedBy"], "claude")
        self.assertEqual(logged["schema"], "jovie-lane-route/v1")
        self.assertIn("effective cost", logged["rationale"])

    def test_sensitive_issue_is_routed_to_codex_only(self):
        with patch.dict(os.environ, {"LANES_SLOTS_CODEX": "3"}):
            router = lane.issue_router(self.host, "codex", PROVIDERS, POLICY)
            sensitive = lane_issue("JOV-11", "Fix login copy", labels=["area:auth"])
            self.assertEqual(router(sensitive)["chosen"]["lane"], "codex")

    def test_registry_without_routes_keeps_first_come_admission(self):
        self.assertIsNone(lane.issue_router(self.host, "devin", {"devin": {"label": "devin"}}, POLICY))


if __name__ == "__main__":
    unittest.main()


# ---------------------------------------------------------------- pool feed (fleet utilization)

import pool_feed  # noqa: E402

STRETCH = json.loads((ROOT / "scripts/tests/fixtures/pool-feed-idle-stretch-2026-11-08.json").read_text())


def replay_router(replay, down=(), why=None):
    """The real router over the real provider table, with the replayed availability view."""
    down, why = set(replay["down"]) | set(down), why or {}

    def seen(name, _route):
        if name in down:
            return {"ok": False, "why": why.get(name, "down"), "pressure": 0}
        return {"ok": True, "why": "ok", "pressure": 0, "paceAdjust": replay["paceAdjust"].get(name, 0)}

    decisions = {}

    def route(item):
        if item.identifier not in decisions:
            decisions[item.identifier] = remediation.route_issue(
                {"identifier": item.identifier, "title": item.title, "description": item.description,
                 "labels": item.labels}, PROVIDERS, POLICY, seen)
        return decisions[item.identifier]

    route.decisions = decisions
    return route


def backlog(count):
    return [lane_issue(f"JOV-{20000 + index}", title=f"Tab indicator collapses {index}") for index in range(count)]


class PoolFeedReplayTest(unittest.TestCase):
    """Replays the 2026-11-08 Gem stretch: 251 compatible issues, hyperagent at 0/4 workers."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = Path(self.tmp.name)
        self.replay = STRETCH["replay"]
        self.pool = backlog(self.replay["backlog"])
        self.now = 1_800_000_000.0

    def fed(self, name, free, router=None, idle_at=None, order=None, env=None):
        return pool_feed.attach(router or replay_router(self.replay), state=self.state, lane=name,
                                free=lambda other: free.get(other, 0), idle_at=idle_at, order=order,
                                env=env or {}, now=self.now)

    def test_recorded_stretch_one_free_seat_idled_every_other_pool(self):
        # Before: the router's single choice per issue. Grok's one free seat holds all 251 issues, so the
        # hyperagent worker finds nothing and leaves as none-eligible, exactly as the doctor recorded.
        raw = replay_router(self.replay)
        self.assertIsNone(lane.pick_issue(self.pool, {}, now=self.now, provider="hyperagent", route=raw))
        self.assertEqual({lane.admission_rejection(item, {}, self.now, frozenset(), "hyperagent", raw)
                          for item in self.pool}, {"routed:grok"})
        self.assertTrue(any("0/4 workers" in row["text"] for row in STRETCH["recorded"]))

    def test_feed_fills_every_free_seat_in_the_routers_expiry_order_within_each_cap(self):
        free = dict(self.replay["freeSeats"])
        pool, claimed = list(self.pool), []
        # One worker pass per free seat, cheapest pool first: each claim removes the issue and the seat.
        for name in ("grok", "hyperagent", "hyperagent", "hyperagent", "hyperagent",
                     "claude", "claude", "codex", "codex", "codex"):
            free[name] -= 1  # this worker now holds one of its lane's seats
            router = self.fed(name, free)
            taken = lane.pick_issue(pool, {}, now=self.now, provider=name, route=router)
            self.assertIsNotNone(taken, name)
            decision = router.decisions[taken.identifier]
            self.assertEqual(decision["chosen"]["lane"], name)
            claimed.append((name, taken.identifier, (decision.get("feed") or {}).get("from")))
            pool.remove(taken)
        # Every seat is fed, strictly in backlog order, and each lane got exactly its seat count.
        self.assertEqual([identifier for _, identifier, _ in claimed], [item.identifier for item in self.pool[:10]])
        self.assertEqual({name: sum(1 for row in claimed if row[0] == name) for name in free},
                         self.replay["seats"])
        self.assertEqual(claimed[0][2], None)      # grok was the router's own choice
        self.assertEqual(claimed[1][2], "grok")    # hyperagent took what grok had no seat for
        self.assertEqual(free, {"hyperagent": 0, "grok": 0, "claude": 0, "codex": 0})
        # An eleventh worker has no seat to add: the plan seats nothing beyond the caps.
        plan = pool_feed.plan(pool, replay_router(self.replay), lane="hyperagent", free=free)
        self.assertEqual(plan["take"].identifier, pool[0].identifier)
        self.assertEqual({name: row["fed"] for name, row in plan["pools"].items()},
                         {"hyperagent": 1, "grok": 0, "claude": 0, "codex": 0})

    def test_one_pass_seats_the_backlog_by_cost_then_overflows_and_never_exceeds_free_seats(self):
        plan = pool_feed.plan(self.pool, replay_router(self.replay), lane="hyperagent",
                              free={"hyperagent": 3, "grok": 1, "claude": 2, "codex": 3})
        self.assertEqual(plan["take"].identifier, self.pool[1].identifier)
        self.assertEqual(plan["decision"]["feed"], {"from": "grok", "skipped": [{"lane": "grok", "why": "no-free-seat"}]})
        self.assertEqual(plan["decision"]["chosen"]["model"], "z-ai/glm-5.3")
        self.assertEqual({name: (row["freeSeats"], row["fed"], row["reason"]) for name, row in plan["pools"].items()},
                         {"grok": (1, 1, "fed"), "hyperagent": (4, 4, "fed"), "claude": (2, 2, "fed"),
                          "codex": (3, 3, "fed")})
        self.assertEqual(plan["offers"][self.pool[0].identifier], "grok")
        self.assertEqual(plan["offers"][self.pool[5].identifier], "claude")
        self.assertEqual(plan["offers"][self.pool[7].identifier], "codex")

    def test_every_idle_seat_has_a_recorded_reason(self):
        free = {"hyperagent": 3, "grok": 1, "claude": 2, "codex": 3}
        # Two issues only: grok and this worker take them, the rest have nothing left to run.
        router = self.fed("hyperagent", free)
        self.assertEqual(lane.pick_issue(self.pool[:2], {}, now=self.now, provider="hyperagent", route=router),
                         self.pool[1])
        row = pool_feed.status(self.state)["passes"]["hyperagent"]
        self.assertEqual((row["backlog"], row["took"], row["tookFrom"]), (2, self.pool[1].identifier, "grok"))
        self.assertEqual({name: (pool["idle"], pool["reason"]) for name, pool in row["pools"].items()},
                         {"devin": (0, "unavailable:down"), "grok": (0, "fed"),
                          "hyperagent": (3, "backlog-covered-by-earlier-pools"),
                          "claude": (2, "backlog-covered-by-earlier-pools"),
                          "codex": (3, "backlog-covered-by-earlier-pools")})
        # A banked pool and a capped pool keep their seats idle, and the record says which limit.
        capped = replay_router(self.replay, down={"claude", "hyperagent"},
                               why={"claude": "banked:usage-limit", "hyperagent": "window-cap 24/24"})
        router = self.fed("codex", {"hyperagent": 4, "grok": 0, "claude": 2, "codex": 2}, router=capped)
        self.assertEqual(lane.pick_issue(self.pool, {}, now=self.now, provider="codex", route=router), self.pool[0])
        pools = pool_feed.status(self.state)["passes"]["codex"]["pools"]
        self.assertEqual(pools["claude"], {"freeSeats": 2, "fed": 0, "idle": 2, "reason": "unavailable:banked:usage-limit"})
        self.assertEqual(pools["hyperagent"]["reason"], "unavailable:window-cap 24/24")
        self.assertEqual(pools["codex"], {"freeSeats": 3, "fed": 3, "idle": 0, "reason": "fed"})
        # Nothing admissible at all.
        router = self.fed("grok", {"hyperagent": 4})
        self.assertIsNone(lane.pick_issue([], {}, now=self.now, provider="grok", route=router))
        self.assertEqual(pool_feed.status(self.state)["passes"]["grok"]["pools"]["grok"]["reason"],
                         "no-admissible-backlog")
        log = (self.state / "runs/pool-feed.jsonl").read_text().splitlines()
        self.assertEqual([json.loads(line)["lane"] for line in log], ["hyperagent", "codex", "grok"])

    def test_gates_hold_through_the_feed(self):
        free = {"hyperagent": 3, "grok": 0, "claude": 2, "codex": 3}
        frontier = lane_issue("JOV-30001", title="Merge queue drops batches")
        pinned = lane_issue("JOV-30002", labels=["route:grok"])
        excluded = lane_issue("JOV-30003", labels=["hold"])
        epic = lane_issue("JOV-30004", labels=["type:epic"])
        failed = lane_issue("JOV-30005")
        # Frontier work is never downgraded, a pin is never overridden, and label, failure and
        # in-flight admission still run before the feed sees an issue.
        failures = {"JOV-30005": {"count": 99, "at": self.now}}
        for name in ("hyperagent", "claude"):
            picked = lane.pick_issue([frontier, pinned, excluded, failed], failures, now=self.now, provider=name,
                                     in_flight=frozenset(), route=self.fed(name, free))
            self.assertEqual(getattr(picked, "identifier", None), "JOV-30001" if name == "claude" else None, name)
        self.assertEqual(self.fed("claude", free).feed([frontier]), frontier)
        self.assertEqual(replay_router(self.replay)(frontier)["chosen"]["capability"], "frontier")
        held = replay_router(self.replay, down={"claude", "codex"})
        self.assertIsNone(lane.pick_issue([frontier], {}, now=self.now, provider="hyperagent",
                                          route=self.fed("hyperagent", free, router=held)))
        self.assertEqual(pool_feed.status(self.state)["passes"]["hyperagent"]["held"], {"route-held:frontier": 1})
        self.assertEqual(lane.admission_rejection(epic, {}, self.now, frozenset(), "hyperagent", None),
                         "epic-local-lanes-only")
        self.assertIn("in-flight-pr", {lane.admission_rejection(failed, {}, self.now, frozenset({"jov-30005"}),
                                                                "hyperagent", None)})

    def test_a_pool_that_idled_after_its_offer_hands_the_work_on(self):
        free = {"hyperagent": 0, "grok": 1, "claude": 0, "codex": 0}
        idle = {}
        router = self.fed("hyperagent", free, idle_at=lambda: idle)
        one = self.pool[:1]
        # Grok has the free seat: the issue is offered to grok and this worker leaves it.
        self.assertIsNone(lane.pick_issue(one, {}, now=self.now, provider="hyperagent", route=router))
        offered = json.loads((self.state / "pool-feed.json").read_text())["offers"]
        self.assertEqual(offered, {one[0].identifier: {"lane": "grok", "at": "2027-01-15T08:00:00Z"}})
        # Still offered, grok has not idled since: it stays grok's, and the offer keeps its first time.
        self.now += 60
        idle["grok"] = "2027-01-15T07:59:00Z"
        self.assertIsNone(lane.pick_issue(one, {}, now=self.now, provider="hyperagent",
                                          route=self.fed("hyperagent", free, idle_at=lambda: idle)))
        self.assertEqual(json.loads((self.state / "pool-feed.json").read_text())["offers"], offered)
        # Grok's worker reached the claim scan after the offer and left without it: the next pool takes it.
        idle["grok"] = "2027-01-15T08:00:30Z"
        router = self.fed("hyperagent", free, idle_at=lambda: idle)
        self.assertEqual(lane.pick_issue(one, {}, now=self.now, provider="hyperagent", route=router), one[0])
        self.assertEqual(router.decisions[one[0].identifier]["feed"],
                         {"from": "grok", "skipped": [{"lane": "grok", "why": "declined"}]})
        self.assertEqual(pool_feed.status(self.state)["passes"]["hyperagent"]["pools"]["grok"]["reason"],
                         "pool-declined-its-offers")
        self.assertEqual(json.loads((self.state / "pool-feed.json").read_text())["offers"], offered)
        # The issue left the backlog: its offer is dropped.
        self.fed("hyperagent", free).feed([])
        self.assertEqual(json.loads((self.state / "pool-feed.json").read_text())["offers"], {})

    def test_off_and_observe_modes_keep_the_old_claim(self):
        free = dict(self.replay["freeSeats"])
        raw = replay_router(self.replay)
        self.assertIs(self.fed("hyperagent", free, router=raw, env={"LANES_POOL_FEED": "0"}), raw)
        self.assertIsNone(pool_feed.attach(None, state=self.state, lane="grok", free=lambda _name: 0))
        watching = self.fed("hyperagent", free, env={"LANES_POOL_FEED": "observe"})
        self.assertIsNone(lane.pick_issue(self.pool, {}, now=self.now, provider="hyperagent", route=watching))
        row = pool_feed.status(self.state)["passes"]["hyperagent"]
        self.assertEqual((row["mode"], row["took"], row["wouldTake"]), ("observe", None, self.pool[1].identifier))
        self.assertEqual(pool_feed.mode({}), "apply")
        self.assertEqual(pool_feed.mode({"LANES_POOL_FEED": "shadow"}), "observe")

    def test_expiry_order_hook_and_bounded_log(self):
        # An expiry selector plugs in as `order`: here claude's window ends first, so it is fed first.
        soonest = lambda rows: sorted(rows, key=lambda row: row["lane"] != "claude")
        plan = pool_feed.plan(self.pool[:1], replay_router(self.replay), lane="hyperagent",
                              free={"claude": 1, "grok": 1}, order=soonest)
        self.assertEqual((plan["take"], plan["offers"]), (None, {self.pool[0].identifier: "claude"}))
        log = self.state / "runs/pool-feed.jsonl"
        log.parent.mkdir(parents=True)
        log.write_text("x" * 10 + "\n" + "y" * (pool_feed.LOG_MAX_BYTES + 1) + "\n{}\n")
        self.fed("grok", {}).feed([])
        self.assertLess(log.stat().st_size, pool_feed.LOG_KEEP_BYTES + 4096)
        self.assertEqual(json.loads(log.read_text().splitlines()[-1])["lane"], "grok")
        with patch.object(pool_feed, "record", side_effect=OSError("disk")):
            self.assertIsNone(self.fed("grok", {}).feed([]))
        with patch("sys.stdout"):
            self.assertEqual(pool_feed.main(["status", str(self.state)]), 0)
        self.assertEqual(pool_feed.main([]), 2)


class FreeIntakeSeatsTest(unittest.TestCase):
    def test_free_seats_count_only_slots_below_the_intake_limit(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"SYMPHONY_AUTOSCALE": "0"}):
            host = lane.Host(state=Path(tmp), linear_env=Path(tmp) / "none")
            spec = {"slots": 3}
            self.assertEqual(lane.free_intake_seats(host, "claude", spec), 3)
            held = lane.Locked(host.state / "slots" / "claude.1.lock", blocking=False)
            try:
                self.assertEqual(lane.free_intake_seats(host, "claude", spec), 2)
                with patch.object(lane.Host, "intake_slots", return_value=1):
                    self.assertEqual(lane.free_intake_seats(host, "claude", spec), 1)
                with patch.object(lane.Host, "intake_slots", return_value=0):
                    self.assertEqual(lane.free_intake_seats(host, "claude", spec), 0)
            finally:
                held.release()
            with patch.object(lane, "issue_router", return_value=replay_router(STRETCH["replay"])), \
                    patch.object(lane, "load_providers", return_value=PROVIDERS):
                (host.state / "worker-idle.json").write_text(json.dumps({"grok": {"at": "2026-11-08T05:00:00Z"}, "x": 1}))
                router = lane.fed_router(host, "hyperagent")
                self.assertTrue(callable(router.feed))
                picked = lane.pick_issue(backlog(3), {}, provider="hyperagent", route=router)
                self.assertIsNotNone(picked)
