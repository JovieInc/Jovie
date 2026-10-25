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
            first = CL.tick(state, now=NOW, registry=REGISTRY, grok=grok)
            self.assertEqual(first["status"], "written")
            live = json.loads((state / "capacity-live.json").read_text())
            self.assertEqual(sorted(live["accounts"]), ["openai-codex/lyb-pro", "xai-grok/supergrok-heavy"])
            self.assertEqual(CL.tick(state, now=NOW + 60, registry=REGISTRY, grok=grok)["status"], "current")
            self.assertEqual(CL.tick(state, now=NOW + CL.INTERVAL_S + 1, registry=REGISTRY, grok=grok)["status"], "written")
            self.assertEqual(CR.read_live(state)["accounts"]["xai-grok/supergrok-heavy"]["quota"]["usedPercent"], 63)

    def test_quota_windows_feed_the_coordination_burn_plan(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {}, clear=False):
            for key in ("LANES_SELFTEST", "LANES_EXECUTION_BACKEND"):
                os.environ.pop(key, None)
            state = Path(tmp)
            (state / "codex-accounts.json").write_text(json.dumps({"lyb-pro": ledger_row("7f31f3ffca1c", 41, 1793382060, observed="2026-10-25T01:59:00Z")}))
            grok = lambda now: {"quota": {"usedPercent": 63, "resetsAt": "2026-10-26T21:01:00Z", "windowMins": 10080, "observedAt": CL._iso(now), "source": "grok"}}  # noqa: E731
            CL.tick(state, now=NOW, registry=REGISTRY, grok=grok)
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
