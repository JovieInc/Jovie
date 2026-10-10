"""Adaptive slot concurrency. Default apply; SYMPHONY_AUTOSCALE=0 is the kill switch."""
from __future__ import annotations
import importlib.util; import io; import json; import os; import sys; import tempfile; import time; import unittest; import urllib.error; import urllib.request; from contextlib import contextmanager; from pathlib import Path; from types import SimpleNamespace; from unittest.mock import patch; ROOT = Path(__file__).resolve().parents[2]; NOW, GIB = 1_800_000_000.0, 1024 ** 3
def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/lanes/{name}.py"); module = importlib.util.module_from_spec(spec); sys.modules[name] = module; spec.loader.exec_module(module); return module
A, lane, doctor = load("autoscale"), load("lane_runner"), load("doctor")
# Autoscaling fixtures describe an eligible provider independent of trial date.
_devin_free_fixture = patch.object(lane.devin_free_policy, "admission_open", return_value=True)
def setUpModule():
    _devin_free_fixture.start()
def tearDownModule():
    _devin_free_fixture.stop()
@contextmanager
def env(**updates):
    with patch.dict(os.environ, updates, clear=False):
        for key in [k for k in os.environ if k.startswith(("SYMPHONY_AUTOSCALE", "LANES_SLOTS_")) and k not in updates]:
            os.environ.pop(key, None)
        yield
def cfg(**over):
    base = {"mode": "apply", "max": {}, "hostMax": None, "intervalS": 1800}; base.update(over); return base
def obs(**over):
    base = {"doctorFresh": True, "eligiblePoolByProvider": {"devin": 8, "codex": 6},
            "newIssueBudgetByProvider": {"devin": {"reason": "within-budget"}, "codex": {"reason": "within-budget"}},
            "maintenanceQueueByProvider": {"devin": 0, "codex": 0}, "runningByProvider": {"devin": 4, "codex": 3}, "unhealthy": [],
            "cooling": [], "cooldownAt": {}, "rateBankAt": {}, "codexUnleasedAvailable": 2,
            "productiveRunRate": {"devin": 0.8, "codex": 0.8}, "starts": {"devin": 10, "codex": 10}, "alerts": [],
            "gateWaitMedianS24h": 100, "githubRemaining": 4000, "linearRemaining": 2000, "linearLimit": 2500,
            "linearRateLimitedAt": None, "mergeThroughputFresh": True,
            "mergeThroughput": {"queueDepth": 4, "queueWaitP50Minutes": 5, "mergedPerHour": 30,
                                "openedPerHour": 20, "ejectionRate": 0.1},
            "disk": {"admitted": True, "freePct": 40}}
    base.update(over); return base
def sample(**over):
    base = {"cpuCount": 16, "load1": 1.0, "memAvailableBytes": 16 * GIB,
            "psi": {"cpuSomeAvg10": 1.0, "memoryFullAvg10": 0.0, "ioFullAvg10": 0.0}}
    base.update(over); return base
def decide(previous, seen, host, bases, options, now):
    return A.decide(previous, seen, host, bases, options, now)
def ticks(count, previous, seen, host, bases, options, now, step=60):
    for _ in range(count):
        previous = decide(previous, seen, host, bases, options, now); now += step
    return previous, now - step
def pr_row(number, terminal=False):
    return {"number": number, "headRefName": f"codex/jov-{number}-20261002", "isDraft": True,
            "mergeStateStatus": "DIRTY", "labels": ["hold"] if terminal else []}
class _Body:
    def __init__(self, raw, headers=None, status=200):
        self._raw, self.headers, self.status = raw, headers, status
    def __enter__(self):
        return self
    def __exit__(self, *exc):
        return False
    def read(self):
        return self._raw
class AutoscaleTest(unittest.TestCase):
    def lane(self, state, name):
        return state["lanes"][name]
    def held(self, name, seen, host=None, bases=None, reason=None, effective=None, previous=None, options=None):
        bases = {"devin": 4, "codex": 3} if bases is None else bases
        state = decide(previous, seen, sample() if host is None else host, bases,
                       cfg(intervalS=60) if options is None else options, NOW)
        self.assertEqual(self.lane(state, name)["effective"], bases[name] if effective is None else effective)
        if reason:
            self.assertEqual(self.lane(state, name)["lastReason"], reason); token = reason.split(":", 1)[-1]; self.assertIn(token, self.lane(state, name)["blockers"])
        return state
    def test_optional_maintenance_file_reads_are_bounded_regular_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "maintenance-demand.json"
            os.mkfifo(path)
            self.assertIsNone(A._read_json(path, max_bytes=65536))
            path.unlink()
            other = Path(tmp) / "other.json"
            other.write_text('{}')
            path.symlink_to(other)
            self.assertIsNone(A._read_json(path, max_bytes=65536))
            path.unlink()
            path.write_text(' ' * 65537)
            self.assertIsNone(A._read_json(path, max_bytes=65536))

    def test_mode_defaults_and_kill_switch(self):
        self.assertEqual((A.DEFAULT_INTERVAL_S, A.LANE_COOLDOWN_S, A.UP_STREAK_REQUIRED, A.IDLE_STREAK_REQUIRED,
                          A.HOST_COOLDOWN_S, A.streak_ticks(1800), A.streak_ticks(60)), (1800, 1800, 30, 30, 120, 30, 1))
        self.assertEqual((A.idle_floor(4), A.idle_floor(3), A.idle_floor(0)), (2, 2, 0))
        with tempfile.TemporaryDirectory() as tmp:
            missing, present = Path(tmp) / "missing.env", Path(tmp) / "autoscale.env"; self.assertEqual(A.mode(env={}, config=missing), "apply"); present.write_text("SYMPHONY_AUTOSCALE_MAX_DEVIN=6\n# comment\n"); loaded = A.load_config(env={}, config=present)
            self.assertEqual((A.mode(env={}, config=present), loaded["mode"], loaded["max"]["devin"], loaded["intervalS"]),
                             ("apply", "apply", 6, 1800))
            for raw, expected in (("0", "off"), ("off", "off"), ("false", "off"), ("OFF", "off"), ("False", "off"),
                                  ("observe", "observe"), ("shadow", "observe"), ("1", "apply"), ("on", "apply"),
                                  ("true", "apply"), ("apply", "apply"), ("maybe", "off"), ("2", "off"), ("yes", "off"), ("", "off")):
                self.assertEqual(A.mode(env={"SYMPHONY_AUTOSCALE": raw}, config=missing), expected, raw)
            present.write_text('SYMPHONY_AUTOSCALE="maybe"\nSYMPHONY_AUTOSCALE_INTERVAL_S=900\n'
                               "SYMPHONY_AUTOSCALE_HOST_MAX=11\nSYMPHONY_AUTOSCALE_MAX_CODEX=5\n")
            self.assertEqual(A.mode(env={}, config=present), "off"); self.assertEqual(A.mode(env={"SYMPHONY_AUTOSCALE": "observe"}, config=present), "observe"); fallen = A.load_config(env={"SYMPHONY_AUTOSCALE_INTERVAL_S": "nope", "SYMPHONY_AUTOSCALE_MAX_CODEX": "0"}, config=present); self.assertEqual(fallen["intervalS"], 1800); self.assertNotIn("codex", fallen["max"]); self.assertEqual(fallen["hostMax"], 11); honored = A.load_config(env={}, config=present)
            self.assertEqual((honored["intervalS"], honored["max"]["codex"], honored["hostMax"]), (900, 5, 11))
        with env(), patch.object(Path, "home", return_value=Path("/tmp/jovie-autoscale-no-home")):
            self.assertEqual(A.mode(), "apply"); self.assertEqual(A.load_config()["intervalS"], 1800)
    def test_off_is_base_and_apply_fails_safe(self):
        with tempfile.TemporaryDirectory() as tmp, env(SYMPHONY_AUTOSCALE="0"):
            state = Path(tmp)
            (state / "autoscale.json").write_text(json.dumps({
                "schema": A.SCHEMA, "observedAt": NOW,
                "lanes": {"devin": {"effective": 9, "floor": 1, "ceiling": 12}, "codex": {"effective": 9, "floor": 1, "ceiling": 12}}}))
            host = lane.Host(state=state); self.assertEqual((host.base_slots("devin", 4), host.slots("devin", 4), host.slots("codex", 3)), (4, 4, 3))
        with tempfile.TemporaryDirectory() as tmp, env(SYMPHONY_AUTOSCALE="apply"):
            state = Path(tmp); self.assertEqual(A.effective_slots(state, "devin", 4, NOW), 4)
            (state / "autoscale.json").write_text("{")
            self.assertEqual(A.effective_slots(state, "devin", 4, NOW), 4); (state / "autoscale.json").write_text(json.dumps({"schema": "other", "observedAt": NOW, "lanes": {}})); self.assertEqual(A.effective_slots(state, "devin", 4, NOW), 4); fresh = {"schema": A.SCHEMA, "observedAt": NOW - 601, "lanes": {"devin": {"effective": 6, "floor": 1, "ceiling": 8}}}; (state / "autoscale.json").write_text(json.dumps(fresh)); self.assertEqual(A.effective_slots(state, "devin", 4, NOW), 4)
            fresh["observedAt"] = NOW; (state / "autoscale.json").write_text(json.dumps(fresh)); self.assertEqual(A.effective_slots(state, "missing", 4, NOW), 4); self.assertEqual(A.effective_slots(state, "devin", 0, NOW), 0); fresh["lanes"]["devin"]["effective"] = True; (state / "autoscale.json").write_text(json.dumps(fresh)); self.assertEqual(A.effective_slots(state, "devin", 4, NOW), 4); fresh["lanes"]["devin"] = {"effective": 99, "floor": 1, "ceiling": 8}
            (state / "autoscale.json").write_text(json.dumps(fresh)); self.assertEqual(A.effective_slots(state, "devin", 4, NOW), 8); fresh["lanes"]["devin"] = {"effective": 0, "floor": 1, "ceiling": 8}; (state / "autoscale.json").write_text(json.dumps(fresh)); self.assertEqual(A.effective_slots(state, "devin", 4, NOW), 1); recorded = decide(None, obs(), sample(), {"devin": 4}, cfg(mode="observe", intervalS=60), NOW); self.assertEqual((self.lane(recorded, "devin")["effective"], self.lane(recorded, "devin")["lastReason"]), (5, "sustained-demand"))
            A.write_state(state, recorded); saved = json.loads((state / "autoscale.json").read_text()); self.assertNotIn("_changed", saved); self.assertEqual((saved["lanes"]["devin"]["effective"], (state / "autoscale.json").stat().st_mode & 0o777), (5, 0o644))
            with env(SYMPHONY_AUTOSCALE="observe"):
                self.assertEqual(lane.Host(state=state).slots("devin", 4), 4); self.assertEqual(A.effective_slots(state, "devin", 4, NOW), 4)
    def test_cadence_streaks_and_one_lane(self):
        bases, seen, host, options = {"devin": 4}, obs(runningByProvider={"devin": 4}), sample(), cfg(); state, when = ticks(29, None, seen, host, bases, options, NOW)
        self.assertEqual((self.lane(state, "devin")["effective"], self.lane(state, "devin")["lastReason"], self.lane(state, "devin")["upStreak"]),
                         (4, "hold:up-streak", 29))
        state = decide(state, seen, host, bases, options, when + 60)
        self.assertEqual((self.lane(state, "devin")["effective"], self.lane(state, "devin")["lastReason"], self.lane(state, "devin")["upStreak"]),
                         (5, "sustained-demand", 0))
        seen, host = obs(runningByProvider={"devin": 4}), sample(); state, when = ticks(29, None, seen, host, bases, options, NOW); state = decide(state, obs(unhealthy=["devin"], runningByProvider={"devin": 4}), host, bases, options, when + 60); self.assertEqual((self.lane(state, "devin")["upStreak"], self.lane(state, "devin")["effective"]), (0, 4)); state, when = ticks(29, state, seen, host, bases, options, when + 120); self.assertEqual(self.lane(state, "devin")["effective"], 4)
        held = decide(state, seen, host, bases, options, when + 60); self.assertEqual((self.lane(held, "devin")["effective"], self.lane(held, "devin")["lastReason"]), (5, "sustained-demand")); both = {"devin": 4, "codex": 3}; state = decide(None, obs(), host, both, cfg(intervalS=60), NOW)
        self.assertEqual((self.lane(state, "devin")["effective"], self.lane(state, "codex")["effective"], self.lane(state, "devin")["lastReason"]), (5, 3, "sustained-demand"))
        ranked = decide(None, obs(eligiblePoolByProvider={"devin": 1, "codex": 9}), sample(), both, cfg(intervalS=60), NOW)
        self.assertEqual((self.lane(ranked, "codex")["effective"], self.lane(ranked, "devin")["effective"]), (4, 4))
    def test_wip_hold_keeps_maintenance_capacity_and_can_grow(self):
        for hold in ("over-budget", "terminal-pr-backlog"):
            with self.subTest(hold=hold):
                seen = obs(newIssueBudgetByProvider={"devin": {"reason": hold}},
                           maintenanceQueueByProvider={"devin": 4},
                           eligiblePoolByProvider={"devin": 50}, runningByProvider={"devin": 4})
                state = decide(None, seen, sample(), {"devin": 4}, cfg(intervalS=60), NOW)
                self.assertEqual(self.lane(state, "devin")["effective"], 5)
                self.assertEqual(self.lane(state, "devin")["lastReason"], "sustained-demand")
                self.assertEqual(A._demand("devin", seen), 4, "held new work is not repair demand")

    def test_missing_maintenance_sample_is_not_known_idle_under_wip_hold(self):
        seen = obs(newIssueBudgetByProvider={"devin": {"reason": "over-budget"}},
                   maintenanceQueueByProvider={}, runningByProvider={"devin": 0})
        self.assertIsNone(A._demand("devin", seen))
        state, _ = ticks(35, None, seen, sample(), {"devin": 4}, cfg(intervalS=60), NOW)
        self.assertEqual(self.lane(state, "devin")["effective"], 4)

    def test_maintenance_demand_preserves_real_safety_limits(self):
        repair = obs(newIssueBudgetByProvider={"devin": {"reason": "over-budget"}},
                     maintenanceQueueByProvider={"devin": 8}, runningByProvider={"devin": 4})
        for over, expected in (({"githubRemaining": 599}, "github-budget-low"),
                               ({"linearRemaining": 0}, "linear-ratelimited"),
                               ({"cooldownAt": {"devin": NOW}}, "rate-limited"),
                               ({"disk": {"admitted": False, "freePct": 4}}, "host-pressure")):
            state = decide(None, {**repair, **over}, sample(), {"devin": 4}, cfg(intervalS=60), NOW)
            self.assertEqual((self.lane(state, "devin")["effective"], self.lane(state, "devin")["lastReason"]), (2, expected))
        for over, expected in (({"unhealthy": ["devin"]}, "hold:unhealthy"),
                               ({"cooling": ["devin"]}, "hold:cooling"),
                               ({"githubRemaining": None}, "hold:github-unknown"),
                               ({"newIssueBudgetByProvider": {"devin": {"reason": "provider-disabled"}}}, "hold:provider-disabled")):
            state = decide(None, {**repair, **over}, sample(), {"devin": 4}, cfg(intervalS=60), NOW)
            self.assertEqual((self.lane(state, "devin")["effective"], self.lane(state, "devin")["lastReason"]), (4, expected))

    def test_worker_maintenance_sample_expiry_and_observe_apply(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "doctor.json").write_text(json.dumps({"observed": {"now": NOW, "eligiblePoolByProvider": {"devin": 0},
                "newIssueBudgetByProvider": {"devin": {"reason": "over-budget"}}}}))
            census = {"schema": "symphony-lanes-maintenance-demand/v1", "lanes": {"devin": {"observedAt": NOW - 60, "pending": 3}}}
            path = root / "maintenance-demand.json"
            path.write_text(json.dumps(census))
            self.assertEqual(A._demand("devin", A.collect(root, {}, NOW)), 3)
            for stamp, count in ((NOW - 121, 3), (NOW + 1, 3), (NOW, True), (NOW, -1), (NOW, None)):
                census["lanes"]["devin"] = {"observedAt": stamp, "pending": count}
                path.write_text(json.dumps(census))
                self.assertIsNone(A._demand("devin", A.collect(root, {}, NOW)))
            seen = obs(newIssueBudgetByProvider={"devin": {"reason": "over-budget"}}, maintenanceQueueByProvider={"devin": 3})
            state = decide(None, seen, sample(), {"devin": 4}, cfg(mode="observe", intervalS=60), NOW)
            A.write_state(root, state)
            with env(SYMPHONY_AUTOSCALE="observe"):
                self.assertEqual(A.effective_slots(root, "devin", 4, NOW), 4)
            with env(SYMPHONY_AUTOSCALE="apply"):
                self.assertEqual(A.effective_slots(root, "devin", 4, NOW), 5)

    def test_increase_blockers_budgets_and_decreases(self):
        self.held("devin", obs(newIssueBudgetByProvider={"devin": {"reason": "over-budget"}, "codex": {"reason": "within-budget"}},
                               maintenanceQueueByProvider={"devin": 0}), bases={"devin": 4}, reason="hold:over-budget")
        self.held("codex", obs(newIssueBudgetByProvider={"devin": {"reason": "within-budget"}, "codex": {"reason": "terminal-pr-backlog"}},
                               eligiblePoolByProvider={"devin": 1, "codex": 40}, maintenanceQueueByProvider={"codex": 0}),
                  bases={"codex": 3}, reason="hold:terminal-pr-backlog")
        for reason, seen, host in (
                ("hold:zero-demand", obs(eligiblePoolByProvider={"devin": 0, "codex": 0}), None),
                ("hold:unhealthy", obs(unhealthy=["devin"]), None),
                ("hold:cooling", obs(cooling=["devin"]), None),
                ("hold:rate-bank", obs(rateBankAt={"devin": NOW - 600}), None),
                ("hold:gate-wait", obs(gateWaitMedianS24h=600), None),
                ("hold:disk-low", obs(disk={"admitted": True, "freePct": 15}), None),
                ("hold:disk-low", obs(disk={"admitted": True, "freePct": 12}), None),
                ("hold:github-budget", obs(githubRemaining=1499), None),
                ("hold:linear-budget", obs(linearRemaining=500, linearLimit=2500), None),
                ("hold:high-load", obs(), sample(load1=12.8)),
                ("hold:high-load", obs(), sample(load1=None)),
                ("hold:psi-high", obs(), sample(psi={"cpuSomeAvg10": 25, "memoryFullAvg10": 0, "ioFullAvg10": 0}))):
            self.held("devin", seen, host, {"devin": 4}, reason)
        self.held("codex", obs(codexUnleasedAvailable=0), bases={"codex": 3}, reason="hold:codex-unleased")
        self.held("devin", obs(starts={"devin": 5, "codex": 10}, productiveRunRate={"devin": 0.4, "codex": 0.8}),
                  bases={"devin": 4}, reason="hold:low-productive-rate")
        allowed = decide(None, obs(starts={"devin": 4}, productiveRunRate={"devin": 0.1}, runningByProvider={"devin": 4}),
                         sample(), {"devin": 4}, cfg(intervalS=60), NOW)
        self.assertEqual((self.lane(allowed, "devin")["effective"], self.lane(allowed, "devin")["lastReason"]), (5, "sustained-demand")); cooled = {"lanes": {"devin": {"effective": 4}}, "host": {"lastChangeAt": NOW}}
        self.held("devin", obs(runningByProvider={"devin": 4}), sample(memAvailableBytes=6 * GIB), {"devin": 4},
                  "hold:host-cooldown", previous=cooled)
        previous = {"lanes": {"devin": {"effective": 6, "upStreak": 30}}}
        for key, field in (("github", "githubRemaining"), ("linear", "linearRemaining")):
            seen = obs(runningByProvider={"devin": 6}); seen[field] = None; state = decide(previous, seen, sample(), {"devin": 4}, cfg(intervalS=60), NOW); self.assertEqual((self.lane(state, "devin")["effective"], self.lane(state, "devin")["lastReason"]), (4, f"hold:{key}-unknown"))
        parked = [pr_row(i, terminal=True) for i in range(1, 8)] + [pr_row(8)]; budget = lane.new_issue_budget("codex", 3, parked); self.assertEqual(budget["reason"], "within-budget"); self.assertEqual((budget["used"], budget["cap"], budget["terminal"], budget["terminalCap"]), (1, 6, 7, 12)); blocked = lane.new_issue_budget("codex", 3, [pr_row(i, terminal=True) for i in range(1, 13)])
        self.assertEqual((blocked["reason"], blocked["terminalCap"], blocked["allowed"]), ("terminal-pr-backlog", 12, False)); hot = {"lanes": {"devin": {"effective": 4, "lastChangeAt": NOW}}, "host": {"lastChangeAt": NOW}}
        for reason, seen, host in (
                ("rate-limited", obs(rateBankAt={"devin": NOW - 100}), sample()),
                ("github-budget-low", obs(githubRemaining=599), sample()),
                ("linear-ratelimited", obs(linearRateLimitedAt=NOW - 100), sample()),
                ("host-pressure", obs(disk={"admitted": False, "freePct": 40}), sample()),
                ("host-pressure", obs(disk={"admitted": True, "freePct": 5}), sample()),
                ("host-pressure", obs(), sample(memAvailableBytes=3 * GIB)),
                ("host-pressure", obs(), sample(psi={"cpuSomeAvg10": 40, "memoryFullAvg10": 0, "ioFullAvg10": 0}))):
            state = decide(hot, seen, host, {"devin": 4}, cfg(), NOW); self.assertEqual((self.lane(state, "devin")["effective"], self.lane(state, "devin")["lastReason"]), (2, reason))
        floored = decide({"lanes": {"devin": {"effective": 1, "lastChangeAt": NOW}}, "host": {"lastChangeAt": NOW}},
                         obs(githubRemaining=100), sample(), {"devin": 4}, cfg(), NOW)
        self.assertEqual(self.lane(floored, "devin")["effective"], 1)
        for reason, seen, host in (
                ("host-pressure", obs(), sample(load1=16)),
                ("host-pressure", obs(), sample(memAvailableBytes=6 * GIB)),
                ("host-pressure", obs(disk={"admitted": True, "freePct": 9}), sample()),
                ("gate-pressure", obs(alerts=["gate-timeouts"]), sample()),
                ("gate-pressure", obs(alerts=["failed-runs"]), sample()),
                ("gate-pressure", obs(gateWaitMedianS24h=1201), sample())):
            state = decide({"lanes": {"devin": {"effective": 4}}}, seen, host, {"devin": 4}, cfg(), NOW); self.assertEqual((self.lane(state, "devin")["effective"], self.lane(state, "devin")["lastReason"]), (3, reason))
        held = decide(hot, obs(alerts=["failed-runs"]), sample(), {"devin": 4}, cfg(), NOW); self.assertEqual((self.lane(held, "devin")["effective"], self.lane(held, "devin")["lastReason"]), (4, "hold:host-cooldown"))
    def test_merge_throughput_is_diagnostic_and_cannot_throttle_healthy_workers(self):
        # A faulty queue must not suppress the workers that can repair it.
        deficit = obs(mergeThroughput={"queueDepth": 30, "queueWaitP50Minutes": 22, "mergedPerHour": 6,
                                      "openedPerHour": 31, "ejectionRate": 0.55})
        options, bases = cfg(intervalS=60), {"devin": 4}
        state = decide(None, deficit, sample(), bases, options, NOW)
        self.assertEqual((self.lane(state, "devin")["effective"], self.lane(state, "devin")["lastReason"]),
                         (5, "sustained-demand"))
        self.assertEqual(state["throughputBrake"]["reasons"], ["merge-deficit"])
        self.assertEqual(state["throughputBrake"]["signal"]["ejectionRate"], 0.55)
        deficit["runningByProvider"] = {"devin": 5}
        state = decide(state, deficit, sample(), bases, options, NOW + 61)
        self.assertTrue(state["throughputBrake"]["sustained"])
        self.assertEqual(self.lane(state, "devin")["effective"], 5, "host cooldown still applies")
        state = decide(state, deficit, sample(), bases, options, NOW + 182)
        self.assertEqual((self.lane(state, "devin")["effective"], self.lane(state, "devin")["lastReason"]),
                         (6, "sustained-demand"))
        self.assertTrue(state["throughputBrake"]["active"])

        # A previously queue-throttled lane can recover without waiting for merges.
        previous = {"lanes": {"devin": {"effective": 2, "lastChangeAt": NOW - 1800}},
                    "host": {"lastChangeAt": NOW - 1800}}
        rescued = decide(previous, obs(runningByProvider={"devin": 2},
                                      mergeThroughput=deficit["mergeThroughput"]),
                         sample(), bases, options, NOW)
        self.assertEqual((self.lane(rescued, "devin")["effective"], self.lane(rescued, "devin")["lastReason"]),
                         (3, "sustained-demand"))
        wait = obs(mergeThroughput={"queueDepth": 12, "queueWaitP50Minutes": A.MERGE_QUEUE_WAIT_BRAKE_MIN,
                                   "mergedPerHour": 40, "openedPerHour": 20, "ejectionRate": 0.2})
        waited = decide(None, wait, sample(), bases, options, NOW)
        self.assertEqual(waited["throughputBrake"]["reasons"], ["queue-wait"])
        self.assertEqual(self.lane(waited, "devin")["effective"], 5)
        missing = decide(None, obs(mergeThroughputFresh=False), sample(), bases, options, NOW)
        self.assertFalse(missing["throughputBrake"]["known"])
        self.assertEqual(self.lane(missing, "devin")["effective"], 5)

        # Genuine API capacity pressure must still reduce worker concurrency.
        limited = decide(None, obs(githubRemaining=599, mergeThroughput=deficit["mergeThroughput"]),
                         sample(), bases, options, NOW)
        self.assertEqual((self.lane(limited, "devin")["effective"], self.lane(limited, "devin")["lastReason"]),
                         (2, "github-budget-low"))
    def test_idle_decay_and_ceilings(self):
        bases = {"devin": 4}
        seen = obs(eligiblePoolByProvider={"devin": 0}, runningByProvider={"devin": 0},
                   newIssueBudgetByProvider={"devin": {"reason": "within-budget"}})
        host, options = sample(), cfg(); state, when = ticks(29, None, seen, host, bases, options, NOW); self.assertEqual((self.lane(state, "devin")["effective"], self.lane(state, "devin")["idleStreak"]), (4, 29)); state = decide(state, seen, host, bases, options, when + 60); self.assertEqual((self.lane(state, "devin")["effective"], self.lane(state, "devin")["lastReason"]), (3, "idle-decay")); decayed = when + 60
        cooled = {"lanes": {"devin": {"effective": 3, "idleStreak": 29, "lastChangeAt": decayed}}, "host": {"lastChangeAt": decayed}}; held = decide(cooled, seen, host, bases, options, decayed + 60); self.assertEqual((self.lane(held, "devin")["effective"], self.lane(held, "devin")["lastReason"]), (3, "hold:lane-cooldown")); state, when = ticks(29, state, seen, host, bases, options, decayed + 60); self.assertEqual(self.lane(state, "devin")["effective"], 3)
        state = decide(state, seen, host, bases, options, when + 60); self.assertEqual((self.lane(state, "devin")["effective"], self.lane(state, "devin")["lastReason"]), (2, "idle-decay")); state, _ = ticks(30, state, seen, host, bases, options, when + 120); self.assertEqual((self.lane(state, "devin")["effective"], self.lane(state, "devin")["lastReason"]), (2, "hold:idle-floor"))
        codex = obs(eligiblePoolByProvider={"codex": 0}, runningByProvider={"codex": 0},
                    newIssueBudgetByProvider={"codex": {"reason": "within-budget"}})
        state, when = ticks(30, None, codex, host, {"codex": 3}, options, NOW); self.assertEqual(self.lane(state, "codex")["effective"], 2); state, _ = ticks(40, state, codex, host, {"codex": 3}, options, when + 60); self.assertEqual((self.lane(state, "codex")["effective"], self.lane(state, "codex")["lastReason"]), (2, "hold:idle-floor")); codex_obs = obs(runningByProvider={"codex": 3}, codexUnleasedAvailable=1, eligiblePoolByProvider={"codex": 8})
        state = decide(None, codex_obs, host, {"codex": 3}, cfg(intervalS=60), NOW); self.assertEqual((self.lane(state, "codex")["effective"], self.lane(state, "codex")["ceiling"], self.lane(state, "codex")["lastReason"]), (4, 4, "sustained-demand")); capped = decide({"lanes": {"codex": {"effective": 6}}}, codex_obs, host, {"codex": 3}, cfg(intervalS=60), NOW + 120); self.assertEqual((self.lane(capped, "codex")["effective"], self.lane(capped, "codex")["lastReason"]), (4, "hold:lane-ceiling"))
        named = decide(None, obs(runningByProvider={"codex": 3}, codexUnleasedAvailable=10), host, {"codex": 3},
                       cfg(intervalS=60, max={"codex": 3}), NOW)
        self.assertEqual(self.lane(named, "codex")["effective"], 3); unknown = decide(None, obs(codexUnleasedAvailable=None, runningByProvider={"codex": 3}), host, {"codex": 3}, cfg(intervalS=60), NOW); self.assertEqual(self.lane(unknown, "codex")["effective"], 3); self.assertLessEqual(self.lane(unknown, "codex")["ceiling"], 3); both = {"devin": 4, "codex": 3}; state = decide(None, obs(), host, both, cfg(intervalS=60, hostMax=8), NOW)
        self.assertEqual((self.lane(state, "devin")["effective"], self.lane(state, "codex")["effective"]), (5, 3)); later = decide(state, obs(), host, both, cfg(intervalS=60, hostMax=8), NOW + 120); self.assertEqual((self.lane(later, "devin")["effective"], self.lane(later, "codex")["effective"]), (5, 3)); small = decide(None, obs(), sample(cpuCount=2), both, cfg(intervalS=60), NOW)
        self.assertEqual((self.lane(small, "devin")["effective"], self.lane(small, "codex")["effective"], self.lane(small, "devin")["lastReason"]),
                         (4, 3, "hold:host-ceiling"))
        self.assertGreaterEqual(small["host"]["ceiling"], 7)
    def test_fail_safe_collect_and_linear_capture(self):
        state = decide({"lanes": {"devin": {"effective": 8}, "claude": {"effective": 2}}}, obs(doctorFresh=False), sample(),
                       {"devin": 4, "claude": 0}, cfg(intervalS=60), NOW)
        self.assertEqual((self.lane(state, "devin")["effective"], self.lane(state, "devin")["lastReason"],
                          self.lane(state, "claude")["effective"], self.lane(state, "claude")["lastReason"]),
                         (4, "hold:stale-doctor", 0, "hold:disabled"))
        with patch.object(Path, "read_text", side_effect=AssertionError("read")), \
                patch.object(urllib.request, "urlopen", side_effect=AssertionError("network")):
            pure = decide(None, obs(), sample(), {"devin": 4}, cfg(intervalS=60), NOW)
        self.assertEqual((self.lane(pure, "devin")["effective"], self.lane(pure, "devin")["lastReason"]), (5, "sustained-demand")); self.assertEqual(pure["schema"], A.SCHEMA); self.assertLessEqual(len(pure["history"]), 50)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "doctor.json").write_text(json.dumps({
                "observed": {"now": NOW, "eligiblePoolByProvider": {"devin": 4},
                             "newIssueBudgetByProvider": {"devin": {"reason": "within-budget"}},
                             "capacityByProvider": {"devin": {"running": 4, "slots": 4}}, "githubRemaining": 4000,
                             "gateWaitMedianS24h": 10, "tick": {"unhealthy": []}, "codexAttribution": {"unleasedAvailable": 1},
                             "mergeThroughput": {"observedAt": NOW, "queueDepth": 30, "queueWaitP50Minutes": 38,
                                                 "mergedPerHour": 6, "openedPerHour": 31, "ejectionRate": 0.55}},
                "alerts": {"gate-timeouts": {"since": NOW}}, "statusFeed": "https://gist.example/status"}))
            (root / "lanes-status.json").write_text(json.dumps({"throughput": {"providers": {"devin": {"productiveRunRate": 0.9, "workerStarts": 8}}}})); (root / "api-budget.json").write_text(json.dumps({"schema": 1, "remaining": 2000, "limit": 2500, "reset": 1730000000000, "rateLimitedAt": None, "observedAt": "2026-10-02T23:51:00Z"})); (root / "cooldown").mkdir(); (root / "cooldown" / "devin").write_text(str(NOW + 50)); os.utime(root / "cooldown" / "devin", (NOW - 600, NOW - 600))
            (root / "codex-accounts.json").write_text(json.dumps({"alpha": {"lastKind": "rate", "lastRunAt": NOW - 100}, "beta": {"lastKind": "ok", "lastRunAt": NOW}}))
            with patch.object(urllib.request, "urlopen", side_effect=AssertionError("network")):
                collected = A.collect(root, {"disk": {"admitted": True, "freePct": 40}}, NOW)
            self.assertTrue(collected["doctorFresh"])
            self.assertEqual((collected["runningByProvider"]["devin"], collected["productiveRunRate"]["devin"], collected["alerts"],
                              collected["linearRemaining"], collected["linearLimit"], collected["linearRateLimitedAt"], collected["rateBankAt"]["codex"]), (4, 0.9, ["gate-timeouts"], 2000, 2500, None, NOW - 100))
            self.assertTrue(collected["mergeThroughputFresh"]); self.assertEqual(collected["mergeThroughput"], {"queueDepth": 30, "queueWaitP50Minutes": 38, "mergedPerHour": 6, "openedPerHour": 31, "ejectionRate": 0.55})
            alien = {"schema": 1, "remaining": 2400, "limit": 2500, "reset": 1730000000000, "rateLimitedAt": None, "observedAt": "2026-10-02T23:51:00Z"}; (root / "api-budget.json").write_text(json.dumps(alien)); seen = A.collect(root, {"disk": {"admitted": True, "freePct": 40}}, NOW); self.assertEqual((seen["linearRemaining"], seen["linearLimit"], seen["linearRateLimitedAt"]), (2400, 2500, None)); self.assertIsNone(A._budget_unknown(seen)); kept = decide({"lanes": {"devin": {"effective": 6}}}, obs(linearRemaining=seen["linearRemaining"], linearLimit=seen["linearLimit"], linearRateLimitedAt=seen["linearRateLimitedAt"]), sample(), {"devin": 4}, cfg(intervalS=60), NOW); self.assertEqual((self.lane(kept, "devin")["effective"], self.lane(kept, "devin")["lastReason"]), (6, "hold:not-saturated"))
            quiet = {**alien, "remaining": 0, "rateLimitedAt": A._iso(NOW - 30), "observedAt": A._iso(NOW)}; (root / "api-budget.json").write_text(json.dumps(quiet)); hit = A.collect(root, {"disk": {"admitted": True, "freePct": 40}}, NOW); self.assertEqual((hit["linearRemaining"], hit["linearLimit"]), (0, 2500)); self.assertAlmostEqual(hit["linearRateLimitedAt"], NOW - 30, delta=1); self.assertIsNone(A._budget_unknown(hit)); down = decide({"lanes": {"devin": {"effective": 6}}, "host": {"lastChangeAt": NOW}}, obs(linearRemaining=hit["linearRemaining"], linearLimit=hit["linearLimit"], linearRateLimitedAt=hit["linearRateLimitedAt"]), sample(), {"devin": 4}, cfg(), NOW); self.assertEqual((self.lane(down, "devin")["effective"], self.lane(down, "devin")["lastReason"]), (3, "linear-ratelimited"))
            (root / "api-budget.json").write_text(json.dumps({"linearRemaining": 1800, "linearLimit": 2500, "linearRateLimitedAt": NOW - 100})); legacy = A.collect(root, {}, NOW); self.assertEqual((legacy["linearRemaining"], legacy["linearLimit"]), (1800, 2500)); self.assertAlmostEqual(legacy["linearRateLimitedAt"], NOW - 100, delta=1)
            self.assertIn("devin", collected["cooling"]); self.assertGreater(NOW - collected["cooldownAt"]["devin"], A.MULTIPLICATIVE_WINDOW_S)
            (root / "doctor.json").write_text("{")
            self.assertFalse(A.collect(root, {}, NOW)["doctorFresh"]);
            env_file = root / "linear.env"
            env_file.write_text("LINEAR_API_KEY=test\n")
            client = lane.Linear(env_file)
            state = root / "state"
            headers = {"X-RateLimit-Requests-Remaining": "1800", "X-RateLimit-Requests-Limit": "2500", "X-RateLimit-Requests-Reset": "99"}
            # Consume Main's budget receipt and preserve its actual cooldown behavior.
            with patch.object(lane, "lane_state_dir", return_value=state):
                with patch.object(lane.urllib.request, "urlopen", return_value=_Body(b'{"data": {"ok": 1}}', headers)):
                    self.assertEqual(client.gql("q", {}), {"ok": 1})
                saved = json.loads((state / "api-budget.json").read_text())
                self.assertEqual((saved["schema"], saved["remaining"], saved["limit"], saved["reset"], saved["rateLimitedAt"]), (1, 1800, 2500, 99, None))
                self.assertNotIn("linearRemaining", saved)
                self.assertRegex(saved["observedAt"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
                body = json.dumps({"errors": [{"message": "limited", "extensions": {"code": "RATELIMITED"}}]}).encode()
                error = urllib.error.HTTPError("https://api.linear.app/graphql", 400, "bad", None, io.BytesIO(body))
                with patch.object(lane.urllib.request, "urlopen", side_effect=error):
                    with self.assertRaises(lane.LinearRateLimited):
                        client.gql("q", {})
                limited = json.loads((state / "api-budget.json").read_text())
                self.assertEqual((limited["remaining"], limited["limit"]), (1800, 2500))
                self.assertRegex(limited["rateLimitedAt"], r"Z$")
                self.assertAlmostEqual(A.collect(state, {}, time.time())["linearRateLimitedAt"], time.time(), delta=5)
                self.assertGreater(lane.linear_cooldown_until(client.key), time.time())
                lane.record_linear_budget({"X-RateLimit-Requests-Remaining": "1000"}, rate_limited=False)
                partial = json.loads((state / "api-budget.json").read_text())
                self.assertEqual((partial["schema"], partial["remaining"], partial["limit"], partial["reset"]), (1, 1000, 2500, 99))
                self.assertEqual(partial["rateLimitedAt"], limited["rateLimitedAt"])
                with patch.object(lane.urllib.request, "urlopen") as request:
                    with self.assertRaises(lane.LinearRateLimited):
                        client.gql("q", {})
                    request.assert_not_called()
    def test_dispatch_worker_doctor_and_hud(self):
        spawned = []
        with tempfile.TemporaryDirectory() as tmp, env(SYMPHONY_AUTOSCALE="apply"):
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            with patch.object(lane.autoscale, "apply_tick", side_effect=RuntimeError("boom")), \
                    patch.object(lane, "provider_healthy", return_value=True), patch.object(lane, "ensure_full_history"), \
                    patch.object(lane.disk_guard, "check", return_value={"admitted": True, "freePct": 40}), \
                    patch.object(lane.subprocess, "Popen", side_effect=lambda args, **kw: spawned.append(args[-1])), \
                    patch.object(lane.pr_events, "tick", return_value={}), patch.object(lane.reason_lane, "tick", return_value={}), \
                    patch.object(lane.yc_corpus, "tick", return_value={}), \
                    patch.object(lane.continuity_clock, "tick", return_value={"status": "current"}), \
                    patch.object(lane.doctor, "run", return_value={}), \
                    patch.object(lane.urllib.request, "urlopen", side_effect=AssertionError("network")):
                self.assertEqual(lane.dispatch(host), 0)
            tick = json.loads((host.state / "tick.json").read_text())
            self.assertIn("boom", tick["autoscaleError"])
            self.assertEqual(tick["spawned"], ["devin", "devin", "devin", "devin", "codex", "codex", "codex", "claude", "claude", "hyperagent", "hyperagent"])
            self.assertEqual(spawned, tick["spawned"])
        with tempfile.TemporaryDirectory() as tmp, env(SYMPHONY_AUTOSCALE="apply"):
            root = Path(tmp)
            (root / "doctor.json").write_text(json.dumps({"observed": {"now": time.time(), "capacityByProvider": {"devin": {"running": 4}},
                "eligiblePoolByProvider": {"devin": 2}, "newIssueBudgetByProvider": {"devin": {"reason": "within-budget"}}, "githubRemaining": 4000}, "alerts": {}}))
            (root / "api-budget.json").write_text(json.dumps({"schema": 1, "remaining": 2000, "limit": 2500, "reset": 1730000000000, "rateLimitedAt": None, "observedAt": "2026-10-02T23:51:00Z"}))
            with patch.object(lane, "load_providers", return_value={"devin": {"slots": 4, "enabled": True}}), \
                    patch.object(lane, "ensure_full_history") as history, patch.object(lane.subprocess, "Popen") as spawn, \
                    patch.object(lane.disk_guard, "check", return_value={"admitted": False, "freePct": 4, "critical": True}), \
                    patch.object(lane.doctor, "run", return_value={}), \
                    patch.object(lane.continuity_clock, "tick", return_value={"status": "current"}), \
                    patch.object(lane.urllib.request, "urlopen", side_effect=AssertionError("network")):
                self.assertEqual(lane.dispatch(lane.Host(state=root, repo=root)), 1)
            history.assert_not_called(); spawn.assert_not_called(); saved = json.loads((root / "autoscale.json").read_text()); self.assertEqual((saved["lanes"]["devin"]["effective"], saved["lanes"]["devin"]["lastReason"]), (2, "host-pressure"))
        recorded = {}
        def budget(name, slots):
            recorded["slots"] = slots; result = lane.new_issue_budget(name, slots, []); recorded["cap"], recorded["terminalCap"] = result["cap"], result["terminalCap"]; return {"allowed": False, "reason": "over-budget", "used": 9, "cap": result["cap"], "terminal": 0, "terminalCap": result["terminalCap"]}
        with tempfile.TemporaryDirectory() as tmp, env(SYMPHONY_AUTOSCALE="apply"):
            root = Path(tmp); (root / "linear.env").write_text("LINEAR_API_KEY=test\n"); host = lane.Host(state=root / "state", repo=root, linear_env=root / "linear.env")
            with patch.object(lane.autoscale, "effective_slots", return_value=9), \
                    patch.object(lane.disk_guard, "check", return_value={"admitted": True, "freePct": 40}), \
                    patch.object(lane, "lane_prs", return_value=[]), patch.object(lane, "fix_candidates", return_value=[]), \
                    patch.object(lane.pr_events, "queued_prs", return_value=[]), patch.object(lane.pr_events, "claim_event_pr", return_value=None), \
                    patch.object(lane, "claim_red_pr", return_value=None), patch.object(lane, "provider_may_run", return_value=False), \
                    patch.object(lane, "requeue_verified"), patch.object(lane, "escalate_exhausted"), patch.object(lane, "sweep_lane_prs"), \
                    patch.object(lane, "read_new_issue_budget", side_effect=budget):
                self.assertEqual(lane.worker(host, "codex"), 0)
        self.assertEqual((recorded["slots"], recorded["cap"], recorded["terminalCap"]), (3, 6, 12))
        with tempfile.TemporaryDirectory() as tmp, env(SYMPHONY_AUTOSCALE="apply"):
            state, now = Path(tmp), time.time(); history = [{"at": now, "lane": "devin", "from": 4, "to": 6, "reason": "sustained-demand"} for _ in range(12)]
            (state / "autoscale.json").write_text(json.dumps({
                "schema": A.SCHEMA, "mode": "apply", "observedAt": now, "history": history,
                "lanes": {"devin": {"base": 4, "effective": 6, "floor": 1, "ceiling": 8, "lastReason": "sustained-demand", "blockers": []},
                          "claude": {"base": 0, "effective": 5, "floor": 0, "ceiling": 0, "lastReason": "hold:disabled", "blockers": ["disabled"]}}}))
            providers = {"devin": {"slots": 4}, "claude": {"slots": 2, "enabled": False}}
            with patch.object(lane, "load_providers", return_value=providers):
                capacity = doctor.host_capacity(lane.Host(state=state), lane)
            self.assertEqual(capacity["devin"], {"slots": 6, "running": 0, "base": 4}); self.assertEqual(capacity["claude"], {"slots": 0, "running": 0, "base": 0})
            feed = doctor.status_feed(lane.Host(state=state), SimpleNamespace(HOST="gem", provider_throughput=lambda *a, **k: {"providers": {}}),
                                      {"now": now, "codexAttribution": {"state": "available", "unleasedAvailable": 1}}, {}, {})
            self.assertEqual((feed["autoscale"]["mode"], feed["autoscale"]["lanes"]["devin"]["effective"],
                              feed["autoscale"]["lanes"]["devin"]["base"], len(feed["autoscale"]["history"])), ("apply", 6, 4, 10))
        spec = importlib.util.spec_from_file_location("hud_fixture", ROOT / "scripts/tests/test_hud.py"); fixture = importlib.util.module_from_spec(spec); spec.loader.exec_module(fixture)
        def text(value):
            return "\n".join(fixture.plain(line) for line in fixture.hud.render(value, 160, 45))
        self.assertIn("1 running / 3 (devin 1/2 · codex 0/1)", text(fixture.model())); self.assertNotIn("auto:", text(fixture.model())); shown = fixture.model(); shown["local"].update(autoscaleMode="apply", baseSlots={"devin": 2, "codex": 2}, slots={"devin": 3, "codex": 1}); rendered = text(shown); self.assertIn("devin 1/3↑2", rendered); self.assertIn("codex 0/1↓2", rendered); self.assertIn("auto:apply", rendered); level = fixture.model()
        level["local"].update(autoscaleMode="observe", baseSlots={"devin": 2, "codex": 1}); rendered = text(level); self.assertIn("1 running / 3 (devin 1/2 · codex 0/1)", rendered); self.assertIn("auto:observe", rendered); self.assertNotIn("↑", rendered)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root / "meminfo").write_text("MemTotal: 100 kB\nMemAvailable: 2048 kB\n"); (root / "pressure").mkdir(); (root / "pressure" / "cpu").write_text("some avg10=1.50 avg60=1.00\n"); (root / "pressure" / "memory").write_text("full avg10=0.25\n"); (root / "pressure" / "io").write_text("full avg10=2.00\n"); probed = A.sample_host(root); self.assertEqual((probed["memAvailableBytes"], probed["psi"]["cpuSomeAvg10"], probed["psi"]["memoryFullAvg10"]), (2048 * 1024, 1.5, 0.25))
            self.assertIsNone(A.sample_host(root / "missing")["psi"]); self.assertIsNone(A.sample_host(root / "missing")["memAvailableBytes"])
if __name__ == "__main__":
    unittest.main()
