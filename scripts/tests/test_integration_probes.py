"""Tests for scripts/lanes/integration_probes.py: each probe healthy, broken and recovered, the
probe-red doctor condition, bounded self-heal, and the receipts the registry rows watch.

Each broken fixture replays the real 2026-11-01/02 failure it would have caught.

Run with:
    python3 -m pytest scripts/tests/test_integration_probes.py -q
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/lanes/{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


probes = load("integration_probes")
NOW = 1_793_600_000.0


def show(**props):
    """A fake `systemctl --user show` / action runner keyed by unit."""
    calls = []

    def run(argv, **_):
        calls.append(argv)
        if argv[:3] == ["systemctl", "--user", "show"]:
            unit = argv[3]
            values = props.get(unit)
            if values is None:
                values = {"LoadState": "not-found", "ActiveState": "inactive", "SubState": "dead"}
            return SimpleNamespace(returncode=0, stdout="\n".join(f"{k}={v}" for k, v in values.items()), stderr="")
        return SimpleNamespace(returncode=0, stdout="", stderr="")
    run.calls = calls
    return run


ARMED = {"LoadState": "loaded", "ActiveState": "active", "SubState": "waiting", "Result": "success",
         "LastTriggerUSec": "Mon 2026-11-02 04:57:15 UTC"}
BRIDGE_UP = {"LoadState": "loaded", "ActiveState": "active", "SubState": "running", "Result": "success", "NRestarts": "0"}


def hub_status(last_seen="2026-11-02T04:55:57.814Z", status=200):
    def http(url, token=None, timeout=15, **_):
        assert token == "tok"
        return {"status": status, "body": {"ok": True, "agents": [
            {"kind": "hyperagent", "lastSeenAt": last_seen, "heartbeatSec": 120}]}, "error": None}
    return http


class TimerProbe(unittest.TestCase):
    def test_armed_timer_is_green(self):
        self.assertTrue(probes.probe_timer("jovie-lanes-watchdog.timer", run=show(**{"jovie-lanes-watchdog.timer": ARMED}))["ok"])

    def test_stopped_watchdog_timer_is_red(self):
        # 2026-10-26..11-02: the oneshot-chained watchdog timer stopped re-arming and nothing fired for a week.
        stopped = {**ARMED, "ActiveState": "inactive", "SubState": "dead"}
        found = probes.probe_timer("jovie-lanes-watchdog.timer", run=show(**{"jovie-lanes-watchdog.timer": stopped}))
        self.assertIs(found["ok"], False)
        self.assertIn("timer stopped", found["detail"])

    def test_missing_timer_is_red_and_unreadable_systemd_is_unknown(self):
        self.assertIs(probes.probe_timer("jovie-lanes.timer", run=show())["ok"], False)
        broken = lambda *a, **k: SimpleNamespace(returncode=1, stdout="", stderr="no bus")
        self.assertIsNone(probes.probe_timer("jovie-lanes.timer", run=broken)["ok"])


class BridgeProbe(unittest.TestCase):
    def test_healthy_bridge(self):
        now = probes._epoch("2026-11-02T04:57:00Z")
        found = probes.probe_bridge({}, now, run=show(**{"jovie-hyperagent-bridge.service": BRIDGE_UP}),
                                    http=hub_status(), token="tok")
        self.assertTrue(found["ok"], found["detail"])

    def test_crash_loop_is_red_even_while_active(self):
        # 2026-11-02: TLS EOF on the mailbox long-poll killed the process; systemd kept restarting it.
        now = probes._epoch("2026-11-02T04:57:00Z")
        prior = {"restartSamples": [[now - 1800, 4]]}
        looping = {**BRIDGE_UP, "NRestarts": "9"}
        found = probes.probe_bridge(prior, now, run=show(**{"jovie-hyperagent-bridge.service": looping}),
                                    http=hub_status(), token="tok")
        self.assertIs(found["ok"], False)
        self.assertIn("crash-looping: 5 systemd restarts", found["detail"])

    def test_hub_silence_and_dead_unit_are_red(self):
        now = probes._epoch("2026-11-02T04:57:00Z")
        dead = {**BRIDGE_UP, "ActiveState": "failed", "SubState": "failed", "Result": "exit-code"}
        found = probes.probe_bridge({}, now, run=show(**{"jovie-hyperagent-bridge.service": dead}),
                                    http=hub_status(last_seen="2026-11-02T03:00:00Z"), token="tok")
        self.assertIs(found["ok"], False)
        self.assertIn("failed/failed", found["detail"])
        self.assertIn("hub last saw the bridge 117 min ago", found["detail"])

    def test_old_samples_age_out_so_a_recovered_bridge_goes_green(self):
        now = probes._epoch("2026-11-02T06:00:00Z")
        prior = {"restartSamples": [[now - 7200, 4]]}
        found = probes.probe_bridge(prior, now, run=show(**{"jovie-hyperagent-bridge.service": {**BRIDGE_UP, "NRestarts": "9"}}),
                                    http=hub_status(last_seen="2026-11-02T05:59:30Z"), token="tok")
        self.assertTrue(found["ok"], found["detail"])


class ResearchProbe(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.bin = Path(self.tmp.name) / "jovie-research"
        self.bin.write_text("#!/bin/sh\n")
        patcher = mock.patch.object(probes, "RESEARCH_BIN", self.bin)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.tmp.cleanup)
        self.units = {"jovie-research-update.timer": ARMED, "jovie-research-health.timer": ARMED,
                      "jovie-research-update.service": {"Result": "success"},
                      "jovie-research-health.service": {"Result": "success"}}

    def test_mcp_answering_is_green(self):
        found = probes.probe_research(run=show(**self.units),
                                      handshake=lambda argv, timeout: {"ok": True, "tools": 4, "error": None})
        self.assertTrue(found["ok"], found["detail"])

    def test_version_ok_but_mcp_missing_is_red(self):
        # 2026-11-01/02: the health timer ran `--version` (green) while `jovie-research mcp` did not exist.
        handshake = lambda argv, timeout: {"ok": False, "tools": None,
                                           "error": "server exited (code 64) before answering tools/list; stderr: jovie-research: unknown command mcp"}
        found = probes.probe_research(run=show(**self.units), handshake=handshake)
        self.assertIs(found["ok"], False)
        self.assertIn("unknown command mcp", found["detail"])

    def test_failed_update_run_is_red(self):
        units = {**self.units, "jovie-research-update.service": {"Result": "exit-code"}}
        found = probes.probe_research(run=show(**units), handshake=lambda argv, timeout: {"ok": True, "tools": 4})
        self.assertIs(found["ok"], False)
        self.assertIn("jovie-research-update.service last run exit-code", found["detail"])

    def test_real_stdio_handshake(self):
        server = Path(self.tmp.name) / "server.py"
        server.write_text(
            "import sys, json\n"
            "for line in sys.stdin:\n"
            "    m = json.loads(line)\n"
            "    if m.get('id') == 1: print(json.dumps({'jsonrpc':'2.0','id':1,'result':{}}), flush=True)\n"
            "    if m.get('id') == 2: print(json.dumps({'jsonrpc':'2.0','id':2,'result':{'tools':[{'name':'ask'}]}}), flush=True)\n")
        ok = probes.mcp_stdio_handshake([sys.executable, str(server)], timeout=10)
        self.assertEqual((ok["ok"], ok["tools"]), (True, 1))
        dead = Path(self.tmp.name) / "dead.py"
        dead.write_text("import sys\nsys.stderr.write('jovie-research: unknown command mcp\\n')\nsys.exit(64)\n")
        red = probes.mcp_stdio_handshake([sys.executable, str(dead)], timeout=10)
        self.assertIs(red["ok"], False)
        self.assertIn("unknown command mcp", red["error"])


class HttpProbes(unittest.TestCase):
    def test_gbrain(self):
        self.assertTrue(probes.probe_gbrain(http=lambda url, **_: {"status": 200, "body": {"ok": True}})["ok"])
        sick = probes.probe_gbrain(http=lambda url, **_: {"status": 503, "body": {
            "error": "service_unavailable", "error_description": "Health check timed out (database pool may be saturated)"}})
        self.assertIs(sick["ok"], False)
        self.assertIn("database pool may be saturated", sick["detail"])
        down = probes.probe_gbrain(http=lambda url, **_: {"status": None, "body": None, "error": "URLError: refused"})
        self.assertIn("refused", down["detail"])

    def test_hub(self):
        ok = probes.probe_hub(http=lambda url, token=None, **_: {"status": 200, "body": {"ok": True, "open": 3, "claimed": 1}},
                              token="tok")
        self.assertTrue(ok["ok"])
        self.assertIs(probes.probe_hub(http=lambda url, **_: {"status": 401, "body": {}}, token="tok")["ok"], False)
        self.assertIs(probes.probe_hub(token=None)["ok"], False)

    def test_codex_auth(self):
        future = NOW + 3600
        healthy = {"accounts": {"a": {"lastKind": None}, "b": {"lastKind": "limit", "exhaustedUntil": future}}, "available": ["a"]}
        self.assertEqual(probes.codex_auth_state(healthy, NOW)[0], True)
        # Quota-held accounts are not an auth failure; every account auth-held is.
        all_auth = {"accounts": {"a": {"lastKind": "auth", "exhaustedUntil": future},
                                 "b": {"lastKind": "auth", "exhaustedUntil": future}}, "available": []}
        self.assertEqual(probes.codex_auth_state(all_auth, NOW)[0], False)
        self.assertEqual(probes.codex_auth_state({"accounts": {}}, NOW)[0], False)
        expired = {"accounts": {"a": {"lastKind": "auth", "exhaustedUntil": NOW - 1}}, "available": ["a"]}
        self.assertEqual(probes.codex_auth_state(expired, NOW)[0], True)


class PassAndCondition(unittest.TestCase):
    """run_pass -> alerts: red twice opens probe-red, heal is bounded, a pass clears it."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = Path(self.tmp.name)
        self.health = {"ok": True}
        self.spec = {"svc": {"run": lambda ctx: {"ok": self.health["ok"], "detail": "probe detail"},
                             "registry": "gem:svc", "heal": ("restart", "svc.service"), "owner": "test"}}
        patcher = mock.patch.dict(probes.PROBES, self.spec, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.run = show()

    def pass_at(self, now):
        report = probes.run_pass(self.state, now, run=self.run, ctx={"token": None})
        return {"known": True, "probes": report["probes"]}

    def test_healthy_broken_recovered(self):
        obs = self.pass_at(NOW)
        self.assertEqual(probes.alerts(obs, NOW), {})
        self.assertTrue((self.state / "probes" / "svc.ok").exists())
        self.health["ok"] = False
        obs = self.pass_at(NOW + 130)
        self.assertEqual(probes.alerts(obs, NOW + 130), {}, "one red run is not yet an incident")
        obs = self.pass_at(NOW + 260)
        alert = probes.alerts(obs, NOW + 260)
        self.assertEqual(list(alert), ["probe-red:svc"])
        self.assertIn("last good", alert["probe-red:svc"])
        self.assertIn("self-heal tried 1x", alert["probe-red:svc"])
        self.assertEqual(probes.suppressed_silence(obs), {"gem:svc"})
        self.assertEqual(probes.last_good(obs, "probe-red:svc"), NOW)
        heals = [c for c in self.run.calls if c[:3] == ["systemctl", "--user", "restart"]]
        self.assertEqual(heals, [["systemctl", "--user", "restart", "svc.service"]])
        # Still red after the heal: the condition stays open.
        obs = self.pass_at(NOW + 390)
        self.assertIn("probe-red:svc", probes.alerts(obs, NOW + 390))
        self.health["ok"] = True
        obs = self.pass_at(NOW + 520)
        self.assertEqual(probes.alerts(obs, NOW + 520), {})
        self.assertEqual(obs["probes"]["svc"]["recoveredAt"], NOW + 520)

    def test_heal_is_bounded(self):
        self.health["ok"] = False
        for step in range(40):  # 40 runs x 130 s ~ 87 min
            self.pass_at(NOW + step * 130)
        heals = [c for c in self.run.calls if c[1:3] == ["--user", "restart"]]
        self.assertEqual(len(heals), probes.HEAL_MAX)

    def test_heal_kill_switch(self):
        self.health["ok"] = False
        with mock.patch.dict(os.environ, {"LANES_INTEGRATION_HEAL": "0"}):
            for step in range(3):
                self.pass_at(NOW + step * 130)
        self.assertFalse([c for c in self.run.calls if c[1:3] == ["--user", "restart"]])

    def test_interval_reuses_last_pass(self):
        self.pass_at(NOW)
        self.health["ok"] = False
        obs = self.pass_at(NOW + 10)
        self.assertTrue(obs["probes"]["svc"]["ok"], "probes run at most every MIN_INTERVAL_S")

    def test_raising_or_hung_probe_is_red_not_fatal(self):
        def boom(ctx):
            raise RuntimeError("no")
        with mock.patch.dict(probes.PROBES, {"svc": {**self.spec["svc"], "run": boom}}):
            obs = self.pass_at(NOW)
        self.assertIs(obs["probes"]["svc"]["ok"], False)
        self.assertIn("probe raised RuntimeError", obs["probes"]["svc"]["detail"])

    def test_observe_is_off_outside_gem_and_in_selftest(self):
        with mock.patch.dict(os.environ, {"LANES_SELFTEST": "1"}):
            self.assertEqual(probes.observe(self.state, "gem", NOW)["known"], False)
        self.assertEqual(probes.observe(self.state, "tims-macbook-pro", NOW)["known"], False)


class Registry(unittest.TestCase):
    def test_registry_rows_watch_each_probe_receipt(self):
        rows = [json.loads(line) for line in (ROOT / "canon/automation-registry.jsonl").read_text().splitlines()[1:]]
        by_id = {row["id"]: row for row in rows}
        for pid, spec in probes.PROBES.items():
            self.assertIn(spec["registry"], by_id, pid)
            row = by_id[spec["registry"]]
            self.assertEqual(row["status"], "live")
            if spec["registry"] == pid:
                self.assertEqual(row["receipt"]["location"],
                                 f"gem:~/.local/state/jovie-lanes/probes/{pid.replace(':', '_')}.ok")


class DoctorWiring(unittest.TestCase):
    def test_probe_red_raises_and_suppresses_duplicate_silence(self):
        doctor = load("doctor")
        obs = {"now": NOW, "automation": {"known": True, "silent": {
                   "gem:hyperagent-bridge": {"location": "x", "ageS": 1200},
                   "gem:waste-loop": {"location": "y", "ageS": 9000}}},
               "integrationProbes": {"known": True, "probes": {"gem:hyperagent-bridge": {
                   "ok": False, "redStreak": 2, "redSince": NOW - 300, "lastGoodAt": NOW - 400,
                   "detail": "crash-looping: 5 systemd restarts in the last hour"}}}}
        alerts = doctor.judge(obs, {})
        self.assertIn("probe-red:gem:hyperagent-bridge", alerts)
        self.assertNotIn("automation-silent:gem:hyperagent-bridge", alerts)
        self.assertIn("automation-silent:gem:waste-loop", alerts)
        receipts = doctor.condition_receipts(alerts, {}, obs, "gem")
        self.assertEqual(receipts["probe-red:gem:hyperagent-bridge"]["recovery"]["action"],
                         "bounded-unit-heal-then-verify-probe")


if __name__ == "__main__":
    unittest.main()
