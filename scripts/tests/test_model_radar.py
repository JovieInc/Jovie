"""Deterministic coverage for the model radar (scripts/lanes/model_radar.py)."""
from __future__ import annotations

import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("model_radar", ROOT / "scripts/lanes/model_radar.py")
radar = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(radar)


def proc(stdout="", code=0):
    return SimpleNamespace(returncode=code, stdout=stdout, stderr="")


GATEWAY = {"data": [
    {"id": "zai/glm-5.3-flash", "type": "language", "released": 100, "pricing": {"input": "0.00000015", "output": "0.0000005"}, "context_window": 1000},
    {"id": "anthropic/claude-sonnet-5.5", "type": "language", "released": 300, "pricing": {"input": "0.000002", "output": "0.00001"}},
    {"id": "spacexai/grok-4.7", "type": "language", "released": 200, "pricing": {}},
]}
WORKERS = [
    {"name": "@cf/cloudflare/clef", "task": {"name": "Text Generation"}, "created_at": "2026-09-29 14:05:24.552",
     "description": "Clef is a decision model.", "properties": [{"property_id": "context_window", "value": "65536"},
                                                                 {"property_id": "price", "value": [{"unit": "per M input tokens", "price": 0.24}]}]},
    {"name": "@cf/cloudflare/clairic", "task": {"name": "Text Generation"}, "created_at": "2026-10-14 05:34:04.680",
     "description": "Can extract, compute and forecast values.", "properties": [{"property_id": "price", "value": [
         {"unit": "per M input tokens", "price": 0.1}, {"unit": "per M output tokens", "price": 0.0}]}]},
]
ANTHROPIC = "\n".join(json.dumps(m) for m in [
    {"id": "claude-sonnet-5-5", "created_at": "2026-09-28T00:00:00Z", "max_input_tokens": 1000000, "lifecycle": "active"},
    {"id": "claude-sonnet-5", "created_at": "2026-06-29T00:00:00Z", "lifecycle": "active"},
])


def fake_run(overrides=None):
    outputs = {"wrangler": proc(json.dumps(WORKERS)), "ant": proc(ANTHROPIC),
               "hyperagent": proc(json.dumps({"models": {"z-ai/glm-5.3": {}}})), "gbrain": proc("signals/changelog/a/b  t\n"),
               "jovie-research": proc()}
    outputs.update(overrides or {})
    calls = []

    def run(args, **kwargs):
        calls.append(args)
        out = outputs[args[0]]
        if isinstance(out, Exception):
            raise out
        return out
    run.calls = calls
    return run


REGISTRY = {"schema": radar.REGISTRY_SCHEMA, "channels": {"subscription-claude": "", "gateway-allowlist": "", "workers-ai": "", "subscription-grok": ""},
            "tasks": [
                {"id": "layout", "taskType": "x", "currentModel": "anthropic/claude-sonnet-5", "channel": "subscription-claude",
                 "sourcePath": "a.ts", "sourceMatch": "claude-sonnet-5", "costUsd": 0, "qualityMetric": "q",
                 "evalStatus": "partial", "screens": ["same-family-successor"]},
                {"id": "triage", "taskType": "x", "currentModel": "typesafe-ai/jev", "channel": "gateway-allowlist",
                 "sourcePath": "missing.mjs", "sourceMatch": "jev", "sourcePending": "PR", "costUsd": 0, "qualityMetric": "q",
                 "evalStatus": "ready", "screens": ["workers-ai-decision", "workers-ai-extraction"]},
                {"id": "chain", "taskType": "x", "currentModel": "grok-4.6", "channel": "subscription-grok",
                 "sourcePath": "a.ts", "sourceMatch": "claude", "costUsd": None, "qualityMetric": "q",
                 "evalStatus": "live-ab", "screens": ["same-family-successor"],
                 "candidates": ["@cf/cloudflare/clairic"]},
            ]}


class RegistryTests(unittest.TestCase):
    def test_repository_registry_is_valid_and_matches_sources(self):
        self.assertEqual(radar.validate_registry(radar.load_registry()), [])

    def test_drift_and_structure_errors(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "a.ts").write_text("model: 'anthropic/claude-sonnet-5.5'")
            reg = json.loads(json.dumps(REGISTRY))
            reg["tasks"][0]["sourceMatch"] = "claude-opus-4"
            reg["tasks"][1].pop("sourcePending")
            reg["tasks"][2]["channel"] = "nope"
            reg["tasks"][2]["screens"] = ["bogus"]
            reg["tasks"][2]["evalStatus"] = "great"
            reg["tasks"].append(dict(reg["tasks"][0]))
            del reg["tasks"][-1]["qualityMetric"]
            errors = radar.validate_registry({**reg, "schema": "x"}, Path(tmp))
        text = "\n".join(errors)
        for needle in ("schema must be", "no longer contains 'claude-opus-4'", "missing.mjs does not exist", "unknown channel nope",
                       "unknown screen bogus", "evalStatus", "duplicate id", "qualityMetric is required"):
            self.assertIn(needle, text)

    def test_pending_source_is_skipped_until_it_lands(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "a.ts").write_text("claude-sonnet-5 claude")
            self.assertEqual(radar.validate_registry(REGISTRY, Path(tmp)), [])

    def test_gateway_allowlist_parses_policy_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "ai.ts"
            path.write_text("export const GATEWAY_ALLOWED_MODELS: readonly string[] = [\n  'typesafe-ai/jev',\n  'zai/glm-5.3',\n];")
            self.assertEqual(radar.gateway_allowlist(path), {"typesafe-ai/jev", "zai/glm-5.3"})
            self.assertEqual(radar.gateway_allowlist(Path(tmp) / "none.ts"), set())
        self.assertIn("zai/glm-5.3-flash", radar.gateway_allowlist())


class CatalogTests(unittest.TestCase):
    def test_normalizers(self):
        gw = radar.normalize_gateway(GATEWAY)
        self.assertEqual(gw["gateway:zai/glm-5.3-flash"]["priceIn"], 0.15)
        self.assertIsNone(gw["gateway:spacexai/grok-4.7"]["priceIn"])
        wk = radar.normalize_workers(WORKERS)
        self.assertEqual(wk["workers:@cf/cloudflare/clef"]["context"], 65536)
        self.assertEqual(wk["workers:@cf/cloudflare/clairic"]["priceIn"], 0.1)
        self.assertIsNotNone(wk["workers:@cf/cloudflare/clef"]["released"])
        an = radar.normalize_anthropic(radar.parse_json_stream(ANTHROPIC))
        self.assertEqual(an["anthropic:claude-sonnet-5-5"]["context"], 1000000)
        self.assertEqual(radar.normalize_hyperagent({"models": {"astra": {}}})["hyperagent:astra"]["source"], "hyperagent")
        self.assertIn("elevenlabs:eleven_v3", radar.normalize_elevenlabs([{"model_id": "eleven_v3"}, {}]))
        self.assertEqual(len(radar.parse_json_stream('{"data": [{"id": "a"}, {"id": "b"}]}')), 2)
        self.assertIsNone(radar._epoch("not a date"))
        self.assertIsNone(radar._epoch(None))

    def test_fetch_catalog_isolates_failed_sources(self):
        run = fake_run({"ant": proc("", 1), "hyperagent": FileNotFoundError("\x1b[31mhyperagent\x1b[0m")})
        models, status = radar.fetch_catalog(run=run, fetch=lambda url, headers=None: GATEWAY, env={})
        self.assertTrue(status["gateway"].startswith("ok"))
        self.assertTrue(status["anthropic"].startswith("failed"))
        self.assertTrue(status["hyperagent"].startswith("failed"))
        self.assertNotIn("\x1b", status["hyperagent"])
        self.assertIn("skipped", status["elevenlabs"])
        self.assertIn("workers:@cf/cloudflare/clef", models)
        _, status = radar.fetch_catalog(run=fake_run(), fetch=lambda url, headers=None: [{"model_id": "eleven_v3"}] if "eleven" in url else GATEWAY,
                                        env={"ELEVENLABS_API_KEY": "k"})
        self.assertTrue(status["elevenlabs"].startswith("ok"))

    def test_diff_catalog_events(self):
        prev = {"a": {"source": "gateway", "id": "a", "priceIn": 1}, "b": {"source": "gateway", "id": "b"},
                "c": {"source": "anthropic", "id": "c", "lifecycle": "active"}, "d": {"source": "workers", "id": "d"}}
        cur = {"a": {"source": "gateway", "id": "a", "priceIn": 2}, "c": {"source": "anthropic", "id": "c", "lifecycle": "deprecated"},
               "e": {"source": "gateway", "id": "e"}}
        cur["f"] = {"source": "elevenlabs", "id": "f"}  # first sight of a source is a baseline...
        cur["g"] = {"source": "elevenlabs", "id": "g", "released": 9_000_000}  # ...except recent releases
        cur["h"] = {"source": "elevenlabs", "id": "h", "released": 1}
        events = {(e["type"], e["key"]) for e in radar.diff_catalog(prev, cur, {"workers"}, now=10_000_000)}
        self.assertEqual(events, {("changed", "a"), ("removed", "b"), ("deprecated", "c"), ("new", "e"), ("new", "g")})

    def test_identity_and_successors(self):
        self.assertEqual(radar.model_identity("claude-sonnet-5-5"), radar.model_identity("anthropic/claude-sonnet-5.5"))
        self.assertNotEqual(radar.model_identity("zai/glm-5.3-flash")[0], radar.model_identity("zai/glm-5.3-flashx")[0])
        self.assertEqual(radar.model_identity("claude-haiku-4-5-20251001"), ("anthropic/claude-haiku", (4, 5)))
        self.assertEqual(radar.model_identity("moonshotai/kimi-k3"), ("moonshotai/kimi-k", (3,)))
        self.assertEqual(radar.model_identity("z-ai/glm-5.3")[0], "zai/glm")
        self.assertTrue(radar.is_variant("anthropic/claude-opus-5.5-batch"))
        catalog = {"g1": {"source": "gateway", "id": "anthropic/claude-sonnet-5.5", "kind": "language"},
                   "g2": {"source": "gateway", "id": "anthropic/claude-sonnet-5.5-batch", "kind": "language"},
                   "g3": {"source": "gateway", "id": "anthropic/claude-sonnet-4.6", "kind": "language"},
                   "g4": {"source": "gateway", "id": "x/embed-9", "kind": "embedding"}}
        self.assertEqual([m["key"] for m in radar.successors("claude-sonnet-5", catalog)], ["g1"])
        self.assertEqual(radar.successors("codex-default", catalog), [])

    def test_channel_policy(self):
        allow = {"zai/glm-5.3"}
        gw = {"channel": "gateway-allowlist"}
        self.assertIn("JOV-7119", radar.channel_policy(gw, {"source": "gateway", "id": "openai/gpt-6"}, allow))
        self.assertIn("JOV-7119", radar.channel_policy({"channel": "vendor-api"}, {"source": "anthropic", "id": "claude-haiku-5-5"}, allow))
        self.assertIn("JOV-8109", radar.channel_policy(gw, {"source": "gateway", "id": "deepseek/x"}, allow))
        self.assertIsNone(radar.channel_policy(gw, {"source": "gateway", "id": "zai/glm-5.3"}, allow))
        self.assertIsNone(radar.channel_policy({"channel": "gateway-image"}, {"source": "gateway", "id": "x/img"}, allow))
        self.assertIn("channel change", radar.channel_policy(gw, {"source": "workers", "id": "@cf/x"}, allow))
        self.assertIsNone(radar.channel_policy({"channel": "subscription-claude"}, {"source": "anthropic", "id": "c"}, allow))
        self.assertIn("gateway", radar.channel_policy({"channel": "subscription-claude"}, {"source": "gateway", "id": "x"}, allow))
        self.assertIsNone(radar.channel_policy({"channel": "workers-ai"}, {"source": "workers", "id": "@cf/x"}, allow))
        self.assertIn("workers-ai", radar.channel_policy({"channel": "workers-ai"}, {"source": "gateway", "id": "x"}, allow))
        self.assertIsNone(radar.channel_policy({"channel": "hyperagent-credits"}, {"source": "hyperagent", "id": "x"}, allow))
        self.assertIn("hyperagent", radar.channel_policy({"channel": "hyperagent-credits"}, {"source": "gateway", "id": "x"}, allow))
        self.assertIsNone(radar.channel_policy({"channel": "subscription-grok"}, {"source": "gateway", "id": "x"}, allow))

    def test_screen_rows(self):
        catalog = {**radar.normalize_gateway(GATEWAY), **radar.normalize_workers(WORKERS), **radar.normalize_anthropic(radar.parse_json_stream(ANTHROPIC))}
        rows = radar.screen(REGISTRY, catalog, {"zai/glm-5.3-flash"})
        got = {(r["task"], r["candidate"], r["policy"] == "eligible") for r in rows}
        self.assertIn(("layout", "claude-sonnet-5-5", True), got)
        self.assertNotIn(("layout", "anthropic/claude-sonnet-5.5", False), got)  # channel-compatible successor wins
        self.assertIn(("triage", "@cf/cloudflare/clef", False), got)
        self.assertIn(("triage", "@cf/cloudflare/clairic", False), got)
        self.assertIn(("chain", "spacexai/grok-4.7", True), got)
        self.assertIn(("chain", "@cf/cloudflare/clairic", True), got)


class AdoptionTests(unittest.TestCase):
    def test_verdicts(self):
        base = {"success": 20, "n": 28, "usd": 0.04}
        self.assertEqual(radar.verdict(base, {"success": 28, "n": 28, "usd": 0.04})["decision"], "adopt")
        self.assertEqual(radar.verdict(base, {"success": 21, "n": 28, "usd": 0.01})["decision"], "adopt")
        self.assertEqual(radar.verdict(base, {"success": 8, "n": 28, "usd": 0.001})["decision"], "reject")
        self.assertEqual(radar.verdict(base, {"success": 22, "n": 28, "usd": 0.05})["decision"], "re-evaluate")
        pricey = radar.verdict(base, {"success": 28, "n": 28, "usd": 2.0})
        self.assertEqual((pricey["decision"], pricey["why"][:6]), ("re-evaluate", "better"))
        self.assertIsNone(radar.verdict({"success": 0, "n": 5, "usd": 1}, {"success": 0, "n": 5, "usd": 1})["costPerSuccessRatio"])
        self.assertTrue(radar.needs_approval(25.01))
        self.assertFalse(radar.needs_approval(25))

    def test_decision_page_and_record(self):
        d = {"title": "Clairic for CI triage", "context": "ctx", "options": [{"name": "reject", "summary": "s"}, {"name": "adopt", "summary": "t"}],
             "chosen": "reject", "evidence": ["gbrain:models/radar/2026-10-20"], "shipNow": "keep Jev", "reevaluateWhen": ["GA"], "then": "rerun"}
        page = radar.decision_page(d, "2026-10-20")
        for needle in ("type: decision", "chosen: \"reject\"", "**reject** (chosen)", "**Re-evaluate when:** GA", "- gbrain:models"):
            self.assertIn(needle, page)
        puts = []
        with patch.object(radar.shutil, "which", return_value=None):
            ok, slug = radar.record_decision(d, put=lambda s, t, b: (puts.append(s), (True, None))[1], today="2026-10-20")
        self.assertEqual((ok, slug, puts), (True, "decisions/models/clairic-for-ci-triage", [slug]))
        with patch.object(radar.shutil, "which", return_value=None):
            ok, msg = radar.record_decision(d, put=lambda s, t, b: (False, "read-back"), today="2026-10-20")
        self.assertFalse(ok)
        self.assertIn("read-back", msg)
        with tempfile.TemporaryDirectory() as tmp, patch.object(radar, "DEFAULT_STATE", Path(tmp) / "s.json"), \
                patch.object(radar.shutil, "which", return_value="/bin/jovie-research"):
            run = fake_run()
            ok, slug = radar.record_decision(d, run=run, put=lambda *a: (False, "unused"))
        self.assertTrue(ok)
        self.assertEqual(run.calls[0][:3], ["jovie-research", "decision", "record"])
        with self.assertRaises(ValueError):
            radar.record_decision({**d, "reevaluateWhen": []})
        with self.assertRaises(ValueError):
            radar.record_decision({**d, "chosen": "maybe"})


class DetectTests(unittest.TestCase):
    def test_baseline_then_events_and_failed_source_retention(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / "state.json"
            pages = {}
            put = lambda slug, title, body: (pages.__setitem__(slug, body), (True, None))[1]
            fetch = lambda url, headers=None: GATEWAY
            with patch.object(radar.shutil, "which", return_value=None):
                first = radar.detect(state, run=fake_run(), fetch=fetch, put=put, now=1_800_000_000, registry=REGISTRY)
            self.assertTrue(first["baseline"])
            self.assertEqual(first["events"]["new"], 0)  # fixtures were released long before `now`
            self.assertIn("models/radar/2027-01-15", pages)
            more = {"data": GATEWAY["data"] + [{"id": "anthropic/claude-sonnet-6", "type": "language", "released": 400}]}
            run = fake_run({"wrangler": proc("", 1)})
            with patch.object(radar.shutil, "which", return_value="/bin/jovie-research"):
                second = radar.detect(state, run=run, fetch=lambda url, headers=None: more, put=put, now=1_800_100_000, registry=REGISTRY)
            self.assertEqual(second["events"], {"new": 1, "changed": 0, "deprecated": 0, "removed": 0})
            self.assertTrue(any(s.startswith("models/events/2027-01-16/gateway-anthropic-claude-sonnet-6") for s in pages))
            self.assertTrue(any(c[:3] == ["jovie-research", "decision", "trigger"] for c in run.calls))
            saved = json.loads(state.read_text())
            self.assertIn("workers:@cf/cloudflare/clef", saved["catalog"])  # failed source keeps last snapshot
            self.assertIn("signals/changelog/a/b", pages["models/radar/2027-01-16"])
            failing = radar.detect(state, run=fake_run(), fetch=fetch, put=lambda *a: (False, "down"), now=1_800_200_000,
                                   registry=REGISTRY, dry_run=False)
            self.assertEqual(failing["status"], "failed")
            dry = radar.detect(Path(tmp) / "dry.json", run=fake_run(), fetch=fetch, put=put, dry_run=True, registry=REGISTRY)
            self.assertFalse((Path(tmp) / "dry.json").exists())
            self.assertEqual(dry["status"], "ok")

    def test_pages_render(self):
        event = {"type": "changed", "model": {"id": "m", "source": "gateway", "description": "d"}, "changes": {"priceIn": [1, 2]}}
        self.assertIn("changes", radar.event_page(event, "2026-10-20T00:00:00Z"))
        digest = radar.digest_page("2026-10-20", {"gateway": "ok"}, [], [], [])
        self.assertIn("- none", digest)
        self.assertEqual(radar.lab_news(fake_run({"gbrain": RuntimeError("x")})), [])

    def test_read_state_rejects_foreign_schema(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "s.json"
            path.write_text(json.dumps({"schema": "other", "catalog": {"x": 1}}))
            self.assertEqual(radar.read_state(path), {"schema": radar.STATE_SCHEMA})
            path.write_text("not json")
            self.assertEqual(radar.read_state(path), {"schema": radar.STATE_SCHEMA})

    def test_tick_schedules_once_a_day(self):
        with tempfile.TemporaryDirectory() as tmp:
            spawned = []
            first = radar.tick(Path(tmp), spawn=lambda args, **kw: spawned.append(args), now=1000.0)
            second = radar.tick(Path(tmp), spawn=lambda args, **kw: spawned.append(args), now=1001.0)
        self.assertEqual((first["status"], second["status"], len(spawned)), ("scheduled", "current", 1))
        self.assertEqual(spawned[0][2], "detect")
        with patch.object(radar.yc_corpus, "selftest", return_value=True):
            self.assertEqual(radar.tick(Path("/nonexistent")), {"status": "selftest-skipped"})

    def test_cli(self):
        with patch.object(radar, "detect", return_value={"status": "ok", "rows": [{"task": "t", "current": "c", "candidate": "d", "policy": "eligible"}],
                                                          "eventList": []}):
            self.assertEqual(radar.main(["detect", "--dry-run"]), 0)
            self.assertEqual(radar.main(["detect", "--json"]), 0)
        self.assertEqual(radar.main(["validate"]), 0)
        with tempfile.TemporaryDirectory() as tmp:
            f = Path(tmp) / "d.json"
            f.write_text("{}")
            with patch.object(radar, "record_decision", return_value=(True, "decisions/models/x")):
                self.assertEqual(radar.main(["record-decision", "--file", str(f)]), 0)

    def test_default_effects_refuse_under_selftest(self):
        with patch.object(radar.yc_corpus, "selftest", return_value=True):
            with self.assertRaises(radar.yc_corpus.SelftestEffectRefused):
                radar.default_run(["wrangler", "ai"])
            with self.assertRaises(radar.yc_corpus.SelftestEffectRefused):
                radar.default_fetch("https://example.com")


if __name__ == "__main__":
    unittest.main()
