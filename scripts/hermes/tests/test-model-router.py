#!/usr/bin/env python3
import json, os, pathlib, subprocess, tempfile, time, unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
ROUTER = ROOT / "scripts/hermes/model-router.py"
CONFIG = ROOT / "scripts/hermes/config/model-registry.json"

class RegistryTests(unittest.TestCase):
    def run_router(self, *args, env=None):
        e = os.environ.copy()
        e.update({
            "GEM_CURSOR_EXECUTABLE": "/missing",
            "GEM_KIMI_EXECUTABLE": "/missing",
            "GEM_GROK_EXECUTABLE": "/missing",
            "GEM_CLAUDE_EXECUTABLE": "/missing",
            "GEM_DEEPSEEK_EXECUTABLE": "/missing",
            "GEM_PR_DRAIN_CODEX": "/missing",
        })
        e.update(env or {})
        return subprocess.run(["python3", str(ROUTER), *args], text=True, capture_output=True, env=e, check=True)

    def test_schema_and_chains(self):
        cfg = json.loads(CONFIG.read_text())
        self.assertEqual(cfg["schema_version"], 1)
        self.assertTrue(cfg["deterministic_first"])
        ids = {m["id"] for m in cfg["models"]}
        self.assertTrue({
            "cursor-grok-4.6", "grok-4.6", "kimi-k3",
            "kimi-coding", "cursor-luna", "qwen-coder-local", "deepseek-v4-flash",
            "codex-luna", "codex-terra", "codex-sol",
        } <= ids)
        self.assertNotIn("claude", ids)
        self.assertNotIn("cursor-composer-2.5", ids)
        self.assertFalse(any(model.get("exception_only") for model in cfg["models"]))
        self.assertEqual(cfg["models"][next(i for i, m in enumerate(cfg["models"]) if m["id"] == "codex-luna")]["family"], "gpt-5.6")
        self.assertEqual(
            cfg["route_chains"]["new_pr"][:4],
            ["cursor-grok-4.6", "grok-4.6", "codex-sol", "codex-terra"],
        )
        self.assertEqual(
            cfg["route_chains"]["remediation"][:3],
            ["cursor-grok-4.6", "grok-4.6", "codex-sol"],
        )
        self.assertGreater(
            cfg["route_chains"]["new_pr"].index("qwen-coder-local"),
            cfg["route_chains"]["new_pr"].index("cursor-luna"),
        )

    def test_remediation_rejects_executor_without_isolated_cwd(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            ready = root / "ollama"
            ready.write_text("#!/bin/sh\necho qwen3-coder:30b\n")
            ready.chmod(0o755)
            agent = root / "hermes"
            agent.write_text("#!/bin/sh\nexit 0\n")
            agent.chmod(0o755)
            registry = json.loads(CONFIG.read_text())
            qwen_model = next(model for model in registry["models"] if model["id"] == "qwen-coder-local")
            qwen_model.pop("agent_cwd_mode")
            registry_path = root / "model-registry.json"
            registry_path.write_text(json.dumps(registry))
            result = self.run_router(
                "choose", "--workflow", "remediation", "--capability", "mechanical",
                env={
                    "GEM_MODEL_REGISTRY": str(registry_path),
                    "GEM_MODEL_ROUTER_STATE": str(root / "state.json"),
                    "GEM_PR_DRAIN_QWEN": str(ready),
                    "GEM_QWEN_AGENT_EXECUTABLE": str(agent),
                },
            )
            document = json.loads(result.stdout)
            qwen = next(item for item in document["candidates"] if item["id"] == "qwen-coder-local")
            self.assertEqual(qwen["reason"], "executor_invalid")
            self.assertIsNone(document["selected"])

    def test_remediation_accepts_executor_bound_to_process_cwd(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            ready = root / "ollama"
            ready.write_text("#!/bin/sh\necho qwen3-coder:30b\n")
            ready.chmod(0o755)
            agent = root / "hermes"
            agent.write_text("#!/bin/sh\nexit 0\n")
            agent.chmod(0o755)
            result = self.run_router(
                "choose", "--workflow", "remediation", "--capability", "mechanical",
                env={
                    "GEM_MODEL_ROUTER_STATE": str(root / "state.json"),
                    "GEM_PR_DRAIN_QWEN": str(ready),
                    "GEM_QWEN_AGENT_EXECUTABLE": str(agent),
                },
            )
            selected = json.loads(result.stdout)["selected"]
            self.assertEqual(selected["id"], "qwen-coder-local")
            self.assertEqual(selected["executor"]["executable"], str(agent))

    def test_codex_is_first_class_not_hidden(self):
        with tempfile.TemporaryDirectory() as td:
            state = pathlib.Path(td) / "state.json"
            out = self.run_router("choose", "--workflow", "remediation", "--capability", "mechanical", env={"GEM_MODEL_ROUTER_STATE": str(state), "GEM_PR_DRAIN_QWEN": "/missing", "GEM_DEEPSEEK_EXECUTABLE": "/missing", "GEM_GROK_EXECUTABLE": "/missing", "GEM_PR_DRAIN_CODEX": "/missing"})
            doc = json.loads(out.stdout)
            self.assertIsNone(doc["selected"])
            self.assertIn("codex-luna", [x["id"] for x in doc["candidates"]])

    def test_dry_probe_is_json(self):
        doc = json.loads(self.run_router("probe").stdout)
        self.assertIn("qwen-coder-local", doc)

    def test_ready_local_qwen_has_a_tool_capable_executor_contract(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            probe = root / "ollama"
            probe.write_text("#!/bin/sh\necho qwen3-coder:30b\n")
            probe.chmod(0o755)
            agent = root / "hermes"
            agent.write_text("#!/bin/sh\nexit 0\n")
            agent.chmod(0o755)
            result = self.run_router(
                "choose", "--workflow", "new_pr", "--capability", "code",
                env={
                    "GEM_MODEL_ROUTER_STATE": str(root / "state.json"),
                    "GEM_PR_DRAIN_QWEN": str(probe),
                    "GEM_QWEN_AGENT_EXECUTABLE": str(agent),
                },
            )
            selected = json.loads(result.stdout)["selected"]
            self.assertEqual(selected["id"], "qwen-coder-local")
            self.assertEqual(selected["provider"], "ollama")
            self.assertEqual(selected["model"], "qwen3-coder:30b")
            self.assertEqual(selected["executor"]["executable"], str(agent))
            self.assertIn("{prompt}", selected["executor"]["argv"])

    def _ready(self, root, name, output):
        path = root / name
        path.write_text("#!/bin/sh\n" + output)
        path.chmod(0o755)
        return path

    def test_cursor_grok_beats_local_when_cursor_cli_is_ready(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            cursor = self._ready(root, "cursor-agent", "echo cursor-agent 0.0.0\n")
            result = self.run_router(
                "choose", "--workflow", "new_pr", "--capability", "code",
                env={
                    "GEM_MODEL_ROUTER_STATE": str(root / "state.json"),
                    "GEM_CURSOR_EXECUTABLE": str(cursor),
                    "GEM_GROK_EXECUTABLE": "/missing",
                    "GEM_KIMI_EXECUTABLE": "/missing",
                    "GEM_CLAUDE_EXECUTABLE": "/missing",
                    "GEM_DEEPSEEK_EXECUTABLE": "/missing",
                    "GEM_PR_DRAIN_QWEN": "/missing",
                    "GEM_PR_DRAIN_CODEX": "/missing",
                },
            )
            selected = json.loads(result.stdout)["selected"]
            self.assertEqual(selected["id"], "cursor-grok-4.6")
            self.assertEqual(selected["pool"], "cursor-models")
            self.assertEqual(selected["provider"], "cursor")

    def test_exhausted_cursor_pool_degrades_to_grok_build_then_kimi(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            cursor = self._ready(root, "cursor-agent", "echo cursor-agent 0.0.0\n")
            grok = self._ready(root, "grok", "echo grok-4.6\n")
            kimi = self._ready(root, "kimi", "echo 0.34.0\n")
            state = {
                "pools": {
                    "cursor-models": {"exhausted_until": time.time() + 3600, "uses": 9},
                    "grok-build": {"exhausted_until": time.time() + 3600, "uses": 9},
                }
            }
            state_path = root / "state.json"
            state_path.write_text(json.dumps(state))
            result = self.run_router(
                "choose", "--workflow", "new_pr", "--capability", "code",
                env={
                    "GEM_MODEL_ROUTER_STATE": str(state_path),
                    "GEM_CURSOR_EXECUTABLE": str(cursor),
                    "GEM_GROK_EXECUTABLE": str(grok),
                    "GEM_KIMI_EXECUTABLE": str(kimi),
                    "GEM_CLAUDE_EXECUTABLE": "/missing",
                    "GEM_DEEPSEEK_EXECUTABLE": "/missing",
                    "GEM_PR_DRAIN_QWEN": "/missing",
                    "GEM_PR_DRAIN_CODEX": "/missing",
                },
            )
            document = json.loads(result.stdout)
            self.assertEqual(document["selected"]["id"], "kimi-k3")
            self.assertEqual(document["selected"]["pool"], "kimi")
            reasons = {item["id"]: item.get("reason") for item in document["candidates"]}
            self.assertEqual(reasons["cursor-grok-4.6"], "pool_exhausted")
            self.assertEqual(reasons["grok-4.6"], "pool_exhausted")

    def test_same_quality_pools_load_balance_toward_the_lesser_used(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            cursor = self._ready(root, "cursor-agent", "echo cursor-agent 0.0.0\n")
            grok = self._ready(root, "grok", "echo grok-4.6\n")
            state_path = root / "state.json"
            state_path.write_text(json.dumps({
                "pools": {
                    "cursor-models": {"exhausted_until": 0, "uses": 8},
                    "grok-build": {"exhausted_until": 0, "uses": 1},
                }
            }))
            result = self.run_router(
                "choose", "--workflow", "new_pr", "--capability", "code",
                env={
                    "GEM_MODEL_ROUTER_STATE": str(state_path),
                    "GEM_CURSOR_EXECUTABLE": str(cursor),
                    "GEM_GROK_EXECUTABLE": str(grok),
                    "GEM_KIMI_EXECUTABLE": "/missing",
                    "GEM_CLAUDE_EXECUTABLE": "/missing",
                    "GEM_DEEPSEEK_EXECUTABLE": "/missing",
                    "GEM_PR_DRAIN_QWEN": "/missing",
                    "GEM_PR_DRAIN_CODEX": "/missing",
                },
            )
            selected = json.loads(result.stdout)["selected"]
            self.assertEqual(selected["id"], "grok-4.6")
            self.assertEqual(selected["pool"], "grok-build")

    def test_quota_probe_marks_the_pool_exhausted(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            grok = self._ready(root, "grok", "echo 'weekly usage limit reached' >&2\nexit 1\n")
            kimi = self._ready(root, "kimi", "echo 0.34.0\n")
            state_path = root / "state.json"
            first = self.run_router(
                "choose", "--workflow", "new_pr", "--capability", "code",
                env={
                    "GEM_MODEL_ROUTER_STATE": str(state_path),
                    "GEM_CURSOR_EXECUTABLE": "/missing",
                    "GEM_GROK_EXECUTABLE": str(grok),
                    "GEM_KIMI_EXECUTABLE": str(kimi),
                    "GEM_CLAUDE_EXECUTABLE": "/missing",
                    "GEM_DEEPSEEK_EXECUTABLE": "/missing",
                    "GEM_PR_DRAIN_QWEN": "/missing",
                    "GEM_PR_DRAIN_CODEX": "/missing",
                },
            )
            self.assertEqual(json.loads(first.stdout)["selected"]["id"], "kimi-k3")
            persisted = json.loads(state_path.read_text())
            self.assertGreater(persisted["pools"]["grok-build"]["exhausted_until"], time.time())

    def test_included_grok_beats_ready_gateway(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            grok = self._ready(root, "grok", "echo grok-4.6\n")
            deepseek = self._ready(root, "hermes", "echo ok\n")
            result = self.run_router(
                "choose", "--workflow", "new_pr", "--capability", "code",
                env={
                    "GEM_MODEL_ROUTER_STATE": str(root / "state.json"),
                    "GEM_GROK_EXECUTABLE": str(grok),
                    "GEM_DEEPSEEK_EXECUTABLE": str(deepseek),
                    "GEM_PR_DRAIN_QWEN": "/missing",
                    "GEM_PR_DRAIN_CODEX": "/missing",
                },
            )
            selected = json.loads(result.stdout)["selected"]
            self.assertEqual(selected["id"], "grok-4.6")
            self.assertEqual(selected["marginal_usd"], 0.0)
            self.assertEqual(selected["channel"], "subscription")

    def test_sol_api_is_refused_when_codex_sub_is_the_cheaper_buy(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            registry = json.loads(CONFIG.read_text())
            for model in registry["models"]:
                if model["id"] == "deepseek-v4-flash" and "architecture" not in model["capabilities"]:
                    model["capabilities"].append("architecture")
            registry["models"].append({
                "id": "sol-api",
                "provider": "vercel-ai-gateway",
                "model": "openai/gpt-5.6-sol",
                "family": "gpt-5.6",
                "channel": "api",
                "pool": "vercel-gateway",
                "quality": 88,
                "list_price_in": 5.0,
                "list_price_out": 30.0,
                "capabilities": ["code", "architecture"],
                "cost_tier": "gateway-budgeted-paid",
                "executable_env": "GEM_DEEPSEEK_EXECUTABLE",
                "executable_default": "/missing",
                "agent_executable_env": "GEM_DEEPSEEK_EXECUTABLE",
                "agent_executable_default": "/missing",
                "agent_cwd_mode": "process",
                "agent_argv": ["{prompt}"],
                "probe_argv": ["{executable}", "--help"],
                "probe_mode": "exit-zero",
            })
            registry["route_chains"]["new_pr"] = ["sol-api", "deepseek-v4-flash", "qwen-coder-local"]
            registry_path = root / "model-registry.json"
            registry_path.write_text(json.dumps(registry))
            gateway = self._ready(root, "hermes", "echo ok\n")
            state_path = root / "state.json"
            state_path.write_text(json.dumps({
                "pools": {
                    "codex": {"exhausted_until": time.time() + 3600, "uses": 40},
                    "cursor-other-models": {"exhausted_until": time.time() + 3600, "uses": 9},
                },
                "api_spend": {"gpt-5.6": 28.0},
            }))
            result = self.run_router(
                "choose", "--workflow", "new_pr", "--capability", "architecture",
                env={
                    "GEM_MODEL_REGISTRY": str(registry_path),
                    "GEM_MODEL_ROUTER_STATE": str(state_path),
                    "GEM_DEEPSEEK_EXECUTABLE": str(gateway),
                    "GEM_PR_DRAIN_QWEN": "/missing",
                    "GEM_PR_DRAIN_CODEX": "/missing",
                },
            )
            document = json.loads(result.stdout)
            self.assertEqual(document["selected"]["id"], "deepseek-v4-flash")
            sol = next(item for item in document["candidates"] if item["id"] == "sol-api")
            self.assertEqual(sol["reason"], "renew_sub_not_api")
            self.assertEqual(sol["renew_subscription"]["sub_monthly_usd"], 200)
            self.assertEqual(sol["renew_subscription"]["effective_included_usd"], 800.0)

if __name__ == "__main__": unittest.main()
