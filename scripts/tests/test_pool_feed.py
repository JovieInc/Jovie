#!/usr/bin/env python3
"""pool_feed: every allowed pool with a free seat is fed while admissible backlog waits.

Replays the 2026-11-08 Gem idle stretch through the real router and provider table
(scripts/tests/fixtures/pool-feed-idle-stretch-2026-11-08.json). Moved out of test_issue_routing.py,
whose routing helpers it reuses, to keep both files inside the source size budget.
"""
from __future__ import annotations

import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
# Load the routing helpers under a private name so their test classes are not collected twice.
_SPEC = importlib.util.spec_from_file_location("_issue_routing_helpers", ROOT / "scripts/tests/test_issue_routing.py")
routing = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(routing)
lane, remediation, PROVIDERS, POLICY, lane_issue = (routing.lane, routing.remediation, routing.PROVIDERS,
                                                     routing.POLICY, routing.lane_issue)
import pool_feed  # noqa: E402  (scripts/lanes is on sys.path once the helpers load)

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

    def test_a_declined_pool_is_not_offered_the_issue_again_after_it_moves_on(self):
        # Codex's worker plans; codex is last in the router's order, so grok and hyperagent get offers first.
        free = {"hyperagent": 1, "grok": 1, "claude": 0, "codex": 0}
        idle, one = {}, self.pool[:1]
        issue = one[0].identifier

        def offers():
            return json.loads((self.state / "pool-feed.json").read_text())["offers"]

        def codex_pass():
            return lane.pick_issue(one, {}, now=self.now, provider="codex",
                                   route=self.fed("codex", free, idle_at=lambda: idle))

        self.assertIsNone(codex_pass())
        self.assertEqual(offers()[issue]["lane"], "grok")
        # Grok idles after its offer: the issue moves to hyperagent, and the row remembers grok passed.
        self.now += 60
        idle["grok"] = "2027-01-15T08:00:30Z"
        self.assertIsNone(codex_pass())
        moved = offers()[issue]
        self.assertEqual(moved, {"lane": "hyperagent", "at": "2027-01-15T08:01:00Z", "declinedBy": ["grok"]})
        # Hyperagent has not idled since. Grok still has its free seat, but it already passed on this
        # issue: the offer stays with hyperagent and keeps its first time (no grok/hyperagent flapping).
        self.now += 60
        self.assertIsNone(codex_pass())
        self.assertEqual(offers()[issue], moved)
        self.assertEqual(pool_feed.declined_offers(offers(), idle), frozenset({(issue, "grok")}))
        # Hyperagent passes too: both are remembered and the asking worker's own seat takes the issue.
        self.now += 60
        idle["hyperagent"] = "2027-01-15T08:02:30Z"
        router = self.fed("codex", free, idle_at=lambda: idle)
        self.assertEqual(lane.pick_issue(one, {}, now=self.now, provider="codex", route=router), one[0])
        self.assertEqual(router.decisions[issue]["feed"]["skipped"],
                         [{"lane": "grok", "why": "declined"}, {"lane": "hyperagent", "why": "declined"},
                          {"lane": "claude", "why": "no-free-seat"}])
        # The remembered passes are bounded and carried only while the issue stays in the backlog.
        many = {issue: {"lane": "claude", "at": "2027-01-15T08:00:00Z",
                        "declinedBy": [f"lane{index}" for index in range(20)]}}
        merged = pool_feed.merge_offers(many, {issue: "codex"}, {issue}, self.now,
                                        declined=frozenset({(issue, "claude")}))
        self.assertEqual(len(merged[issue]["declinedBy"]), pool_feed.DECLINED_MAX)
        self.assertEqual(merged[issue]["declinedBy"][-1], "claude")
        self.assertEqual(pool_feed.merge_offers(many, {}, set(), self.now), {})

    def test_only_an_idle_exit_from_a_scan_that_saw_the_offer_declines_it(self):
        free, one, rows = {"hyperagent": 0, "grok": 1, "claude": 0, "codex": 0}, self.pool[:1], {}

        def hyperagent_pass():
            router = self.fed("hyperagent", free, idle_at=lambda: pool_feed.idle_exits(rows))
            return router, lane.pick_issue(one, {}, now=self.now, provider="hyperagent", route=router)

        self.assertIsNone(hyperagent_pass()[1])  # offered to grok
        # Grok's worker left before scanning (rate limit, unobservable disk, budget gate): not a decline.
        for reason in ("linear-rate-limited", "disk-unobservable", "maintenance-only-idle", "in-flight-unknown"):
            rows["grok"] = {"at": "2027-01-15T08:00:30Z", "reason": reason}
            self.assertIsNone(hyperagent_pass()[1], reason)
            offer = json.loads((self.state / "pool-feed.json").read_text())["offers"][one[0].identifier]
            self.assertEqual(offer, {"lane": "grok", "at": "2027-01-15T08:00:00Z"}, reason)
        # Grok's scan saw the offer and took nothing: that declines it, and the next pool takes it.
        rows["grok"] = {"at": "2027-01-15T08:00:40Z", "reason": "none-eligible"}
        router, picked = hyperagent_pass()
        self.assertEqual(picked, one[0])
        self.assertEqual(router.decisions[one[0].identifier]["feed"]["skipped"], [{"lane": "grok", "why": "declined"}])

    def test_a_fed_decision_carries_the_pool_record_of_the_lane_it_moved_to(self):
        raw = replay_router(self.replay)
        considered = [{"lane": "grok", "model": "grok-4.7", "pool": "grok-subscription", "expiresAt": "2027-01-16T00:00:00Z"},
                      {"lane": "hyperagent", "model": "z-ai/glm-5.3", "pool": "hyperagent", "expiresAt": None}]
        balanced = lambda item: {**raw(item), "pool": {"rule": "earliest-expiry", "chosenPool": "grok-subscription",
                                                       "considered": considered}}
        plan = pool_feed.plan(self.pool[:2], balanced, lane="hyperagent", free={"grok": 1}, providers=PROVIDERS)
        pool = plan["decision"]["pool"]
        self.assertEqual((pool["chosenPool"], pool["considered"][0]["lane"]), ("hyperagent", "hyperagent"))
        self.assertEqual(pool["fedFrom"], {"rule": "earliest-expiry", "chosenPool": "grok-subscription"})
        # A decision the router never balanced gains no pool record.
        unbalanced = pool_feed.plan(self.pool[:2], raw, lane="hyperagent", free={"grok": 1}, providers=PROVIDERS)
        self.assertNotIn("pool", unbalanced["decision"])

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
                # A fed issue runs on the route config of the lane it moved to, not with alias/costClass blanked.
                chosen = router.decisions[picked.identifier]["chosen"]
                self.assertEqual((chosen["lane"], chosen["model"], chosen["costClass"], chosen["alias"]),
                                 ("hyperagent", "z-ai/glm-5.3", "subsidized", None))
                plan = pool_feed.plan(backlog(2), replay_router(STRETCH["replay"]), lane="claude",
                                      free={"grok": 1}, providers=PROVIDERS)
                self.assertEqual({key: plan["decision"]["chosen"][key] for key in ("lane", "alias", "costClass")},
                                 {"lane": "claude", "alias": "sonnet", "costClass": "subscription"})


if __name__ == "__main__":
    unittest.main()
