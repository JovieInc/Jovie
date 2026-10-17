"""Capacity-limit records: real limits only, on change, signed exactly like the Summer node client."""
from __future__ import annotations

import copy
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/lanes/{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


A = load("autoscale")
C = load("capacity_limit")
NOW, GIB = 1_800_000_000.0, 1024 ** 3
CLIENT = ROOT / "scripts/backlog-orchestrator/summer-triage-assessment-client.mjs"


def state(lanes, load1=16.7, cpu=16, mem=50 * GIB):
    return {"schema": A.SCHEMA, "mode": "apply", "observedAt": NOW, "host": {"ceiling": cpu},
            "hostSample": {"cpuCount": cpu, "load1": load1, "memAvailableBytes": mem,
                           "psi": {"cpuSomeAvg10": 11.4, "memoryFullAvg10": 0.0, "ioFullAvg10": 0.0}},
            "lanes": lanes}


def row(blockers, demand=6, running=1, base=2, effective=1, reason=None, ceiling=16):
    return {"base": base, "effective": effective, "running": running, "demand": demand, "ceiling": ceiling,
            "blockers": blockers, "lastReason": reason or ("hold:" + blockers[0] if blockers else "hold:steady")}


OBS = {"disk": {"admitted": True, "freePct": 40}, "githubRemaining": 4000, "codexAttribution": {},
       "maintenanceQueueByProvider": {"devin": 0, "grok": 0, "codex": 0, "hyperagent": 0},
       "eligiblePoolByProvider": {"devin": 6, "grok": 3, "codex": 6, "hyperagent": 6},
       "doctorFresh": True, "doctorObservedAt": NOW, "codexObservedAt": NOW, "diskObservedAt": NOW, "rateBankAt": {}}
CPU = state({"devin": row(["host-pressure"]), "grok": row(["host-pressure"], demand=3)})


def run(steps, tracker=None, release=1.0, now=None):
    out = []
    previous = max((r.get("observedAt") or NOW - 60 for r in (tracker or {}).get("seen", {}).values()), default=NOW - 60)
    now = previous + 60 if now is None else now
    for current, obs in steps:
        current, obs = copy.deepcopy(current), copy.deepcopy(obs)
        current["observedAt"] = now
        obs.update(doctorObservedAt=now, codexObservedAt=now, diskObservedAt=now)
        tracker, emit, changed = C.step(tracker, current, obs, now, host="gem", release_at=release)
        out.append((emit, changed)); now += 60
    return tracker, out


def keypair():
    """An ephemeral Ed25519 PKCS#8 PEM, from cryptography or node."""
    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        return Ed25519PrivateKey.generate().private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                                          serialization.NoEncryption()).decode()
    except ImportError:
        done = subprocess.run(["node", "-e", "const c=require('node:crypto');process.stdout.write(c.generateKeyPairSync('ed25519')"
                                             ".privateKey.export({type:'pkcs8',format:'pem'}))"], capture_output=True, text=True, check=True)
        return done.stdout


class CapacityLimitTest(unittest.TestCase):
    def test_real_limit_publishes_after_hysteresis_once_and_clears_once(self):
        tracker, out = run([(CPU, OBS)] * 5)
        self.assertEqual([len(emit) for emit, _ in out], [0, 0, 1, 0, 0], "three binding ticks, then no heartbeat")
        body = out[2][0][0]
        self.assertEqual((body["status"], body["resource"], body["lanes"], body["observed"], body["limit"], body["unit"]),
                         ("limited", "host-cpu", ["devin", "grok"], 16.7, 16, "load1"))
        self.assertIn("CPU load 16.7/16", body["needs"]); self.assertLessEqual(len(body["needs"]), 200)
        self.assertEqual(body["unblock"]["action"], C.UNBLOCK["host-cpu"])
        body.update(sentAt=A._iso(NOW), deliveryId="gem:host-cpu:limited:1800000000", signatureKeyId="key-1", signature="ed25519=x")
        self.assertTrue(C.valid_body(body))
        # Load moving is jitter, never a re-POST (Gem 03:59-04:05Z churn); a new limit is material.
        for load in (17.5, 24.0, 9.0):
            tracker, out = run([(state(CPU["lanes"], load1=load), OBS)], tracker)
            self.assertEqual(out[0][0], [])
        tracker, out = run([(state(CPU["lanes"], cpu=32, load1=40.0), OBS)], tracker)
        self.assertEqual(out[0][0][0]["limit"], 32)
        # Lanes changing is a change.
        one = state({"devin": row(["host-pressure"]), "grok": row([], demand=0, reason="sustained-demand")})
        tracker, out = run([(one, OBS)], tracker)
        self.assertEqual(out[0][0][0]["lanes"], ["devin"])
        # Clear: held for the hysteresis window, then one `cleared`, then silence.
        calm = state({"devin": row([], demand=6, reason="sustained-demand")}, load1=2.0)
        tracker, out = run([(calm, OBS)] * 5, tracker)
        self.assertEqual([len(emit) for emit, _ in out], [0, 0, 1, 0, 0])
        cleared = out[2][0][0]
        self.assertEqual((cleared["status"], cleared["resource"], cleared["lanes"]), ("cleared", "host-cpu", ["devin"]))
        self.assertNotIn("needs", cleared)
        self.assertEqual(tracker["published"], {})

    def test_flapping_binding_never_publishes(self):
        calm = state({"devin": row([], reason="sustained-demand")}, load1=2.0)
        _, out = run([(CPU, OBS), (calm, OBS)] * 4)
        self.assertTrue(all(emit == [] for emit, _ in out))

    def test_release_install_replays_current_state_once(self):
        tracker, _ = run([(CPU, OBS)] * 3, release=1.0)
        tracker, out = run([(CPU, OBS)] * 2, tracker, release=2.0)
        self.assertEqual([len(emit) for emit, _ in out], [1, 0])
        self.assertEqual(out[0][0][0]["status"], "limited")

    def test_resources_map_from_measured_holds_only(self):
        cases = (
            (state({"codex": row(["codex-unleased"], running=0, effective=0, ceiling=0)}),
             {**OBS, "codexAttribution": {"state": "quota-banked", "quotaBanked": 1, "earliestCooldownS": 3600}}, "codex-credits"),
            (state({"devin": row(["disk-low"])}),
             {**OBS, "disk": {"admitted": True, "freePct": 12}, "diskReclaimable": False}, "host-disk"),
            (state({"devin": row(["low-mem"])}, mem=4 * GIB), OBS, "host-memory"),
            (state({"devin": row(["github-budget"])}), {**OBS, "githubRemaining": 900}, "github-api-quota"),
            (state({"devin": row(["lane-ceiling"])}), OBS, "host-cpu"),
            (state({"devin": row(["host-ceiling"])}), OBS, "host-cpu"),
        )
        for lanes, obs, resource in cases:
            with self.subTest(resource=resource):
                _, out = run([(lanes, obs)] * 3)
                body = out[2][0][0]
                self.assertEqual(body["resource"], resource)
                self.assertNotIn("estCost", body["unblock"])
                self.assertNotRegex(body["unblock"]["action"], r"upgrade|add.*account|buy|\$")
                body.update(sentAt=A._iso(NOW), deliveryId="gem:x:limited:1800000000", signatureKeyId="key-1", signature="ed25519=x")
                self.assertTrue(C.valid_body(body), body)
                if resource == "codex-credits":
                    self.assertIn("quota cooldown reported", body["needs"])
                    self.assertEqual(body["until"], A._iso(NOW + 120 + 3600))

    def test_disk_is_no_limit_while_the_sweep_has_targets(self):
        # Gem 04:12Z: host-disk was POSTed at 15% free with ~178 GB of retired workspaces left.
        lanes = state({"devin": row(["disk-low"])})
        for reclaimable in (True, None):
            tracker, out = run([(lanes, {**OBS, "disk": {"admitted": True, "freePct": 15}, "diskReclaimable": reclaimable})] * 4)
            self.assertTrue(all(emit == [] for emit, _ in out))
            self.assertTrue(tracker["bottleneckFound"], "a pending sweep is a software step, not a purchase")

    def test_software_and_no_demand_holds_are_never_sent(self):
        for blockers, demand, found in ((["gate-pressure"], 6, True), (["stale-doctor"], 6, True), (["unknown-running"], 6, True),
                                        (["github-unknown"], 6, True), (["unhealthy"], 6, True),
                                        (["cooling"], 6, True),  # a lane cooldown without provider bank evidence
                                        (["zero-demand"], 0, False), (["not-saturated", "high-load"], 6, False),
                                        (["host-pressure", "host-settle"], 6, False), (["high-load"], 0, False)):
            with self.subTest(blockers=blockers):
                tracker, out = run([(state({"devin": row(blockers, demand=demand)}), OBS)] * 4)
                self.assertTrue(all(emit == [] for emit, _ in out))
                self.assertEqual(tracker["bottleneckFound"], found)
        disabled = state({"devin": row(["host-pressure"], base=0)})
        _, out = run([(disabled, OBS)] * 4)
        self.assertTrue(all(emit == [] for emit, _ in out))


    def test_regression_configured_ceiling_with_low_pressure_is_not_compute(self):
        low = state({"devin": row(["host-ceiling"])}, load1=3.8)
        low["hostSample"]["psi"]["cpuSomeAvg10"] = 1.0
        tracker, out = run([(low, OBS)] * 3)
        self.assertEqual(tracker["published"], {})
        self.assertTrue(all(not emit for emit, _ in out))

    def test_regression_configured_codex_seats_are_not_account_limits(self):
        seats = state({"codex": row(["codex-unleased"], demand=109, running=3, ceiling=3)})
        tracker, _ = run([(seats, {**OBS, "codexAttribution": {"loginSlots": 3}})] * 3)
        self.assertEqual(tracker["published"], {})

    def test_regression_auth_and_rate_cooldowns_are_not_credits(self):
        for attribution in ({"authCooldown": 1}, {"rateCooldown": 1}):
            tracker, _ = run([(state({"codex": row(["codex-unleased"])}),
                               {**OBS, "codexAttribution": attribution})] * 3)
            self.assertEqual(tracker["published"], {})

    def test_regression_cached_snapshot_does_not_advance_hysteresis(self):
        tracker = None
        for at in (NOW, NOW + 60, NOW + 120):
            tracker, emit, _ = C.step(tracker, CPU, OBS, at, host="gem", release_at=1.0)
            self.assertEqual(emit, [])
        self.assertEqual(tracker["published"], {})

    def test_regression_reported_waiting_without_eligible_demand_is_not_proof(self):
        tracker, _ = run([(CPU, {**OBS, "eligiblePoolByProvider": {"devin": 0, "grok": 0},
                                "maintenanceQueueByProvider": {"devin": 0, "grok": 0}})] * 3)
        self.assertEqual(tracker["published"], {})


    def test_pressure_samples_retain_timestamps_and_replay_latest_measurement(self):
        pressure = state({"devin": row(["host-ceiling"])}, load1=11.1)
        pressure["hostSample"]["psi"]["cpuSomeAvg10"] = 31.0
        tracker, out = run([(pressure, OBS)] * 3)
        self.assertIn("Observed " + A._iso(NOW + 120), out[2][0][0]["needs"])
        self.assertEqual(tracker["published"]["host-cpu"]["observedAt"], NOW + 120)
        newer = copy.deepcopy(pressure)
        newer["hostSample"]["load1"] = 12.3
        tracker, out = run([(newer, OBS)], tracker)
        self.assertEqual(out[0][0], [], "fresh jitter updates local evidence without a ping")
        self.assertEqual(tracker["published"]["host-cpu"]["observed"], 12.3)
        tracker, out = run([(newer, OBS)], tracker, release=2.0)
        self.assertEqual(out[0][0][0]["observed"], 12.3)
        self.assertIn(A._iso(NOW + 240), out[0][0][0]["needs"])
        self.assertEqual(out[0][0][0]["since"], A._iso(NOW))

    def test_stale_future_missing_and_out_of_order_observations_do_not_bind(self):
        for stamp in (NOW - A.STALE_S - 1, NOW + 1, None, True):
            snapshot = {**CPU, "observedAt": stamp}
            tracker = None
            for _ in range(3):
                tracker, emit, _ = C.step(tracker, snapshot, OBS, NOW, host="gem", release_at=1.0)
                self.assertEqual(emit, [])
            self.assertFalse(tracker["published"])
        tracker, _ = run([(CPU, OBS)] * 2)
        older = {**CPU, "observedAt": NOW}
        tracker, emit, _ = C.step(tracker, older, OBS, NOW + 120, host="gem", release_at=1.0)
        self.assertEqual(emit, [])
        self.assertFalse(tracker["published"])

    def test_cached_and_stale_calm_observations_do_not_clear_published_limit(self):
        tracker, _ = run([(CPU, OBS)] * 3)
        calm = state({"devin": row([], reason="sustained-demand")}, load1=1.0)
        calm["observedAt"] = NOW + 180
        for now in (NOW + 180, NOW + 240, NOW + 300, NOW + 1000):
            tracker, emit, _ = C.step(tracker, calm, OBS, now, host="gem", release_at=1.0)
            self.assertEqual(emit, [])
        self.assertIn("host-cpu", tracker["published"])

    def test_unknown_eligible_demand_does_not_clear_a_supported_episode(self):
        tracker, _ = run([(CPU, OBS)] * 3)
        unknown = {**OBS, "eligiblePoolByProvider": {}, "maintenanceQueueByProvider": {}}
        tracker, out = run([(CPU, unknown)] * 3, tracker)
        self.assertTrue(all(not emit for emit, _ in out))
        self.assertIn("host-cpu", tracker["published"])

    def test_no_measured_pressure_and_io_pressure_never_default_to_cpu(self):
        low = state({"devin": row(["psi-high"])}, load1=3.8)
        low["hostSample"]["psi"] = {"cpuSomeAvg10": 1.0, "memoryFullAvg10": 0.0, "ioFullAvg10": 31.0}
        tracker, out = run([(low, OBS)] * 3)
        self.assertFalse(tracker["published"])
        self.assertTrue(tracker["bottleneckFound"])
        self.assertTrue(all(not emit for emit, _ in out))

    def test_mixed_quota_auth_and_available_capacity_are_not_all_quota_limits(self):
        for attribution in (
            {"state": "cooldown", "quotaBanked": 1, "authCooldown": 1},
            {"state": "quota-banked", "quotaBanked": 1, "unleasedAvailable": 1},
            {"state": "unknown", "quotaBanked": 1},
        ):
            tracker, out = run([(state({"codex": row(["codex-unleased"])}),
                                 {**OBS, "codexAttribution": attribution})] * 3)
            self.assertFalse(tracker["published"])
            self.assertTrue(all(not emit for emit, _ in out))
        tracker, _ = run([(state({"codex": row(["codex-unleased"], demand=109, running=3, ceiling=3)}),
                           {**OBS, "codexAttribution": {"leased": 2, "loginSlots": 3}})] * 3)
        hold = tracker["software"][0]
        self.assertEqual((hold["configuredSeats"], hold["leased"], hold["providerHardLimit"]), (3, 2, "unknown"))
        self.assertEqual((hold["reportedWaiting"], hold["eligibleDemand"]), (109, 6))
        self.assertEqual((hold["deliveredThroughput"], hold["marginalThroughput"]), ("unknown", "unknown"))

    def test_pending_delivery_identities_survive_temporarily_unsupported_samples(self):
        tracker = {"outbox": [{"resource": "codex-accounts", "status": "limited", "deliveryId": "legacy-paid"},
                             {"resource": "host-cpu", "status": "limited", "deliveryId": "supported-retry"},
                             {"resource": "host-disk", "status": "cleared", "deliveryId": "clear-retry"}]}
        nxt, _, _ = C.step(tracker, CPU, OBS, NOW, host="gem", release_at=1.0)
        self.assertEqual([row["deliveryId"] for row in nxt["outbox"]], ["legacy-paid", "supported-retry", "clear-retry"])


    def test_unknown_demand_calm_rows_cannot_clear(self):
        tracker, _ = run([(CPU, OBS)] * 3)
        calm = state({"devin": row([], reason="sustained-demand")}, load1=1.0)
        unknown = {**OBS, "eligiblePoolByProvider": {}, "maintenanceQueueByProvider": {}}
        tracker, out = run([(calm, unknown)] * 3, tracker)
        self.assertTrue(all(not emit for emit, _ in out))
        self.assertIn("host-cpu", tracker["published"])

    def test_missing_pressure_cannot_clear(self):
        tracker, _ = run([(CPU, OBS)] * 3)
        missing = {**CPU, "hostSample": {}}
        tracker, out = run([(missing, OBS)] * 3, tracker)
        self.assertTrue(all(not emit for emit, _ in out))
        self.assertIn("host-cpu", tracker["published"])

    def test_stale_gap_preserves_pending_alert_and_resumes_same_identity(self):
        tracker, _ = run([(CPU, OBS)] * 3)
        pending = {"resource": "host-cpu", "status": "limited", "deliveryId": "same-supported-retry"}
        tracker["outbox"] = [pending]
        stale = {**CPU, "observedAt": NOW - A.STALE_S - 1}
        tracker, emit, _ = C.step(tracker, stale, OBS, NOW + 180, host="gem", release_at=1.0)
        self.assertEqual((emit, tracker["outbox"]), ([], [pending]))
        tracker, out = run([(CPU, OBS)], tracker, now=NOW + 240)
        self.assertEqual((out[0][0], tracker["outbox"]), ([], [pending]))


    def test_each_measured_resource_clears_only_on_supported_fresh_values(self):
        cases = (
            ("host-memory", state({"devin": row(["low-mem"])}, mem=4 * GIB), OBS,
             state({"devin": row([], reason="sustained-demand")}, load1=1.0), OBS),
            ("host-disk", state({"devin": row(["disk-low"])}),
             {**OBS, "disk": {"freePct": 12, "admitted": True}, "diskReclaimable": False},
             state({"devin": row([], reason="sustained-demand")}, load1=1.0), OBS),
            ("github-api-quota", state({"devin": row(["github-budget"])}), {**OBS, "githubRemaining": 900},
             state({"devin": row([], reason="sustained-demand")}, load1=1.0), OBS),
            ("codex-credits", state({"codex": row(["codex-unleased"])}),
             {**OBS, "codexAttribution": {"state": "quota-banked", "quotaBanked": 1}},
             state({"codex": row(["codex-unleased"])}),
             {**OBS, "codexAttribution": {"state": "unleased-available", "quotaBanked": 0, "unleasedAvailable": 1}}),
        )
        for resource, bound, obs, calm, clear_obs in cases:
            with self.subTest(resource=resource):
                tracker, _ = run([(bound, obs)] * 3)
                self.assertIn(resource, tracker["published"])
                tracker, out = run([(calm, clear_obs)] * 3, tracker)
                self.assertEqual(out[-1][0][0]["status"], "cleared")
                self.assertNotIn(resource, tracker["published"])

    def test_unknown_distinct_sample_breaks_clear_streak(self):
        tracker, _ = run([(CPU, OBS)] * 3)
        calm = state({"devin": row([], reason="sustained-demand")}, load1=1.0)
        tracker, _ = run([(calm, OBS)] * 2, tracker)
        tracker, _ = run([({**calm, "hostSample": {}}, OBS)], tracker)
        tracker, out = run([(calm, OBS)] * 2, tracker)
        self.assertTrue(all(not emit for emit, _ in out))
        self.assertIn("host-cpu", tracker["published"])


    def test_unknown_demand_breaks_partial_clear_streak(self):
        tracker, _ = run([(CPU, OBS)] * 3)
        calm = state({"devin": row([], reason="sustained-demand")}, load1=1.0)
        tracker, _ = run([(calm, OBS)] * 2, tracker)
        unknown = {**OBS, "eligiblePoolByProvider": {}, "maintenanceQueueByProvider": {}}
        tracker, _ = run([(CPU, unknown)], tracker)
        tracker, out = run([(calm, OBS)], tracker)
        self.assertFalse(out[0][0])
        self.assertEqual(tracker["seen"]["host-cpu"]["clear"], 1)

    def test_tick_retries_only_after_current_monotonic_support_returns(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config = {"origin": "https://summer.example", "keyId": "key-1", "pem": keypair()}
            calls = []
            def post(cfg, body):
                calls.append(body)
                return 500 if len(calls) == 1 else 202
            (root / "doctor.json").write_text(json.dumps({"observed": {"now": NOW}}))
            with patch.object(A, "collect", return_value=OBS):
                for at in (0, 60, 120):
                    A.write_state(root, {**CPU, "observedAt": NOW + at})
                    C.tick(root, {}, NOW + at, config=config, post=post)
                self.assertEqual(len(calls), 1)
                delivery_id = calls[0]["deliveryId"]
                for at, source_at in ((180, NOW - 1000), (240, NOW + 60)):
                    A.write_state(root, {**CPU, "observedAt": source_at})
                    C.tick(root, {}, NOW + at, config=config, post=post)
                    self.assertEqual(len(calls), 1)
                    self.assertEqual(json.loads((root / C.TRACKER_FILE).read_text())["outbox"][0]["deliveryId"], delivery_id)
                A.write_state(root, {**CPU, "observedAt": NOW + 300})
                C.tick(root, {}, NOW + 300, config=config, post=post)
                self.assertEqual((len(calls), calls[-1]["deliveryId"]), (2, delivery_id))
                self.assertEqual(json.loads((root / C.TRACKER_FILE).read_text())["outbox"], [])

    def test_legacy_hysteresis_and_since_cannot_certify_a_new_pressure_episode(self):
        legacy = {"seen": {"host-cpu": {"bound": 99, "clear": 0, "since": NOW - 3600}},
                  "published": {"host-cpu": {"lanes": ["devin", "grok"], "action": "add compute",
                                             "since": NOW - 3600, "observed": 3.8, "limit": 16}}}
        tracker, out = run([(CPU, OBS)] * 3, legacy, now=NOW)
        self.assertEqual([len(emit) for emit, _ in out], [0, 0, 1])
        self.assertEqual(out[-1][0][0]["since"], A._iso(NOW))


    def test_legacy_pending_body_is_quarantined_until_new_episode_qualifies(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            legacy_body = {"schema": C.SCHEMA, "resource": "host-cpu", "status": "limited", "host": "gem",
                           "lanes": ["devin", "grok"], "needs": "old low pressure",
                           "observed": 3.8, "limit": 16, "since": A._iso(NOW - 3600),
                           "unblock": {"action": "add compute", "estCost": "paid host"},
                           "deliveryId": "legacy-paid-host-0001"}
            tracker = {"seen": {"host-cpu": {"bound": 99, "clear": 0, "since": NOW - 3600}},
                       "published": {"host-cpu": {"lanes": ["devin", "grok"], "action": "add compute",
                                                  "since": NOW - 3600, "observed": 3.8, "limit": 16}},
                       "outbox": [legacy_body]}
            (root / C.TRACKER_FILE).write_text(json.dumps(tracker))
            (root / "doctor.json").write_text(json.dumps({"observed": {"now": NOW}}))
            config, calls = {"origin": "https://summer.example", "keyId": "key-1", "pem": keypair()}, []
            def post(cfg, body):
                calls.append(body)
                return 202
            with patch.object(A, "collect", return_value=OBS):
                for at in (0, 60, 120):
                    A.write_state(root, {**CPU, "observedAt": NOW + at})
                    C.tick(root, {}, NOW + at, config=config, post=post)
                    self.assertEqual(len(calls), int(at == 120))
            self.assertEqual(calls[0]["since"], A._iso(NOW))
            self.assertNotEqual(calls[0]["deliveryId"], legacy_body["deliveryId"])
            self.assertNotIn("estCost", calls[0]["unblock"])

    def test_canonical_and_signature_match_the_node_client_byte_for_byte(self):
        if not shutil.which("node"):
            self.skipTest("node is not installed")
        fixture = {"schema": C.SCHEMA, "status": "limited", "resource": "host-cpu", "host": "gem", "lanes": ["devin", "grok"],
                   "needs": "host-cpu: load 16.7 on 16 cores", "observed": 16.7, "limit": 16, "unit": "load1",
                   "since": "2026-10-12T02:00:00Z", "unblock": {"estCost": "x", "action": "add compute"},
                   "deliveryId": "gem:host-cpu:limited:1800000000", "sentAt": "2026-10-12T02:03:00Z", "signatureKeyId": "key-1",
                   "Zeta": [1, 2.5, None, True], "alpha": {"b": 1, "A": 2, "a": 3}}
        pem = keypair()
        script = ("import {canonical} from " + json.dumps(CLIENT.as_uri()) + ";import {createPrivateKey,sign} from 'node:crypto';"
                  "let d='';process.stdin.on('data',x=>d+=x).on('end',()=>{const j=JSON.parse(d);const m=Buffer.from("
                  + json.dumps(C.SCHEMA) + "+'\\0'+canonical(j.body));"
                  "process.stdout.write(JSON.stringify({c:canonical(j.body),s:sign(null,m,createPrivateKey(j.pem)).toString('base64url')}))})")
        done = subprocess.run(["node", "--input-type=module", "-e", script], input=json.dumps({"body": fixture, "pem": pem}),
                              capture_output=True, text=True, timeout=30, check=True)
        node = json.loads(done.stdout)
        self.assertEqual(C.canonical(fixture), node["c"])
        self.assertEqual(C.sign(f"{C.SCHEMA}\0{C.canonical(fixture)}".encode(), pem), node["s"])
        signed = C.signed_body({key: fixture[key] for key in fixture if key not in ("Zeta", "alpha", "sentAt", "signatureKeyId")},
                               {"keyId": "key-1", "pem": pem}, NOW)
        self.assertTrue(C.valid_body(signed))
        self.assertEqual((signed["sentAt"], signed["signature"][:8]), (A._iso(NOW), "ed25519="))

    def test_strict_shape_rejects_unknown_or_missing_fields(self):
        good = {"schema": C.SCHEMA, "status": "limited", "resource": "host-cpu", "host": "gem", "lanes": ["devin"],
                "needs": "x", "since": A._iso(NOW), "sentAt": A._iso(NOW), "deliveryId": "gem:host-cpu:limited:1800",
                "signatureKeyId": "key-1", "signature": "ed25519=x"}
        self.assertTrue(C.valid_body(good))
        for change in ({"extra": 1}, {"resource": "devin-credits"}, {"needs": ""}, {"needs": "x" * 201}, {"lanes": ["a"] * 21},
                       {"deliveryId": "short"}, {"observed": True}, {"unblock": {"action": "x", "other": "y"}}, {"since": "now"}):
            with self.subTest(change=change):
                self.assertFalse(C.valid_body({**good, **change}))
        self.assertTrue(C.valid_body({**{k: v for k, v in good.items() if k != "needs"}, "status": "cleared"}))

    def test_env_file_reads_multiline_pem_and_keeps_only_wanted_keys(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "signing.env"
            path.write_text('OTHER=1\nKEY_ID=k-1\nPEM="-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----"\nTAIL=2\n')
            self.assertEqual(C.read_env_file(path, ("KEY_ID", "PEM", "TAIL")),
                             {"KEY_ID": "k-1", "PEM": "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----", "TAIL": "2"})
            origin = Path(tmp) / "origin.env"
            env = {"LANES_SUMMER_ENV": str(origin), "LANES_SUMMER_SIGNING_ENV": str(path)}
            path.write_text('SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_KEY_ID=key-1\n'
                            'SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----"\n')
            for bad in ("http://summer.example", "https://summer.example/path", "https://localhost:8080", ""):
                origin.write_text(f"SUMMER_BOTTLENECK_ORIGIN={bad}\n")
                self.assertIsNone(C.summer_config(env), bad)
            origin.write_text("SUMMER_BOTTLENECK_ORIGIN=https://summer.example\n")
            self.assertEqual(C.summer_config(env)["origin"], "https://summer.example")
            self.assertIsNone(C.summer_config({"LANES_SUMMER_ENV": str(origin), "LANES_SUMMER_SIGNING_ENV": str(Path(tmp) / "missing")}))

    def test_tick_writes_the_record_and_delivers_without_blocking(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"SYMPHONY_AUTOSCALE": "apply"}):
            root = Path(tmp)
            (root / "doctor.json").write_text(json.dumps({"observed": {"now": NOW, "githubRemaining": 4000,
                "eligiblePoolByProvider": {"devin": 6, "grok": 3}, "maintenanceQueueByProvider": {"devin": 0, "grok": 0}}}))
            A.write_state(root, CPU)
            config, calls = {"origin": "https://summer.example", "keyId": "key-1", "pem": keypair()}, []
            def post(status):
                def send(cfg, body):
                    calls.append(body)
                    if status is None:
                        raise OSError("down")
                    return status
                return send
            self.assertIsNone(C.tick(root, {}, NOW, config=config, post=post(500)))
            A.write_state(root, {**CPU, "observedAt": NOW + 60})
            C.tick(root, {}, NOW + 60, config=config, post=post(500))
            A.write_state(root, {**CPU, "observedAt": NOW + 120})
            record = C.tick(root, {}, NOW + 120, config=config, post=post(None))
            self.assertEqual((record["schema"], record["bottleneckFound"], [r["resource"] for r in record["limited"]]),
                             (C.LOCAL_SCHEMA, False, ["host-cpu"]))
            self.assertEqual(C.read_record(root)["limited"][0]["lanes"], ["devin", "grok"])
            self.assertEqual(len(calls), 1); self.assertTrue(C.valid_body(calls[0]))
            tracker = json.loads((root / C.TRACKER_FILE).read_text())
            self.assertEqual(len(tracker["outbox"]), 1, "an undelivered record waits for the next tick")
            self.assertNotIn("PRIVATE", json.dumps(tracker))
            C.tick(root, {}, NOW + 180, config=config, post=post(500))
            self.assertEqual(len(json.loads((root / C.TRACKER_FILE).read_text())["outbox"]), 1)
            C.tick(root, {}, NOW + 240, config=config, post=post(422))
            self.assertEqual(json.loads((root / C.TRACKER_FILE).read_text())["outbox"], [], "422: never resend the same body")
            self.assertEqual(calls[-1]["deliveryId"], calls[0]["deliveryId"], "a retry keeps its delivery id")
            C.tick(root, {}, NOW + 300, config=config, post=post(202))
            self.assertEqual(len(calls), 3, "nothing changed, nothing sent")
            # No Summer config on this host: the record is still local, nothing queues.
            A.write_state(root, state({"devin": row([], reason="sustained-demand")}, load1=1.0))
            for at in (360, 420, 480):
                A.write_state(root, {**state({"devin": row([], reason="sustained-demand")}, load1=1.0), "observedAt": NOW + at})
                C.tick(root, {}, NOW + at, config={}, post=post(202))
            self.assertEqual(C.read_record(root)["limited"], [])
            self.assertEqual(json.loads((root / C.TRACKER_FILE).read_text())["outbox"], [])


if __name__ == "__main__":
    unittest.main()
