"""Credits-first provider order: credit-backed first, pay-as-you-go last, fall through only on zero
credits or a credits/quota-exhausted error, never the Vercel AI Gateway, never an unpriced model."""
import io
import json
import os
import sys
import tempfile
import types
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "swarm"), str(HERE.parent), str(HERE.parent / "lanes")]
for name, attrs in (("fix_red_classes", {"AGENT": "agent", "RERUN": "rerun", "RENUMBER": "renumber",
                                         "REGISTER_DOMAIN": "register-domain", "BIOME_FORMAT": "biome",
                                         "WIRE_CI_FAST": "wire-ci-fast", "classify": None,
                                         "owner_handoff_reason": lambda cls: None}),
                    ("model_pool_calls", {"request_refusal": lambda *a, **k: None}),
                    ("apiclient", {}), ("apiclient.gh", {"run_gh": None})):
    try:
        __import__(name)
    except ImportError:
        sys.modules[name] = types.SimpleNamespace(**attrs)
import provider_order as po  # noqa: E402
import pr_remediation_swarm as sw  # noqa: E402

FLASH = "@cf/zai-org/glm-5.3-flash"


class Order(unittest.TestCase):
    def test_off_without_base_url_has_no_gateway_fallback(self):
        self.assertEqual(po.resolve({})[0], [])
        with mock.patch.dict(os.environ, {"SWARM_BASE_URL": "https://ai-gateway.vercel.sh/v1"}, clear=True):
            self.assertEqual(sw.gateway_base(), "")
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(sw.gateway_base(), "", "main fell back to ai-gateway.vercel.sh here")

    def test_on_orders_credits_prepaid_payg_and_refuses_gateway(self):
        rows = [{"name": "paygo", "base_url": "https://p.example/v1", "key_file_env": "K3", "funding": "payg"},
                {"name": "gw", "base_url": "https://ai-gateway.vercel.sh/v1", "key_file_env": "K4", "funding": "credits"},
                {"name": "pre", "base_url": "https://q.example/v1", "key_file_env": "K2", "funding": "prepaid"},
                {"name": "cf", "base_url": "https://r.example/v1", "key_file_env": "K1", "funding": "credits"}]
        got, refused = po.resolve({"SWARM_PROVIDER_ORDER": "on", "SWARM_PROVIDERS": json.dumps(rows)})
        self.assertEqual([p.name for p in got], ["cf", "pre", "paygo"])
        self.assertTrue(any("Gateway is banned" in r for r in refused))

    def test_switch_is_exact_on(self):
        rows = json.dumps([{"name": "paygo", "base_url": "https://p.example/v1", "key_file_env": "K", "funding": "payg"}])
        for v in (None, "", "ON", "true"):
            env = {"SWARM_PROVIDERS": rows, "SWARM_BASE_URL": "https://relay.example/v1"}
            if v is not None:
                env["SWARM_PROVIDER_ORDER"] = v
            self.assertEqual([p.name for p in po.resolve(env)[0]], ["workers-ai-relay"], v)

    def test_prices_are_per_model_and_unpriced_is_refused(self):
        relay = po.Provider("r", "https://r.example/v1", "K", "credits")
        self.assertAlmostEqual(po.price(relay, "@cf/zai-org/glm-5.3")["out"], 4.40e-6)
        self.assertAlmostEqual(po.price(relay, FLASH)["cached"], 0.03e-6)
        self.assertIsNone(po.price(relay, "@cf/vendor/unknown"))
        self.assertAlmostEqual(po.cost({"in": 1e6, "cached": 1e6, "out": 1e6, "reasoning": 1e6}, po.price(relay, FLASH)),
                               0.15 + 0.03 + 0.50 + 0.50)

    def test_exhausted_is_not_rate_limited(self):
        for t in ("HTTP Error 402: Payment Required", '{"error":"insufficient_funds"}', "monthly quota exceeded",
                  "Your access to the Claude API has been disabled because your organization is out of usage credits"):
            self.assertTrue(po.exhausted(t), t)
        for t in ("HTTP Error 429: rate limited", "upstream error 502"):
            self.assertFalse(po.exhausted(t), t)


class FakeProc:
    def __init__(self, events):
        self.stdout = io.StringIO("".join(json.dumps(e) + "\n" for e in events))

    def poll(self):
        return 0

    def kill(self):
        pass


def step(inp, out):
    return {"type": "step", "part": {"tokens": {"input": inp, "output": out}}}


class FallThrough(unittest.TestCase):
    def run_agent(self, providers, picks, streams, tiers="credit,oop", models=FLASH):
        """providers: [(name, funding)]; picks: name -> exception or None; streams: name -> events."""
        d = tempfile.mkdtemp()
        rows, env = [], {"SWARM_MODEL_MODE": "on", "SWARM_PROVIDER_ORDER": "on", "SWARM_TIERS": tiers,
                         "SWARM_MODELS": models, "SWARM_ATTEMPT_USD_CAP": "0.10"}
        for name, funding in providers:
            kf = Path(d, f"key-{name}")
            kf.write_text("k")
            env[f"KF_{name}"] = str(kf)
            rows.append({"name": name, "base_url": f"https://{name}.example/v1", "key_file_env": f"KF_{name}", "funding": funding})
        env["SWARM_PROVIDERS"] = json.dumps(rows)
        Path(d, "plan.json").write_text(json.dumps({"pr": 1, "sha": "abc", "checks": ["lint"], "cls": "lint"}))
        Path(d, "log").write_text("Error: boom")
        called = []

        def pick(base, key, cands, prov=None):
            name = base.split("//")[1].split(".")[0]
            called.append(("models", name))
            if picks.get(name):
                raise picks[name]
            for c in cands:
                unit = po.price(prov, c)
                if unit:
                    return c, unit
            raise SystemExit("no priced candidate model available")

        def popen(argv, cwd, env, **_):
            name = json.loads(env["OPENCODE_CONFIG_CONTENT"])["provider"]["swarm"]["options"]["baseURL"].split("//")[1].split(".")[0]
            called.append(("run", name))
            return FakeProc(streams.get(name, []))
        a = types.SimpleNamespace(plan=str(Path(d, "plan.json")), meta=str(Path(d, "meta.json")),
                                  key_file=str(Path(d, "legacy-key")), log=str(Path(d, "log")), cwd=d, max_steps=8, timeout=600)
        with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(sw, "pick_model", pick), \
                mock.patch.object(sw.subprocess, "Popen", popen), mock.patch.object(sw, "sh"), \
                mock.patch.object(sw, "named_files", return_value=""):
            sw.cmd_agent(a)
        meta = json.loads(Path(a.meta).read_text())
        self.assertFalse(any(Path(d).glob("key-*")), "every staged key is removed")
        return meta, json.loads(Path(a.plan).read_text()), called

    def test_credits_first_then_payg_on_402(self):
        meta, _plan, called = self.run_agent([("payg", "payg"), ("cf", "credits")],
                                             {"cf": urllib.error.HTTPError("u", 402, "Payment Required", {}, None)},
                                             {"payg": [step(10_000, 1_000)]})
        self.assertEqual(called, [("models", "cf"), ("models", "payg"), ("run", "payg")])
        self.assertEqual(meta["creditUsd"], 0)
        self.assertGreater(meta["oopUsd"], 0)
        self.assertIn("cf:exhausted", meta["providersTried"])

    def test_rate_limit_does_not_fall_through_to_paid(self):
        meta, plan, called = self.run_agent([("cf", "credits"), ("payg", "payg")],
                                            {"cf": urllib.error.HTTPError("u", 429, "rate limited", {}, None)}, {})
        self.assertNotIn(("models", "payg"), called)
        self.assertEqual(meta["costUsd"], 0)
        self.assertTrue(plan["reason"].startswith("agent-relay-unreachable"))

    def test_midstream_exhaustion_keeps_spend_and_shares_the_attempt_cap(self):
        flash = po.PRICES[FLASH]
        burn = int(0.08 / flash["in"])  # $0.08 of input on credits before the credits error
        meta, _plan, called = self.run_agent(
            [("cf", "credits"), ("payg", "payg")], {},
            {"cf": [step(burn, 0), {"type": "error", "error": {"message": "credits exhausted"}}],
             "payg": [step(burn, 0)]})  # another $0.08 would pass the $0.10 attempt cap
        self.assertAlmostEqual(meta["creditUsd"], 0.08, places=4)
        self.assertLessEqual(meta["costUsd"], 0.10 + 0.08)  # at most one step past the cap, as on main
        self.assertTrue(meta["aborted"].startswith("attempt-cap"))
        self.assertEqual(called[-1], ("run", "payg"))

    def test_payg_never_called_when_its_tier_was_not_admitted(self):
        meta, plan, called = self.run_agent([("cf", "credits"), ("payg", "payg")],
                                            {"cf": urllib.error.HTTPError("u", 402, "Payment Required", {}, None)},
                                            {}, tiers="credit")
        self.assertNotIn(("models", "payg"), called)
        self.assertEqual(plan["outcome"], "blocked-credits")
        self.assertEqual(meta["costUsd"], 0)

    def test_unpriced_model_is_never_run(self):
        meta, plan, called = self.run_agent([("cf", "credits")], {}, {}, models="@cf/vendor/unknown")
        self.assertNotIn(("run", "cf"), called)
        self.assertEqual(meta["costUsd"], 0)


if __name__ == "__main__":
    unittest.main()
