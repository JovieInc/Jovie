"""Adaptive slot concurrency for Symphony lanes (SYMPHONY_AUTOSCALE).

Default mode is apply. ``SYMPHONY_AUTOSCALE=0`` is the kill switch.
Run with: python3 -m unittest scripts/tests/test_autoscale.py -v
"""
from __future__ import annotations

import importlib.util
import io
import json
import os
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
NOW = 1_800_000_000.0
GIB = 1024 ** 3


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/lanes/{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


autoscale = load("autoscale")
lane = load("lane_runner")
doctor = load("doctor")


@contextmanager
def env(**updates):
    """Pin autoscale and slot overrides for one test. Other keys stay."""
    with patch.dict(os.environ, updates, clear=False):
        for key in list(os.environ):
            if key.startswith(("SYMPHONY_AUTOSCALE", "LANES_SLOTS_")) and key not in updates:
                os.environ.pop(key, None)
        yield


def config(**over):
    base = {"mode": "apply", "max": {}, "hostMax": None, "intervalS": 1800}
    base.update(over)
    return base


def healthy_obs(**over):
    obs = {
        "doctorFresh": True,
        "eligiblePoolByProvider": {"devin": 8, "codex": 6},
        "newIssueBudgetByProvider": {"devin": {"reason": "within-budget"},
                                     "codex": {"reason": "within-budget"}},
        "maintenanceQueueByProvider": {},
        "runningByProvider": {"devin": 4, "codex": 3},
        "unhealthy": [], "cooling": [], "cooldownAt": {}, "rateBankAt": {},
        "codexUnleasedAvailable": 2,
        "productiveRunRate": {"devin": 0.8, "codex": 0.8},
        "starts": {"devin": 10, "codex": 10},
        "alerts": [], "gateWaitMedianS24h": 100,
        "githubRemaining": 4000, "linearRemaining": 2000, "linearLimit": 2500,
        "linearRateLimitedAt": None,
        "disk": {"admitted": True, "freePct": 40},
    }
    obs.update(over)
    return obs


def healthy_sample(**over):
    sample = {"cpuCount": 16, "load1": 1.0, "memAvailableBytes": 16 * GIB,
              "psi": {"cpuSomeAvg10": 1.0, "memoryFullAvg10": 0.0, "ioFullAvg10": 0.0}}
    sample.update(over)
    return sample


def L(state, name):
    return state["lanes"][name]


def put(state_dir, payload):
    (Path(state_dir) / "autoscale.json").write_text(json.dumps(payload))


def decide(previous, obs, sample, bases, cfg, now):
    return autoscale.decide(previous, obs, sample, bases, cfg, now)


def run_ticks(count, previous, obs, sample, bases, cfg, now, step=60):
    state = previous
    for _ in range(count):
        state = decide(state, obs, sample, bases, cfg, now)
        now += step
    return state, now - step


def pr_row(number, terminal=False):
    return {"number": number, "headRefName": f"codex/jov-{number}-20261002",
            "isDraft": True, "mergeStateStatus": "DIRTY",
            "labels": ["hold"] if terminal else []}


class ModeTest(unittest.TestCase):
    def test_constants_and_default_interval(self):
        self.assertEqual((autoscale.DEFAULT_INTERVAL_S, autoscale.LANE_COOLDOWN_S,
                          autoscale.UP_STREAK_REQUIRED, autoscale.IDLE_STREAK_REQUIRED,
                          autoscale.HOST_COOLDOWN_S), (1800, 1800, 30, 30, 120))
        self.assertEqual((autoscale.streak_ticks(1800), autoscale.streak_ticks(60)), (30, 1))
        self.assertEqual((autoscale.idle_floor(4), autoscale.idle_floor(3), autoscale.idle_floor(0)),
                         (2, 2, 0))

    def test_unset_or_absent_line_is_apply_and_garbage_stays_off(self):
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "missing.env"
            present = Path(tmp) / "autoscale.env"
            self.assertEqual(autoscale.mode(env={}, config=missing), "apply")
            present.write_text("SYMPHONY_AUTOSCALE_MAX_DEVIN=6\n# comment\n")
            self.assertEqual(autoscale.mode(env={}, config=present), "apply")
            loaded = autoscale.load_config(env={}, config=present)
            self.assertEqual((loaded["mode"], loaded["max"]["devin"], loaded["intervalS"]),
                             ("apply", 6, 1800))
            cases = {"off": ("0", "off", "false", "OFF", "False", "maybe", "2", "yes", ""),
                     "observe": ("observe", "shadow"), "apply": ("1", "on", "true", "apply")}
            for want, raws in cases.items():
                for raw in raws:
                    self.assertEqual(autoscale.mode(env={"SYMPHONY_AUTOSCALE": raw}, config=missing),
                                     want, raw)
            present.write_text('SYMPHONY_AUTOSCALE="maybe"\nSYMPHONY_AUTOSCALE_INTERVAL_S=900\n'
                               "SYMPHONY_AUTOSCALE_HOST_MAX=11\nSYMPHONY_AUTOSCALE_MAX_CODEX=5\n")
            self.assertEqual(autoscale.mode(env={}, config=present), "off")
            self.assertEqual(autoscale.mode(env={"SYMPHONY_AUTOSCALE": "observe"}, config=present), "observe")
            fallen = autoscale.load_config(env={"SYMPHONY_AUTOSCALE_INTERVAL_S": "nope",
                                              "SYMPHONY_AUTOSCALE_MAX_CODEX": "0"}, config=present)
            self.assertEqual((fallen["intervalS"], "codex" in fallen["max"], fallen["hostMax"]),
                             (1800, False, 11))
            honored = autoscale.load_config(env={}, config=present)
            self.assertEqual((honored["intervalS"], honored["max"]["codex"], honored["hostMax"]),
                             (900, 5, 11))

    def test_live_unset_env_is_apply_when_the_config_file_is_absent(self):
        with env(), patch.object(Path, "home", return_value=Path("/tmp/jovie-autoscale-no-home")):
            self.assertEqual((autoscale.mode(), autoscale.load_config()["intervalS"]), ("apply", 1800))


class SlotIdentityTest(unittest.TestCase):
    def test_off_kill_switch_matches_base_slots(self):
        with tempfile.TemporaryDirectory() as tmp, env(SYMPHONY_AUTOSCALE="0"):
            state = Path(tmp)
            put(state, {"schema": autoscale.SCHEMA, "observedAt": NOW,
                        "lanes": {"devin": {"effective": 9, "floor": 1, "ceiling": 12},
                                  "codex": {"effective": 9, "floor": 1, "ceiling": 12}}})
            host = lane.Host(state=state)
            self.assertEqual((host.base_slots("devin", 4), host.slots("devin", 4),
                              host.slots("codex", 3), host.base_slots("codex", 3)), (4, 4, 3, 3))

    def test_effective_slots_fail_safe_and_clamp(self):
        with tempfile.TemporaryDirectory() as tmp, env(SYMPHONY_AUTOSCALE="apply"):
            state = Path(tmp)
            self.assertEqual(autoscale.effective_slots(state, "devin", 4, NOW), 4)
            (state / "autoscale.json").write_text("{")
            self.assertEqual(autoscale.effective_slots(state, "devin", 4, NOW), 4)
            put(state, {"schema": "other", "observedAt": NOW, "lanes": {}})
            self.assertEqual(autoscale.effective_slots(state, "devin", 4, NOW), 4)
            fresh = {"schema": autoscale.SCHEMA, "observedAt": NOW - 601,
                     "lanes": {"devin": {"effective": 6, "floor": 1, "ceiling": 8}}}
            put(state, fresh)
            self.assertEqual(autoscale.effective_slots(state, "devin", 4, NOW), 4)
            fresh["observedAt"] = NOW
            put(state, fresh)
            self.assertEqual(autoscale.effective_slots(state, "missing", 4, NOW), 4)
            self.assertEqual(autoscale.effective_slots(state, "devin", 0, NOW), 0)
            fresh["lanes"]["devin"]["effective"] = True
            put(state, fresh)
            self.assertEqual(autoscale.effective_slots(state, "devin", 4, NOW), 4)
            fresh["lanes"]["devin"] = {"effective": 99, "floor": 1, "ceiling": 8}
            put(state, fresh)
            self.assertEqual(autoscale.effective_slots(state, "devin", 4, NOW), 8)
            fresh["lanes"]["devin"] = {"effective": 0, "floor": 1, "ceiling": 8}
            put(state, fresh)
            self.assertEqual(autoscale.effective_slots(state, "devin", 4, NOW), 1)

    def test_observe_records_the_decision_and_slots_stay_on_base(self):
        with tempfile.TemporaryDirectory() as tmp, env(SYMPHONY_AUTOSCALE="observe"):
            state_dir = Path(tmp)
            cfg = config(mode="observe", intervalS=60)
            state = decide(None, healthy_obs(), healthy_sample(), {"devin": 4}, cfg, NOW)
            self.assertEqual(L(state, "devin")["effective"], 5)
            autoscale.write_state(state_dir, state)
            saved = json.loads((state_dir / "autoscale.json").read_text())
            self.assertNotIn("_changed", saved)
            host = lane.Host(state=state_dir)
            self.assertEqual((saved["lanes"]["devin"]["effective"],
                              (state_dir / "autoscale.json").stat().st_mode & 0o777,
                              host.slots("devin", 4),
                              autoscale.effective_slots(state_dir, "devin", 4, NOW)),
                             (5, 0o644, 4, 4))


class IncreaseTest(unittest.TestCase):
    def test_default_cadence_is_thirty_ticks_then_lane_cooldown(self):
        bases = {"devin": 4}
        obs = healthy_obs(runningByProvider={"devin": 4})
        sample = healthy_sample()
        cfg = config()
        state, when = run_ticks(29, None, obs, sample, bases, cfg, NOW)
        self.assertEqual((L(state, "devin")["effective"], L(state, "devin")["lastReason"],
                          L(state, "devin")["upStreak"]), (4, "hold:up-streak", 29))
        state = decide(state, obs, sample, bases, cfg, when + 60)
        self.assertEqual((L(state, "devin")["effective"], L(state, "devin")["lastReason"],
                          L(state, "devin")["upStreak"]), (5, "sustained-demand", 0))
        increased_at = when + 60
        obs["runningByProvider"]["devin"] = 5
        state, when = run_ticks(29, state, obs, sample, bases, cfg, increased_at + 60)
        self.assertEqual((L(state, "devin")["effective"], L(state, "devin")["lastReason"]),
                         (5, "hold:lane-cooldown"))
        state = decide(state, obs, sample, bases, cfg, when + 60)
        self.assertEqual(when + 60 - increased_at, 1800)
        self.assertEqual((L(state, "devin")["effective"], L(state, "devin")["lastReason"]),
                         (6, "sustained-demand"))

    def test_a_broken_streak_restarts(self):
        bases = {"devin": 4}
        obs = healthy_obs(runningByProvider={"devin": 4})
        sample = healthy_sample()
        cfg = config()
        state, when = run_ticks(29, None, obs, sample, bases, cfg, NOW)
        state = decide(state, healthy_obs(unhealthy=["devin"], runningByProvider={"devin": 4}),
                       sample, bases, cfg, when + 60)
        self.assertEqual((L(state, "devin")["upStreak"], L(state, "devin")["effective"]), (0, 4))
        state, when = run_ticks(29, state, obs, sample, bases, cfg, when + 120)
        self.assertEqual(L(state, "devin")["effective"], 4)
        state = decide(state, obs, sample, bases, cfg, when + 60)
        self.assertEqual(L(state, "devin")["effective"], 5)

    def test_one_lane_per_tick_and_the_runner_up_moves_after_host_cooldown(self):
        bases = {"devin": 4, "codex": 3}
        obs = healthy_obs()
        sample = healthy_sample()
        cfg = config()
        state, when = run_ticks(30, None, obs, sample, bases, cfg, NOW)
        self.assertEqual((L(state, "devin")["effective"], L(state, "codex")["effective"],
                          L(state, "codex")["upStreak"], L(state, "codex")["lastReason"]),
                         (5, 3, 30, "hold:one-lane"))
        state = decide(state, obs, sample, bases, cfg, when + 120)
        self.assertEqual((L(state, "codex")["effective"], L(state, "codex")["lastReason"],
                          L(state, "devin")["effective"]), (4, "sustained-demand", 5))

    def test_highest_demand_ratio_wins(self):
        obs = healthy_obs(eligiblePoolByProvider={"devin": 1, "codex": 9})
        state = decide(None, obs, healthy_sample(), {"devin": 4, "codex": 3}, config(intervalS=60), NOW)
        self.assertEqual((L(state, "codex")["effective"], L(state, "devin")["effective"],
                          L(state, "devin")["lastReason"]), (4, 4, "hold:one-lane"))

    def test_interval_override_is_one_tick_and_a_sixty_second_lane_cooldown(self):
        bases = {"devin": 4}
        obs = healthy_obs(runningByProvider={"devin": 4})
        cfg = config(intervalS=60)
        state = decide(None, obs, healthy_sample(), bases, cfg, NOW)
        self.assertEqual(L(state, "devin")["effective"], 5)
        obs["runningByProvider"]["devin"] = 5
        held = decide(state, obs, healthy_sample(), bases, cfg, NOW + 59)
        self.assertEqual((L(held, "devin")["effective"], L(held, "devin")["lastReason"]),
                         (5, "hold:lane-cooldown"))
        cooled = decide(held, obs, healthy_sample(), bases, cfg, NOW + 120)
        self.assertEqual(L(cooled, "devin")["effective"], 6)


class BlockerTest(unittest.TestCase):
    def setUp(self):
        self.cfg = config(intervalS=60)
        self.sample = healthy_sample()
        self.bases = {"devin": 4, "codex": 3}

    def assert_held(self, name, obs, sample=None, bases=None, reason=None):
        state = decide(None, obs, self.sample if sample is None else sample,
                       self.bases if bases is None else bases, self.cfg, NOW)
        self.assertEqual(L(state, name)["effective"],
                         (self.bases if bases is None else bases)[name])
        if reason:
            self.assertEqual(L(state, name)["lastReason"], "hold:" + reason)
            self.assertIn(reason, L(state, name)["blockers"])
        return state

    def test_each_increase_blocker_holds_the_base(self):
        self.assert_held("devin", healthy_obs(
            newIssueBudgetByProvider={"devin": {"reason": "over-budget"},
                                      "codex": {"reason": "within-budget"}},
            maintenanceQueueByProvider={"devin": 4}), reason="over-budget")
        self.assert_held("codex", healthy_obs(
            newIssueBudgetByProvider={"devin": {"reason": "within-budget"},
                                      "codex": {"reason": "terminal-pr-backlog"}},
            eligiblePoolByProvider={"devin": 1, "codex": 40},
            maintenanceQueueByProvider={"codex": 3}), bases={"codex": 3}, reason="terminal-pr-backlog")
        self.assert_held("devin", healthy_obs(eligiblePoolByProvider={"devin": 0, "codex": 0}),
                         bases={"devin": 4}, reason="zero-demand")
        self.assert_held("devin", healthy_obs(unhealthy=["devin"]), bases={"devin": 4}, reason="unhealthy")
        self.assert_held("devin", healthy_obs(cooling=["devin"]), bases={"devin": 4}, reason="cooling")
        self.assert_held("devin", healthy_obs(rateBankAt={"devin": NOW - 600}), bases={"devin": 4},
                         reason="rate-bank")
        self.assert_held("codex", healthy_obs(codexUnleasedAvailable=0), bases={"codex": 3},
                         reason="codex-unleased")
        self.assert_held("devin", healthy_obs(starts={"devin": 5, "codex": 10},
                                              productiveRunRate={"devin": 0.4, "codex": 0.8}),
                         bases={"devin": 4}, reason="low-productive-rate")
        allowed = decide(None, healthy_obs(starts={"devin": 4}, productiveRunRate={"devin": 0.1},
                                           runningByProvider={"devin": 4}),
                         self.sample, {"devin": 4}, self.cfg, NOW)
        self.assertEqual(L(allowed, "devin")["effective"], 5)
        self.assert_held("devin", healthy_obs(gateWaitMedianS24h=600), bases={"devin": 4}, reason="gate-wait")
        self.assert_held("devin", healthy_obs(), healthy_sample(load1=12.8), {"devin": 4}, reason="high-load")
        self.assert_held("devin", healthy_obs(), healthy_sample(load1=None), {"devin": 4}, reason="high-load")
        self.assert_held("devin", healthy_obs(),
                         healthy_sample(psi={"cpuSomeAvg10": 25, "memoryFullAvg10": 0, "ioFullAvg10": 0}),
                         {"devin": 4}, reason="psi-high")
        for pct in (15, 12):
            self.assert_held("devin", healthy_obs(disk={"admitted": True, "freePct": pct}),
                             bases={"devin": 4}, reason="disk-low")
        self.assert_held("devin", healthy_obs(githubRemaining=1499), bases={"devin": 4}, reason="github-budget")
        self.assert_held("devin", healthy_obs(linearRemaining=500, linearLimit=2500),
                         bases={"devin": 4}, reason="linear-budget")

    def test_low_memory_does_not_scale_up_while_the_host_cooldown_holds(self):
        previous = {"lanes": {"devin": {"effective": 4}}, "host": {"lastChangeAt": NOW}}
        state = decide(previous, healthy_obs(runningByProvider={"devin": 4}),
                       healthy_sample(memAvailableBytes=6 * GIB), {"devin": 4}, self.cfg, NOW)
        self.assertEqual((L(state, "devin")["effective"], L(state, "devin")["lastReason"]),
                         (4, "hold:host-cooldown"))

    def test_unknown_budget_never_stays_above_base(self):
        previous = {"lanes": {"devin": {"effective": 6, "upStreak": 30}}}
        for key, field in (("github", "githubRemaining"), ("linear", "linearRemaining")):
            obs = healthy_obs(runningByProvider={"devin": 6})
            obs[field] = None
            state = decide(previous, obs, self.sample, {"devin": 4}, self.cfg, NOW)
            self.assertEqual((L(state, "devin")["effective"], L(state, "devin")["lastReason"]),
                             (4, f"hold:{key}-unknown"), key)

    def test_parked_prs_are_not_terminal_backlog_until_the_base_cap(self):
        parked = [pr_row(i, terminal=True) for i in range(1, 8)] + [pr_row(8)]
        budget = lane.new_issue_budget("codex", 3, parked)
        self.assertEqual(budget["reason"], "within-budget")
        self.assertEqual((budget["used"], budget["cap"], budget["terminal"], budget["terminalCap"]),
                         (1, 6, 7, 12))
        blocked = lane.new_issue_budget("codex", 3, [pr_row(i, terminal=True) for i in range(1, 13)])
        self.assertEqual((blocked["reason"], blocked["terminalCap"], blocked["allowed"]),
                         ("terminal-pr-backlog", 12, False))


class DecreaseTest(unittest.TestCase):
    previous = lambda self, effective=4: {
        "lanes": {"devin": {"effective": effective, "lastChangeAt": NOW}},
        "host": {"lastChangeAt": NOW}}

    def test_multiplicative_decrease_ignores_cooldown_and_floors_at_one(self):
        cases = [
            ("rate-limited", healthy_obs(rateBankAt={"devin": NOW - 100}), healthy_sample()),
            ("github-budget-low", healthy_obs(githubRemaining=599), healthy_sample()),
            ("linear-ratelimited", healthy_obs(linearRateLimitedAt=NOW - 100), healthy_sample()),
            ("host-pressure", healthy_obs(disk={"admitted": False, "freePct": 40}), healthy_sample()),
            ("host-pressure", healthy_obs(disk={"admitted": True, "freePct": 5}), healthy_sample()),
            ("host-pressure", healthy_obs(), healthy_sample(memAvailableBytes=3 * GIB)),
            ("host-pressure", healthy_obs(), healthy_sample(
                psi={"cpuSomeAvg10": 40, "memoryFullAvg10": 0, "ioFullAvg10": 0})),
        ]
        for reason, obs, sample in cases:
            state = decide(self.previous(4), obs, sample, {"devin": 4}, config(), NOW)
            self.assertEqual((L(state, "devin")["effective"], L(state, "devin")["lastReason"]),
                             (2, reason), reason)
        floored = decide(self.previous(1), healthy_obs(githubRemaining=100), healthy_sample(),
                         {"devin": 4}, config(), NOW)
        self.assertEqual(L(floored, "devin")["effective"], 1)

    def test_additive_decrease_respects_the_host_cooldown(self):
        cases = [
            ("host-pressure", healthy_obs(), healthy_sample(load1=16)),
            ("host-pressure", healthy_obs(), healthy_sample(memAvailableBytes=6 * GIB)),
            ("host-pressure", healthy_obs(disk={"admitted": True, "freePct": 9}), healthy_sample()),
            ("gate-pressure", healthy_obs(alerts=["gate-timeouts"]), healthy_sample()),
            ("gate-pressure", healthy_obs(alerts=["failed-runs"]), healthy_sample()),
            ("gate-pressure", healthy_obs(gateWaitMedianS24h=1201), healthy_sample()),
        ]
        for reason, obs, sample in cases:
            state = decide({"lanes": {"devin": {"effective": 4}}}, obs, sample, {"devin": 4},
                           config(), NOW)
            self.assertEqual((L(state, "devin")["effective"], L(state, "devin")["lastReason"]),
                             (3, reason), reason)
        held = decide(self.previous(4), healthy_obs(alerts=["failed-runs"]), healthy_sample(),
                      {"devin": 4}, config(), NOW)
        self.assertEqual((L(held, "devin")["effective"], L(held, "devin")["lastReason"]),
                         (4, "hold:host-cooldown"))


class IdleTest(unittest.TestCase):
    def test_idle_decay_stops_at_ceil_half_and_respects_lane_cooldown(self):
        bases = {"devin": 4}
        obs = healthy_obs(eligiblePoolByProvider={"devin": 0}, runningByProvider={"devin": 0},
                          newIssueBudgetByProvider={"devin": {"reason": "within-budget"}})
        sample = healthy_sample()
        cfg = config()
        state, when = run_ticks(29, None, obs, sample, bases, cfg, NOW)
        self.assertEqual((L(state, "devin")["effective"], L(state, "devin")["idleStreak"]), (4, 29))
        state = decide(state, obs, sample, bases, cfg, when + 60)
        self.assertEqual((L(state, "devin")["effective"], L(state, "devin")["lastReason"]),
                         (3, "idle-decay"))
        decayed = when + 60
        cooled = {"lanes": {"devin": {"effective": 3, "idleStreak": 29, "lastChangeAt": decayed}},
                  "host": {"lastChangeAt": decayed}}
        held = decide(cooled, obs, sample, bases, cfg, decayed + 60)
        self.assertEqual((L(held, "devin")["effective"], L(held, "devin")["lastReason"]),
                         (3, "hold:lane-cooldown"))
        state, when = run_ticks(29, state, obs, sample, bases, cfg, decayed + 60)
        self.assertEqual(L(state, "devin")["effective"], 3)
        state = decide(state, obs, sample, bases, cfg, when + 60)
        self.assertEqual((L(state, "devin")["effective"], L(state, "devin")["lastReason"]),
                         (2, "idle-decay"))
        state, _ = run_ticks(30, state, obs, sample, bases, cfg, when + 120)
        self.assertEqual((L(state, "devin")["effective"], L(state, "devin")["lastReason"]),
                         (2, "hold:idle-floor"))

    def test_base_three_never_decays_below_two(self):
        obs = healthy_obs(eligiblePoolByProvider={"codex": 0}, runningByProvider={"codex": 0},
                          newIssueBudgetByProvider={"codex": {"reason": "within-budget"}})
        state, when = run_ticks(30, None, obs, healthy_sample(), {"codex": 3}, config(), NOW)
        self.assertEqual(L(state, "codex")["effective"], 2)
        state, _ = run_ticks(40, state, obs, healthy_sample(), {"codex": 3}, config(), when + 60)
        self.assertEqual((L(state, "codex")["effective"], L(state, "codex")["lastReason"]),
                         (2, "hold:idle-floor"))


class CeilingTest(unittest.TestCase):
    def test_codex_ceiling_follows_unleased_accounts_and_the_named_max(self):
        obs = healthy_obs(runningByProvider={"codex": 3}, codexUnleasedAvailable=1,
                          eligiblePoolByProvider={"codex": 8})
        state = decide(None, obs, healthy_sample(), {"codex": 3}, config(intervalS=60), NOW)
        self.assertEqual((L(state, "codex")["effective"], L(state, "codex")["ceiling"]), (4, 4))
        capped = decide({"lanes": {"codex": {"effective": 6}}}, obs, healthy_sample(), {"codex": 3},
                        config(intervalS=60), NOW + 120)
        self.assertEqual((L(capped, "codex")["effective"], L(capped, "codex")["lastReason"]),
                         (4, "hold:lane-ceiling"))
        named = decide(None, healthy_obs(runningByProvider={"codex": 3}, codexUnleasedAvailable=10),
                       healthy_sample(), {"codex": 3}, config(intervalS=60, max={"codex": 3}), NOW)
        self.assertEqual(L(named, "codex")["effective"], 3)
        unknown = decide(None, healthy_obs(codexUnleasedAvailable=None, runningByProvider={"codex": 3}),
                         healthy_sample(), {"codex": 3}, config(intervalS=60), NOW)
        self.assertEqual(L(unknown, "codex")["effective"], 3)
        self.assertLessEqual(L(unknown, "codex")["ceiling"], 3)

    def test_host_cap_and_a_small_cpu_cannot_push_below_the_base_sum(self):
        obs = healthy_obs()
        sample = healthy_sample()
        state = decide(None, obs, sample, {"devin": 4, "codex": 3},
                       config(intervalS=60, hostMax=8), NOW)
        self.assertEqual(L(state, "devin")["effective"] + L(state, "codex")["effective"], 8)
        later = decide(state, obs, sample, {"devin": 4, "codex": 3},
                       config(intervalS=60, hostMax=8), NOW + 120)
        self.assertEqual(L(later, "devin")["effective"] + L(later, "codex")["effective"], 8)
        self.assertEqual(L(later, "codex")["lastReason"], "hold:host-ceiling")
        small = decide(None, obs, healthy_sample(cpuCount=2), {"devin": 4, "codex": 3},
                       config(intervalS=60), NOW)
        self.assertEqual((L(small, "devin")["effective"], L(small, "codex")["effective"]), (4, 3))
        self.assertGreaterEqual(small["host"]["ceiling"], 7)
        self.assertEqual(L(small, "devin")["lastReason"], "hold:host-ceiling")


class FailSafeTest(unittest.TestCase):
    def test_stale_doctor_and_a_disabled_lane_snap_to_base(self):
        previous = {"lanes": {"devin": {"effective": 8}, "claude": {"effective": 2}}}
        state = decide(previous, healthy_obs(doctorFresh=False), healthy_sample(),
                       {"devin": 4, "claude": 0}, config(intervalS=60), NOW)
        self.assertEqual((L(state, "devin")["effective"], L(state, "devin")["lastReason"],
                          L(state, "claude")["effective"], L(state, "claude")["lastReason"]),
                         (4, "hold:stale-doctor", 0, "hold:disabled"))

    def test_decide_does_not_touch_the_filesystem_or_the_network(self):
        with patch.object(Path, "read_text", side_effect=AssertionError("read")), \
                patch.object(urllib.request, "urlopen", side_effect=AssertionError("network")):
            state = decide(None, healthy_obs(), healthy_sample(), {"devin": 4}, config(intervalS=60), NOW)
        self.assertEqual((L(state, "devin")["effective"], state["schema"]), (5, autoscale.SCHEMA))
        self.assertLessEqual(len(state["history"]), 50)

    def test_collect_reads_only_local_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "doctor.json").write_text(json.dumps({
                "observed": {"now": NOW, "eligiblePoolByProvider": {"devin": 4},
                             "newIssueBudgetByProvider": {"devin": {"reason": "within-budget"}},
                             "capacityByProvider": {"devin": {"running": 4, "slots": 4}},
                             "githubRemaining": 4000, "gateWaitMedianS24h": 10,
                             "tick": {"unhealthy": []},
                             "codexAttribution": {"unleasedAvailable": 1}},
                "alerts": {"gate-timeouts": {"since": NOW}},
                "statusFeed": "https://gist.example/status"}))
            (root / "lanes-status.json").write_text(json.dumps({
                "throughput": {"providers": {"devin": {"productiveRunRate": 0.9, "workerStarts": 8}}}}))
            (root / "api-budget.json").write_text(
                json.dumps({"linearRemaining": 2000, "linearLimit": 2500}))
            cool = root / "cooldown"
            cool.mkdir()
            (cool / "devin").write_text(str(NOW + 50))
            os.utime(cool / "devin", (NOW - 600, NOW - 600))
            (root / "codex-accounts.json").write_text(json.dumps({
                "alpha": {"lastKind": "rate", "lastRunAt": NOW - 100},
                "beta": {"lastKind": "ok", "lastRunAt": NOW},
            }))
            with patch.object(urllib.request, "urlopen", side_effect=AssertionError("network")):
                obs = autoscale.collect(root, {"disk": {"admitted": True, "freePct": 40}}, NOW)
            self.assertTrue(obs["doctorFresh"])
            self.assertEqual((obs["runningByProvider"]["devin"], obs["productiveRunRate"]["devin"],
                              obs["alerts"], obs["linearRemaining"]),
                             (4, 0.9, ["gate-timeouts"], 2000))
            self.assertIn("devin", obs["cooling"])
            self.assertGreater(NOW - obs["cooldownAt"]["devin"], autoscale.MULTIPLICATIVE_WINDOW_S)
            self.assertEqual(obs["rateBankAt"]["codex"], NOW - 100)
            stale = root / "doctor.json"
            stale.write_text("{")
            self.assertFalse(autoscale.collect(root, {}, NOW)["doctorFresh"])


class LinearCaptureTest(unittest.TestCase):
    def client(self, root: Path):
        (root / "linear.env").write_text("LINEAR_API_KEY=test\n")
        client = lane.Linear(root / "linear.env")
        client.state = root / "state"
        return client

    class Response:
        status = 200
        headers = {"X-RateLimit-Requests-Remaining": "1800",
                   "X-RateLimit-Requests-Limit": "2500",
                   "X-RateLimit-Requests-Reset": "99"}
        __enter__ = lambda self: self
        __exit__ = lambda self, *exc: False
        read = lambda self: b'{"data": {"ok": 1}}'

    def test_headers_and_ratelimited_body_are_captured_without_changing_gql(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = self.client(Path(tmp))
            with patch.object(lane.urllib.request, "urlopen", return_value=self.Response()):
                self.assertEqual(client.gql("q", {}), {"ok": 1})
            saved = json.loads((client.state / "api-budget.json").read_text())
            self.assertEqual((saved["linearRemaining"], saved["linearLimit"], saved["linearReset"]),
                             (1800, 2500, "99"))
            body = json.dumps({"errors": [{"message": "limited",
                                           "extensions": {"code": "RATELIMITED"}}]}).encode()
            error = urllib.error.HTTPError("https://api.linear.app/graphql", 400, "bad", None,
                                           io.BytesIO(body))
            with patch.object(lane.urllib.request, "urlopen", side_effect=error):
                with self.assertRaises(urllib.error.HTTPError):
                    client.gql("q", {})
            limited = json.loads((client.state / "api-budget.json").read_text())
            self.assertIsInstance(limited["linearRateLimitedAt"], float)

    def test_capture_failure_does_not_replace_the_gql_result(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = self.client(Path(tmp))
            with patch.object(lane.autoscale, "record_linear_budget", side_effect=RuntimeError("disk")), \
                    patch.object(lane.urllib.request, "urlopen", return_value=self.Response()):
                self.assertEqual(client.gql("q", {}), {"ok": 1})
            self.assertFalse((client.state / "api-budget.json").exists())
            body = b'{"errors":[{"extensions":{"code":"RATELIMITED"}}]}'
            error = urllib.error.HTTPError("https://api.linear.app/graphql", 400, "bad", None,
                                           io.BytesIO(body))
            with patch.object(lane.autoscale, "record_linear_budget", side_effect=RuntimeError("disk")), \
                    patch.object(lane.urllib.request, "urlopen", side_effect=error):
                with self.assertRaises(urllib.error.HTTPError):
                    client.gql("q", {})


class DispatchAndWorkerTest(unittest.TestCase):
    def test_autoscale_errors_do_not_block_base_spawns_and_do_not_call_the_network(self):
        spawned = []
        with tempfile.TemporaryDirectory() as tmp, env(SYMPHONY_AUTOSCALE="apply"):
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            with patch.object(lane.autoscale, "apply_tick", side_effect=RuntimeError("boom")), \
                    patch.object(lane, "provider_healthy", return_value=True), \
                    patch.object(lane, "ensure_full_history"), \
                    patch.object(lane.disk_guard, "check", return_value={"admitted": True, "freePct": 40}), \
                    patch.object(lane.subprocess, "Popen", side_effect=lambda args, **kw: spawned.append(args[-1])), \
                    patch.object(lane.pr_events, "tick", return_value={}), \
                    patch.object(lane.reason_lane, "tick", return_value={}), \
                    patch.object(lane.yc_corpus, "tick", return_value={}), \
                    patch.object(lane.continuity_clock, "tick", return_value={"status": "current"}), \
                    patch.object(lane.doctor, "run", return_value={}), \
                    patch.object(lane.urllib.request, "urlopen", side_effect=AssertionError("network")):
                self.assertEqual(lane.dispatch(host), 0)
            tick = json.loads((host.state / "tick.json").read_text())
            self.assertIn("boom", tick["autoscaleError"])
            self.assertEqual(tick["spawned"],
                             ["devin", "devin", "devin", "devin", "codex", "codex", "codex"])
            self.assertEqual(spawned, tick["spawned"])

    def test_critical_disk_records_the_decrease_before_admission_fails(self):
        with tempfile.TemporaryDirectory() as tmp, env(SYMPHONY_AUTOSCALE="apply"):
            root = Path(tmp)
            (root / "doctor.json").write_text(json.dumps({
                "observed": {"now": time.time(),
                             "capacityByProvider": {"devin": {"running": 4}},
                             "eligiblePoolByProvider": {"devin": 2},
                             "newIssueBudgetByProvider": {"devin": {"reason": "within-budget"}},
                             "githubRemaining": 4000},
                "alerts": {},
            }))
            (root / "api-budget.json").write_text(json.dumps(
                {"linearRemaining": 2000, "linearLimit": 2500}))
            with patch.object(lane, "load_providers", return_value={"devin": {"slots": 4, "enabled": True}}), \
                    patch.object(lane, "ensure_full_history") as history, \
                    patch.object(lane.subprocess, "Popen") as spawn, \
                    patch.object(lane.disk_guard, "check", return_value={"admitted": False, "freePct": 4, "critical": True}), \
                    patch.object(lane.doctor, "run", return_value={}), \
                    patch.object(lane.continuity_clock, "tick", return_value={"status": "current"}), \
                    patch.object(lane.urllib.request, "urlopen", side_effect=AssertionError("network")):
                host = lane.Host(state=root, repo=root)
                self.assertEqual(lane.dispatch(host), 1)
            history.assert_not_called()
            spawn.assert_not_called()
            saved = json.loads((root / "autoscale.json").read_text())
            self.assertEqual((saved["lanes"]["devin"]["effective"],
                              saved["lanes"]["devin"]["lastReason"]), (2, "host-pressure"))

    def test_worker_budget_stays_on_base_slots(self):
        recorded = {}

        def budget(name, slots):
            result = lane.new_issue_budget(name, slots, [])
            recorded.update(slots=slots, cap=result["cap"], terminalCap=result["terminalCap"])
            return {"allowed": False, "reason": "over-budget", "used": 9, "cap": result["cap"],
                    "terminal": 0, "terminalCap": result["terminalCap"]}

        with tempfile.TemporaryDirectory() as tmp, env(SYMPHONY_AUTOSCALE="apply"):
            root = Path(tmp)
            env_file = root / "linear.env"
            env_file.write_text("LINEAR_API_KEY=test\n")
            host = lane.Host(state=root / "state", repo=root, linear_env=env_file)
            with patch.object(lane.autoscale, "effective_slots", return_value=9), \
                    patch.object(lane.disk_guard, "check", return_value={"admitted": True, "freePct": 40}), \
                    patch.object(lane, "lane_prs", return_value=[]), \
                    patch.object(lane, "fix_candidates", return_value=[]), \
                    patch.object(lane.pr_events, "queued_prs", return_value=[]), \
                    patch.object(lane.pr_events, "claim_event_pr", return_value=None), \
                    patch.object(lane, "claim_red_pr", return_value=None), \
                    patch.object(lane, "provider_may_run", return_value=False), \
                    patch.object(lane, "requeue_verified"), \
                    patch.object(lane, "escalate_exhausted"), \
                    patch.object(lane, "sweep_lane_prs"), \
                    patch.object(lane, "read_new_issue_budget", side_effect=budget):
                self.assertEqual(lane.worker(host, "codex"), 0)
        self.assertEqual((recorded["slots"], recorded["cap"], recorded["terminalCap"]), (3, 6, 12))


class SurfaceTest(unittest.TestCase):
    def test_doctor_capacity_keeps_base_and_the_feed_trims_history(self):
        with tempfile.TemporaryDirectory() as tmp, env(SYMPHONY_AUTOSCALE="apply"):
            state = Path(tmp)
            now = time.time()
            history = [{"at": now, "lane": "devin", "from": 4, "to": 6,
                        "reason": "sustained-demand"}] * 12
            put(state, {"schema": autoscale.SCHEMA, "mode": "apply", "observedAt": now,
                        "history": history,
                        "lanes": {"devin": {"base": 4, "effective": 6, "floor": 1, "ceiling": 8,
                                            "lastReason": "sustained-demand", "blockers": []},
                                  "claude": {"base": 0, "effective": 5, "floor": 0, "ceiling": 0,
                                             "lastReason": "hold:disabled", "blockers": ["disabled"]}}})
            host = lane.Host(state=state)
            providers = {"devin": {"slots": 4}, "claude": {"slots": 2, "enabled": False}}
            with patch.object(lane, "load_providers", return_value=providers):
                capacity = doctor.host_capacity(host, lane)
            self.assertEqual((capacity["devin"], capacity["claude"]),
                             ({"slots": 6, "running": 0, "base": 4},
                              {"slots": 0, "running": 0, "base": 0}))
            feed = doctor.status_feed(
                host, SimpleNamespace(HOST="gem", provider_throughput=lambda *a, **k: {"providers": {}}),
                {"now": now, "codexAttribution": {"state": "available", "unleasedAvailable": 1}}, {}, {})
            self.assertEqual((feed["autoscale"]["mode"],
                              feed["autoscale"]["lanes"]["devin"]["effective"],
                              feed["autoscale"]["lanes"]["devin"]["base"],
                              len(feed["autoscale"]["history"])), ("apply", 6, 4, 10))

    def test_hud_keeps_the_static_line_until_mode_is_on(self):
        spec = importlib.util.spec_from_file_location("hud_fixture", ROOT / "scripts/tests/test_hud.py")
        fixture = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(fixture)
        hud = fixture.hud

        def text(value):
            return "\n".join(fixture.plain(line) for line in hud.render(value, 160, 45))

        baseline = text(fixture.model())
        self.assertIn("1 running / 3 (devin 1/2 · codex 0/1)", baseline)
        self.assertNotIn("auto:", baseline)
        shown = fixture.model()
        shown["local"]["autoscaleMode"] = "apply"
        shown["local"]["baseSlots"] = {"devin": 2, "codex": 2}
        shown["local"]["slots"] = {"devin": 3, "codex": 1}
        rendered = text(shown)
        for needle in ("devin 1/3↑2", "codex 0/1↓2", "auto:apply"):
            self.assertIn(needle, rendered)
        level = fixture.model()
        level["local"]["autoscaleMode"] = "observe"
        level["local"]["baseSlots"] = {"devin": 2, "codex": 1}
        rendered = text(level)
        self.assertIn("1 running / 3 (devin 1/2 · codex 0/1)", rendered)
        self.assertIn("auto:observe", rendered)
        self.assertNotIn("↑", rendered)


class SampleHostTest(unittest.TestCase):
    def test_proc_sample_and_missing_pressure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "meminfo").write_text("MemTotal: 100 kB\nMemAvailable: 2048 kB\n")
            pressure = root / "pressure"
            pressure.mkdir()
            (pressure / "cpu").write_text("some avg10=1.50 avg60=1.00\n")
            (pressure / "memory").write_text("full avg10=0.25\n")
            (pressure / "io").write_text("full avg10=2.00\n")
            sample = autoscale.sample_host(root)
            self.assertEqual((sample["memAvailableBytes"], sample["psi"]["cpuSomeAvg10"],
                              sample["psi"]["memoryFullAvg10"]), (2048 * 1024, 1.5, 0.25))
            missing = autoscale.sample_host(root / "missing")
            self.assertEqual((missing["psi"], missing["memAvailableBytes"]), (None, None))


if __name__ == "__main__":
    unittest.main()
