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
    base = {"mode": "apply", "max": {}, "hostMax": None}; base.update(over); return base
def obs(**over):
    base = {"doctorFresh": True, "eligiblePoolByProvider": {"devin": 8, "codex": 6},
            "newIssueBudgetByProvider": {"devin": {"reason": "within-budget"}, "codex": {"reason": "within-budget"}},
            "maintenanceQueueByProvider": {"devin": 0, "codex": 0}, "runningByProvider": {"devin": 4, "codex": 3}, "unhealthy": [],
            "cooling": [], "cooldownAt": {}, "rateBankAt": {}, "codexUnleasedAvailable": 2,
            "productiveRunRate": {"devin": 0.8, "codex": 0.8}, "starts": {"devin": 10, "codex": 10}, "alerts": [],
            "gateWaitMedianS24h": 100, "githubRemaining": 4000, "linearRemaining": 2000, "linearLimit": 2500,
            "linearRateLimitedAt": None, "linearBudgetFresh": True, "mergeThroughputFresh": True,
            "mergeThroughput": {"queueDepth": 4, "queueWaitP50Minutes": 5, "mergedPerHour": 30,
                                "openedPerHour": 20, "ejectionRate": 0.1},
            "disk": {"admitted": True, "freePct": 40}}
    base.update(over)
    if "linearDimensions" not in over:
        base["linearDimensions"] = {"requests": {"remaining": base["linearRemaining"], "limit": base["linearLimit"], "observedAt": NOW},
                                    "complexity": {"remaining": 1000000, "limit": 2000000, "observedAt": NOW}}
    return base
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
                       cfg() if options is None else options, NOW)
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

    def test_no_cadence_constants_and_kill_switch(self):
        # Tim 2026-10-12: no 30-minute lane intervals or up-streaks; only the load sample's own lag.
        for gone in ("DEFAULT_INTERVAL_S", "LANE_COOLDOWN_S", "UP_STREAK_REQUIRED", "IDLE_STREAK_REQUIRED",
                     "RAMP_INTERVAL_S", "streak_ticks", "GATE_WAIT_INCREASE_MAX", "PRODUCTIVE_MIN"):
            self.assertFalse(hasattr(A, gone), gone)
        self.assertEqual((A.HOST_SETTLE_S, A.idle_floor(4), A.idle_floor(3), A.idle_floor(0)), (120, 2, 2, 0))
        with tempfile.TemporaryDirectory() as tmp:
            missing, present = Path(tmp) / "missing.env", Path(tmp) / "autoscale.env"
            self.assertEqual(A.mode(env={}, config=missing), "apply")
            present.write_text("SYMPHONY_AUTOSCALE_MAX_DEVIN=6\n# comment\nSYMPHONY_AUTOSCALE_INTERVAL_S=900\n")
            loaded = A.load_config(env={}, config=present)
            self.assertEqual((loaded["mode"], loaded["max"]["devin"]), ("apply", 6))
            self.assertNotIn("intervalS", loaded, "a cadence knob no longer exists")
            for raw, expected in (("0", "off"), ("off", "off"), ("false", "off"), ("observe", "observe"), ("shadow", "observe"),
                                  ("1", "apply"), ("on", "apply"), ("apply", "apply"), ("maybe", "off"), ("", "off")):
                self.assertEqual(A.mode(env={"SYMPHONY_AUTOSCALE": raw}, config=missing), expected, raw)
            present.write_text("SYMPHONY_AUTOSCALE_HOST_MAX=11\nSYMPHONY_AUTOSCALE_MAX_CODEX=5\n")
            honored = A.load_config(env={"SYMPHONY_AUTOSCALE_MAX_DEVIN": "0"}, config=present)
            self.assertEqual((honored["max"]["codex"], honored["hostMax"]), (5, 11)); self.assertNotIn("devin", honored["max"])

    def test_off_is_base_and_apply_fails_safe(self):
        with tempfile.TemporaryDirectory() as tmp, env(SYMPHONY_AUTOSCALE="0"):
            state = Path(tmp)
            (state / "autoscale.json").write_text(json.dumps({"schema": A.SCHEMA, "observedAt": NOW, "lanes": {"devin": {"effective": 9}}}))
            host = lane.Host(state=state); self.assertEqual((host.base_slots("devin", 4), host.slots("devin", 4), host.slots("codex", 3)), (4, 4, 3))
        with tempfile.TemporaryDirectory() as tmp, env(SYMPHONY_AUTOSCALE="apply"):
            state = Path(tmp); self.assertEqual(A.effective_slots(state, "devin", 4, NOW), 4)
            (state / "autoscale.json").write_text("{"); self.assertEqual(A.effective_slots(state, "devin", 4, NOW), 4)
            fresh = {"schema": A.SCHEMA, "mode": "apply", "observedAt": NOW - 601, "lanes": {"devin": {"effective": 6, "floor": 1, "ceiling": 8}}}
            (state / "autoscale.json").write_text(json.dumps(fresh)); self.assertEqual(A.effective_slots(state, "devin", 4, NOW), 4)
            fresh["observedAt"] = NOW; fresh["lanes"]["devin"]["effective"] = 99
            (state / "autoscale.json").write_text(json.dumps(fresh)); self.assertEqual(A.effective_slots(state, "devin", 4, NOW), 8)
            self.assertEqual((A.effective_slots(state, "missing", 4, NOW), A.effective_slots(state, "devin", 0, NOW)), (4, 0))
            recorded = decide(None, obs(), sample(), {"devin": 4}, cfg(mode="observe"), NOW)
            A.write_state(state, recorded); saved = json.loads((state / "autoscale.json").read_text())
            self.assertNotIn("_changed", saved); self.assertEqual((state / "autoscale.json").stat().st_mode & 0o777, 0o644)
            with env(SYMPHONY_AUTOSCALE="observe"):
                self.assertEqual(A.effective_slots(state, "devin", 4, NOW), 4)

    def test_saturated_lane_grows_to_running_plus_pending_every_settle(self):
        # Gem 19:50Z: devin at 1 seat with ~300 eligible issues took ~7.5 h to reach 16 at one seat
        # per 30 min. Now each host settle (2 min) doubles toward running + pending.
        seen, path, state, now = obs(eligiblePoolByProvider={"devin": 300}, maintenanceQueueByProvider={"devin": 2}), [], None, NOW
        state = {"mode": "apply", "lanes": {"devin": {"base": 2, "effective": 1, "target": 1}}, "host": {"lastChangeAt": NOW - 3600}}
        for _ in range(12):
            running = self.lane(state, "devin")["effective"]
            state = decide(state, {**seen, "runningByProvider": {"devin": running}}, sample(), {"devin": 2}, cfg(), now)
            path.append((self.lane(state, "devin")["effective"], self.lane(state, "devin")["lastReason"])); now += 60
        levels = [level for level, _ in path]
        self.assertEqual(levels[:9], [2, 2, 4, 4, 8, 8, 16, 16, 16])
        self.assertEqual(path[1][1], "hold:host-settle", "the tick between steps waits only for the load sample")
        self.assertEqual(path[-1][1], "hold:lane-ceiling", "the host's compute is the ceiling")
        exact = decide({"mode": "apply", "lanes": {"devin": {"effective": 4}}}, obs(runningByProvider={"devin": 4}, eligiblePoolByProvider={"devin": 1},
                       maintenanceQueueByProvider={"devin": 1}), sample(), {"devin": 4}, cfg(), NOW)
        self.assertEqual((self.lane(exact, "devin")["effective"], self.lane(exact, "devin")["lastReason"]), (6, "sustained-demand"))
        steady = decide({"mode": "apply", "lanes": {"devin": {"effective": 6}}}, obs(runningByProvider={"devin": 6}, eligiblePoolByProvider={"devin": 0},
                        maintenanceQueueByProvider={"devin": 0}), sample(), {"devin": 4}, cfg(), NOW)
        self.assertEqual(self.lane(steady, "devin")["effective"], 6, "running seats are never released")

    def test_trailing_diagnostics_budgets_and_linear_never_hold(self):
        # 24 h gate-wait medians, trailing alerts, productive-rate history, open-PR budgets and
        # Linear quota are not measured limits: none of them may hold a lane (Tim 2026-10-12).
        for change in ({"gateWaitMedianS24h": 99999}, {"alerts": ["gate-timeouts", "failed-runs"]},
                       {"starts": {"devin": 50}, "productiveRunRate": {"devin": 0.0}},
                       {"newIssueBudgetByProvider": {"devin": {"reason": "over-budget"}}},
                       {"newIssueBudgetByProvider": {"devin": {"reason": "terminal-pr-backlog"}}},
                       {"newIssueBudgetByProvider": {"devin": {"reason": "pr-inventory-unavailable"}}},
                       {"linearRemaining": 0, "linearRateLimitedAt": NOW, "linearBudgetFresh": False, "linearDimensions": {}}):
            with self.subTest(change=change):
                state = decide(None, obs(runningByProvider={"devin": 4}, **change), sample(), {"devin": 4}, cfg(), NOW)
                row = self.lane(state, "devin")
                self.assertEqual((row["effective"], row["lastReason"], row["intakeEffective"]), (8, "sustained-demand", 8))
                self.assertEqual(A._demand("devin", obs(**change)), 8, "eligible issues plus repairs")
        disabled = obs(newIssueBudgetByProvider={"devin": {"reason": "provider-disabled"}}, maintenanceQueueByProvider={"devin": 3})
        self.assertEqual(A._demand("devin", disabled), 3)
        self.assertEqual(self.lane(decide(None, disabled, sample(), {"devin": 4}, cfg(), NOW), "devin")["intakeEffective"], 0)

    def test_real_limits_hold_growth(self):
        for reason, seen, host in (
                ("hold:unhealthy", obs(unhealthy=["devin"]), None),
                ("hold:cooling", obs(cooling=["devin"]), None),
                ("hold:rate-bank", obs(rateBankAt={"devin": NOW - 600}), None),
                ("hold:disk-low", obs(disk={"admitted": True, "freePct": 15}), None),
                ("hold:github-budget", obs(githubRemaining=1499), None),
                ("hold:high-load", obs(), sample(load1=12.8)),
                ("hold:high-load", obs(), sample(load1=None)),
                ("hold:low-mem", obs(), sample(memAvailableBytes=None)),
                ("hold:psi-high", obs(), sample(psi={"cpuSomeAvg10": 25, "memoryFullAvg10": 0, "ioFullAvg10": 0})),
                ("hold:unknown-demand", obs(eligiblePoolByProvider={}, maintenanceQueueByProvider={}), None),
                ("hold:not-saturated", obs(runningByProvider={"devin": 2}), None)):
            with self.subTest(reason=reason):
                seen = {"runningByProvider": {"devin": 4}, **seen} if "runningByProvider" not in seen else seen
                self.held("devin", {**seen, "runningByProvider": seen["runningByProvider"]}, host, {"devin": 4}, reason)
        self.held("codex", obs(codexUnleasedAvailable=0), bases={"codex": 3}, reason="hold:codex-unleased", effective=3)
        unknown = decide({"mode": "apply", "lanes": {"devin": {"effective": 6}}}, obs(githubRemaining=None, runningByProvider={"devin": 6}),
                         sample(), {"devin": 4}, cfg(), NOW)
        self.assertEqual((self.lane(unknown, "devin")["effective"], self.lane(unknown, "devin")["lastReason"]), (4, "hold:github-unknown"))

    def test_measured_pressure_shrinks_and_names_itself(self):
        hot = {"mode": "apply", "lanes": {"devin": {"effective": 4}}, "host": {"lastChangeAt": NOW - 600}}
        for reason, seen, host in (
                ("rate-limited", obs(rateBankAt={"devin": NOW - 100}), sample()),
                ("github-budget-low", obs(githubRemaining=599), sample()),
                ("host-pressure", obs(disk={"admitted": False, "freePct": 40}), sample()),
                ("host-pressure", obs(), sample(memAvailableBytes=3 * GIB)),
                ("host-pressure", obs(), sample(psi={"cpuSomeAvg10": 40, "memoryFullAvg10": 0, "ioFullAvg10": 0}))):
            state = decide(hot, seen, host, {"devin": 4}, cfg(), NOW)
            self.assertEqual((self.lane(state, "devin")["effective"], self.lane(state, "devin")["lastReason"]), (2, reason))
        # One halving per limit event: a later tick inside the window does not halve again.
        once = decide(hot, obs(cooldownAt={"devin": NOW - 100}), sample(), {"devin": 4}, cfg(), NOW)
        again = decide(once, obs(cooldownAt={"devin": NOW - 100}, runningByProvider={"devin": 2}), sample(), {"devin": 4}, cfg(), NOW + 60)
        self.assertEqual((self.lane(once, "devin")["effective"], self.lane(again, "devin")["effective"]), (2, 2))
        self.assertNotEqual(self.lane(again, "devin")["lastReason"], "rate-limited")
        fresh = decide(once, obs(cooldownAt={"devin": NOW + 30}), sample(), {"devin": 4}, cfg(), NOW + 60)
        self.assertEqual((self.lane(fresh, "devin")["effective"], self.lane(fresh, "devin")["lastReason"]), (1, "rate-limited"))
        for reason, seen, host in (("host-pressure", obs(), sample(load1=16)),
                                   ("host-pressure", obs(disk={"admitted": True, "freePct": 9}), sample()),
                                   ("gate-pressure", obs(currentRunFailures={"failed": 4, "runs": 8}), sample())):
            state = decide(hot, seen, host, {"devin": 4}, cfg(), NOW)
            self.assertEqual((self.lane(state, "devin")["effective"], self.lane(state, "devin")["lastReason"]), (3, reason))
            settling = decide({**hot, "host": {"lastChangeAt": NOW}}, seen, host, {"devin": 4}, cfg(), NOW + 60)
            self.assertEqual((self.lane(settling, "devin")["effective"], self.lane(settling, "devin")["blockers"]), (4, [reason, "host-settle"]))
        # Gem 02:00Z: a lane already at its floor under load read "hold:host-cooldown"; it is load.
        floor = decide({"mode": "apply", "lanes": {"devin": {"effective": 1}}}, obs(runningByProvider={"devin": 1}), sample(load1=16.7), {"devin": 2}, cfg(), NOW)
        self.assertEqual((self.lane(floor, "devin")["lastReason"], self.lane(floor, "devin")["blockers"]), ("hold:host-pressure", ["host-pressure"]))

    def test_known_idle_lane_releases_unused_seats_at_once(self):
        prior = {"mode": "apply", "lanes": {"devin": {"effective": 10}, "codex": {"effective": 2}}, "host": {"lastChangeAt": NOW - 600}}
        seen = obs(eligiblePoolByProvider={"devin": 0, "codex": 40}, maintenanceQueueByProvider={"devin": 0, "codex": 0},
                   runningByProvider={"devin": 3, "codex": 2}, codexUnleasedAvailable=8)
        state = decide(prior, seen, sample(cpuCount=12), {"devin": 4, "codex": 3}, cfg(), NOW)
        self.assertEqual((self.lane(state, "devin")["effective"], self.lane(state, "devin")["lastReason"]), (3, "idle-release"))
        self.assertEqual(self.lane(state, "codex")["effective"], 4, "the released share goes to the lane with demand")
        floor = decide(prior, {**seen, "runningByProvider": {"devin": 0, "codex": 2}}, sample(), {"devin": 4, "codex": 3}, cfg(), NOW)
        self.assertEqual(self.lane(floor, "devin")["effective"], 2, "never below ceil(base / 2)")

    def test_host_and_credit_ceilings(self):
        state = decide(None, obs(), sample(cpuCount=16), {"devin": 2}, cfg(), NOW)
        self.assertEqual((self.lane(state, "devin")["ceiling"], state["host"]["ceiling"]), (16, 16))
        self.assertEqual(decide(None, obs(), sample(cpuCount=16), {"devin": 2}, cfg(hostMax=6), NOW)["host"]["ceiling"], 6)
        for cap in (1, 2, 4):
            limited = decide(None, obs(), sample(), {"codex": 3, "devin": 2}, cfg(hostMax=cap), NOW)
            self.assertEqual(sum(row["effective"] for row in limited["lanes"].values()), cap)
            with tempfile.TemporaryDirectory() as tmp, env(SYMPHONY_AUTOSCALE="apply"):
                A.write_state(Path(tmp), limited); self.assertEqual(A.host_ceiling(Path(tmp), NOW), cap)
        for unknown_cpu in (None, True, 0, -1, "16"):
            denied = decide(None, obs(), sample(cpuCount=unknown_cpu), {"codex": 3, "devin": 2}, cfg(), NOW)
            self.assertTrue(all(row["effective"] == row["intakeEffective"] == 0 for row in denied["lanes"].values()))
        credits = decide(None, obs(runningByProvider={"codex": 1}, codexUnleasedAvailable=0), sample(), {"codex": 3}, cfg(), NOW)
        self.assertEqual(self.lane(credits, "codex")["ceiling"], 1, "codex stays bound by its leases")
        named = decide(None, obs(runningByProvider={"codex": 3}, codexUnleasedAvailable=10), sample(), {"codex": 3}, cfg(max={"codex": 3}), NOW)
        self.assertEqual(self.lane(named, "codex")["effective"], 3)
        # A one-tick lease dip publishes 0 but never becomes the level (Gem 2026-10-11 18:45).
        dip = decide(None, obs(runningByProvider={"codex": 0}, codexUnleasedAvailable=0), sample(), {"codex": 3}, cfg(), NOW)
        self.assertEqual((self.lane(dip, "codex")["effective"], self.lane(dip, "codex")["target"]), (0, 3))
        back = decide(dip, obs(runningByProvider={"codex": 0}, codexUnleasedAvailable=1, eligiblePoolByProvider={"codex": 0},
                               maintenanceQueueByProvider={}), sample(), {"codex": 3}, cfg(), NOW + 60)
        self.assertEqual(self.lane(back, "codex")["effective"], 1)
        legacy = {"mode": "apply", "lanes": {"codex": {"base": 3, "effective": 0, "ceiling": 0, "lastReason": "hold:lane-ceiling"}}}
        self.assertEqual(self.lane(decide(legacy, obs(runningByProvider={"codex": 0}, codexUnleasedAvailable=1), sample(), {"codex": 3}, cfg(), NOW), "codex")["target"], 3)
        sick = decide(None, obs(unhealthy=["hyperagent"], runningByProvider={"devin": 4, "hyperagent": 0}, eligiblePoolByProvider={"devin": 0, "hyperagent": 0},
                                maintenanceQueueByProvider={"devin": 0, "hyperagent": 0}), sample(cpuCount=4), {"devin": 4, "hyperagent": 4}, cfg(), NOW)
        self.assertEqual((self.lane(sick, "devin")["effective"], self.lane(sick, "hyperagent")["intakeEffective"]), (4, 0))

    def test_saturated_lane_ramps_on_recent_positive_demand(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "doctor.json").write_text(json.dumps({"observed": {"now": NOW, "githubRemaining": 4000, "eligiblePoolByProvider": {"devin": 0},
                                                                       "capacityByProvider": {"devin": {"running": 1}}}}))
            def census(age, pending=6):
                (root / "maintenance-demand.json").write_text(json.dumps({"schema": "symphony-lanes-maintenance-demand/v1",
                    "lanes": {"devin": {"observedAt": NOW - age, "pending": pending}}}))
                collected = A.collect(root, {}, NOW)
                return {**obs(), **{key: collected[key] for key in ("maintenanceQueueByProvider", "recentPositiveDemandByProvider",
                                                                     "eligiblePoolByProvider", "runningByProvider")}}
            previous = {"mode": "apply", "lanes": {"devin": {"base": 2, "effective": 1, "target": 1}}, "host": {"lastChangeAt": NOW - 3600}}
            seen = census(254)
            self.assertIsNone(A._demand("devin", seen, NOW), "past the fresh window on its own")
            self.assertEqual(self.lane(decide(previous, seen, sample(), {"devin": 2}, cfg(), NOW), "devin")["effective"], 2)
            idle = decide(previous, {**seen, "runningByProvider": {"devin": 0}}, sample(), {"devin": 2}, cfg(), NOW)
            self.assertEqual(self.lane(idle, "devin")["lastReason"], "hold:not-saturated", "an idle seat rescans; it does not borrow old demand")
            for age, pending in ((A.BUSY_DEMAND_STALE_S + 1, 6), (254, 0)):
                self.assertEqual(self.lane(decide(previous, census(age, pending), sample(), {"devin": 2}, cfg(), NOW), "devin")["effective"], 1)

    def test_fixed_failures_stop_limiting_capacity_and_current_ones_back_off(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root / "runs").mkdir(); release = root / "releases/r1/scripts/lanes"; release.mkdir(parents=True)
            (root / "current").symlink_to(release)
            def install(at):
                os.utime(root / "current", (at, at), follow_symlinks=False)
            def ledger(rows):
                (root / "runs" / "ledger.jsonl").write_text("".join(json.dumps(
                    {"verdict": verdict, "startedAt": A._iso(NOW - age - 60), "endedAt": A._iso(NOW - age)}) + "\n" for age, verdict in rows))
                return A.current_run_failures(root)
            def scaled(failures):
                return self.lane(decide({"mode": "apply", "lanes": {"devin": {"effective": 4}}}, obs(currentRunFailures=failures),
                                        sample(), {"devin": 4}, cfg(), NOW), "devin")
            install(NOW - 7 * 3600)
            healed = ledger([(6 * 3600, "failed")] * 11 + [(600, "landing")] * 5 + [(300, "verified-not-queued")] * 3)
            self.assertEqual((healed["failed"], healed["runs"]), (0, 8)); self.assertEqual(scaled(healed)["effective"], 8)
            install(NOW - 3600)
            self.assertEqual(ledger([(2 * 3600, "failed")] * 11)["runs"], 0)
            current = ledger([(900, "landing"), (600, "failed"), (300, "failed")])
            self.assertEqual((scaled(current)["effective"], scaled(current)["lastReason"]), (3, "gate-pressure"))
            self.assertNotEqual(scaled(ledger([(600, "failed")]))["lastReason"], "gate-pressure", "a single failure is not a rate")

    def test_intake_slots_follow_the_ledger_not_linear(self):
        with tempfile.TemporaryDirectory() as tmp, env(SYMPHONY_AUTOSCALE="apply"):
            root = Path(tmp)
            self.assertEqual(A.intake_slots(root, "devin", 4, NOW), 4, "no receipt: same fail-safe as effective_slots")
            state = decide(None, obs(runningByProvider={"devin": 4}, linearRemaining=0, linearRateLimitedAt=NOW), sample(), {"devin": 4}, cfg(), NOW)
            A.write_state(root, state)
            self.assertFalse((root / "api-budget.json").exists())
            self.assertEqual((A.intake_slots(root, "devin", 4, NOW), A.intake_slots(root, "devin", 0, NOW)), (8, 0))
            for bad in (None, True, -1, "2"):
                A.write_state(root, {**state, "lanes": {"devin": {**state["lanes"]["devin"], "intakeEffective": bad}}})
                self.assertEqual(A.intake_slots(root, "devin", 4, NOW), 0)
            A.write_state(root, decide(None, obs(cooling=["devin"], runningByProvider={"devin": 4}), sample(), {"devin": 4}, cfg(), NOW))
            self.assertEqual(A.intake_slots(root, "devin", 4, NOW), 0)
            with env(SYMPHONY_AUTOSCALE="off"):
                self.assertEqual(A.intake_slots(root, "devin", 4, NOW), 4); self.assertIsNone(A.host_ceiling(root, NOW))

    def test_merge_throughput_is_diagnostic_only(self):
        deficit = obs(runningByProvider={"devin": 4}, mergeThroughput={"queueDepth": 30, "queueWaitP50Minutes": 40, "mergedPerHour": 6,
                                                                       "openedPerHour": 31, "ejectionRate": 0.55})
        state = decide(None, deficit, sample(), {"devin": 4}, cfg(), NOW)
        self.assertEqual((self.lane(state, "devin")["effective"], state["throughputBrake"]["reasons"]), (8, ["merge-deficit", "queue-wait"]))
        self.assertFalse(decide(None, obs(mergeThroughputFresh=False), sample(), {"devin": 4}, cfg(), NOW)["throughputBrake"]["known"])

    def test_fail_safe_collect(self):
        state = decide({"mode": "apply", "lanes": {"devin": {"effective": 8}, "claude": {"effective": 2}}}, obs(doctorFresh=False), sample(),
                       {"devin": 4, "claude": 0}, cfg(), NOW)
        self.assertEqual((self.lane(state, "devin")["effective"], self.lane(state, "devin")["lastReason"], self.lane(state, "claude")["lastReason"]),
                         (4, "hold:stale-doctor", "hold:disabled"))
        with patch.object(Path, "read_text", side_effect=AssertionError("read")), \
                patch.object(urllib.request, "urlopen", side_effect=AssertionError("network")):
            pure = decide(None, obs(runningByProvider={"devin": 4}), sample(), {"devin": 4}, cfg(), NOW)
        self.assertEqual((pure["schema"], self.lane(pure, "devin")["lastReason"]), (A.SCHEMA, "sustained-demand"))
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "doctor.json").write_text(json.dumps({"observed": {
                "now": NOW, "eligiblePoolByProvider": {"devin": 4}, "capacityByProvider": {"devin": {"running": 4}}, "githubRemaining": 4000,
                "codexAttribution": {"unleasedAvailable": 1, "authCooldown": 1, "earliestCooldownS": 60, "semantics": "dropped"},
                "mergeThroughput": {"observedAt": NOW, "queueDepth": 3, "queueWaitP50Minutes": 8, "mergedPerHour": 6, "openedPerHour": 3, "ejectionRate": 0.1}}}))
            (root / "api-budget.json").write_text(json.dumps({"schema": 1, "remaining": 2000, "limit": 2500, "rateLimitedAt": None, "observedAt": A._iso(NOW)}))
            (root / "cooldown").mkdir(); (root / "cooldown" / "devin").write_text(str(NOW + 50)); os.utime(root / "cooldown" / "devin", (NOW - 600, NOW - 600))
            (root / "codex-accounts.json").write_text(json.dumps({"alpha": {"lastKind": "rate", "lastRunAt": NOW - 100}}))
            with patch.object(urllib.request, "urlopen", side_effect=AssertionError("network")):
                collected = A.collect(root, {"disk": {"admitted": True, "freePct": 40}}, NOW)
            self.assertTrue(collected["doctorFresh"])
            self.assertEqual((collected["runningByProvider"]["devin"], collected["linearRemaining"], collected["rateBankAt"]["codex"]), (4, 2000, NOW - 100))
            self.assertEqual(collected["codexAttribution"], {"unleasedAvailable": 1, "authCooldown": 1, "earliestCooldownS": 60})
            self.assertIn("devin", collected["cooling"]); self.assertTrue(collected["mergeThroughputFresh"])
            (root / "doctor.json").write_text("{"); self.assertFalse(A.collect(root, {}, NOW)["doctorFresh"])

    def test_dispatch_worker_doctor_and_hud(self):
        spawned = []
        with tempfile.TemporaryDirectory() as tmp, env(SYMPHONY_AUTOSCALE="apply"), \
                patch.object(lane.autoscale, "load_config", return_value=cfg()):
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            with patch.object(lane.autoscale, "apply_tick", side_effect=RuntimeError("boom")), \
                    patch.object(lane, "provider_healthy", return_value=True), patch.object(lane, "ensure_full_history"), \
                    patch.object(lane.disk_guard, "check", return_value={"admitted": True, "freePct": 40}), \
                    patch.object(lane.subprocess, "Popen", side_effect=lambda args, **kw: spawned.append(args[-1])), \
                    patch.object(lane, "collect_shipping_origin", return_value={}), \
                    patch.object(lane, "quota_pressure", return_value={"ok": True}), \
                    patch.object(lane.pr_events, "tick", return_value={}), patch.object(lane.reason_lane, "tick", return_value={}), \
                    patch.object(lane.yc_corpus, "tick", return_value={}), \
                    patch.object(lane.continuity_clock, "tick", return_value={"status": "current"}), \
                    patch.object(lane.doctor, "run", return_value={}), \
                    patch.object(lane.urllib.request, "urlopen", side_effect=AssertionError("network")):
                self.assertEqual(lane.dispatch(host), 0)
            tick = json.loads((host.state / "tick.json").read_text())
            self.assertIn("boom", tick["autoscaleError"])
            self.assertEqual(tick["spawned"], ["devin", "devin", "devin", "devin", "codex", "codex", "codex", "claude", "claude", "hyperagent", "hyperagent", "grok"])
            self.assertEqual(spawned, tick["spawned"])
        with tempfile.TemporaryDirectory() as tmp, env(SYMPHONY_AUTOSCALE="apply"), \
                patch.object(lane.autoscale, "load_config", return_value=cfg()):
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
            history.assert_not_called(); spawn.assert_not_called(); saved = json.loads((root / "autoscale.json").read_text()); self.assertEqual((saved["lanes"]["devin"]["effective"], saved["lanes"]["devin"]["lastReason"]), (2, "host-pressure")); self.assertTrue((root / "capacity-limit-tracker.json").exists(), "the dispatch tick runs the capacity record")
        recorded = {}
        def budget(name, slots):
            recorded["slots"] = slots; result = lane.new_issue_budget(name, slots, []); recorded["cap"], recorded["terminalCap"] = result["cap"], result["terminalCap"]; return {"allowed": False, "reason": "provider-disabled", "used": 0, "cap": None, "terminal": 0, "terminalCap": None}
        with tempfile.TemporaryDirectory() as tmp, env(SYMPHONY_AUTOSCALE="apply"):
            root = Path(tmp); (root / "linear.env").write_text("LINEAR_API_KEY=test\n"); host = lane.Host(state=root / "state", repo=root, linear_env=root / "linear.env")
            inventory_at = time.time()
            with patch.object(lane.autoscale, "effective_slots", return_value=9), \
                    patch.object(lane.autoscale, "intake_slots", return_value=9), \
                    patch.object(lane.disk_guard, "check", return_value={"admitted": True, "freePct": 40}), \
                    patch.object(lane, "_SUMMARY", {"at": inventory_at, "sourceAt": inventory_at, "readable": True, "prs": []}), \
                    patch.object(lane, "lane_prs", return_value=[]), patch.object(lane, "fix_candidates", return_value=[]), \
                    patch.object(lane.pr_events, "queued_prs", return_value=[]), patch.object(lane.pr_events, "claim_event_pr", return_value=None), \
                    patch.object(lane, "claim_red_pr", return_value=None), patch.object(lane, "provider_may_run", return_value=False), \
                    patch.object(lane, "requeue_verified"), patch.object(lane, "escalate_exhausted"), patch.object(lane, "sweep_lane_prs"), \
                    patch.object(lane, "read_new_issue_budget", side_effect=budget):
                self.assertEqual(lane.worker(host, "codex"), 0)
        self.assertEqual((recorded["slots"], recorded["cap"], recorded["terminalCap"]), (3, None, None), "no PR ceiling")
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
