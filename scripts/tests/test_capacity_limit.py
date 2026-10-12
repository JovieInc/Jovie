"""Capacity-limit records: real limits only, on change, signed exactly like the Summer node client."""
from __future__ import annotations

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
       "maintenanceQueueByProvider": {}, "eligiblePoolByProvider": {}, "rateBankAt": {}}
CPU = state({"devin": row(["host-pressure"]), "grok": row(["host-pressure"], demand=3)})


def run(steps, tracker=None, release=1.0, now=NOW):
    out = []
    for current, obs in steps:
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
        self.assertIn("load 16.7 on 16 cores", body["needs"]); self.assertLessEqual(len(body["needs"]), 200)
        self.assertEqual(body["unblock"]["action"], C.UNBLOCK["host-cpu"][0])
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
        codex_busy = row(["codex-unleased"], running=3, effective=3, ceiling=3)
        cases = (
            ({"codex": codex_busy}, {**OBS, "codexAttribution": {"loginSlots": 3}}, "codex-accounts"),
            ({"codex": row(["codex-unleased"], running=0, effective=0, ceiling=0)},
             {**OBS, "codexAttribution": {"quotaBanked": 1, "earliestCooldownS": 3600}}, "codex-credits"),
            ({"codex": row(["rate-limited"])}, {**OBS, "rateBankAt": {"codex": NOW - 30}}, "codex-credits"),
            ({"hyperagent": row(["rate-bank"])}, {**OBS, "rateBankAt": {"hyperagent": NOW - 30}}, "claude-credits"),
            ({"devin": row(["disk-low"])}, {**OBS, "disk": {"admitted": True, "freePct": 12}, "diskReclaimable": False}, "host-disk"),
            ({"devin": row(["low-mem"])}, OBS, "host-memory"),
            ({"devin": row(["github-budget"])}, {**OBS, "githubRemaining": 900}, "github-api-quota"),
            ({"devin": row(["lane-ceiling"])}, OBS, "host-cpu"),
            ({"devin": row(["host-ceiling"])}, OBS, "host-cpu"),
        )
        for lanes, obs, resource in cases:
            with self.subTest(resource=resource, lanes=list(lanes)):
                _, out = run([(state(lanes), obs)] * 3)
                body = out[2][0][0]
                self.assertEqual(body["resource"], resource)
                body.update(sentAt=A._iso(NOW), deliveryId="gem:x:limited:1800000000", signatureKeyId="key-1", signature="ed25519=x")
                self.assertTrue(C.valid_body(body), body)
        _, out = run([(state({"codex": row(["codex-unleased"], running=0)}), {**OBS, "codexAttribution": {"quotaBanked": 1, "earliestCooldownS": 3600}})] * 3)
        self.assertIn("until", out[2][0][0])

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
            (root / "doctor.json").write_text(json.dumps({"observed": {"now": NOW, "githubRemaining": 4000}}))
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
            C.tick(root, {}, NOW + 60, config=config, post=post(500))
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
                C.tick(root, {}, NOW + at, config={}, post=post(202))
            self.assertEqual(C.read_record(root)["limited"], [])
            self.assertEqual(json.loads((root / C.TRACKER_FILE).read_text())["outbox"], [])


if __name__ == "__main__":
    unittest.main()
