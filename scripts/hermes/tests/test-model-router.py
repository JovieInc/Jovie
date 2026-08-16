#!/usr/bin/env python3
import json, os, pathlib, subprocess, tempfile, unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
ROUTER = ROOT / "scripts/hermes/model-router.py"
CONFIG = ROOT / "scripts/hermes/config/model-registry.json"

class RegistryTests(unittest.TestCase):
    def run_router(self, *args, env=None):
        e = os.environ.copy(); e.update(env or {})
        return subprocess.run(["python3", str(ROUTER), *args], text=True, capture_output=True, env=e, check=True)

    def test_schema_and_chains(self):
        cfg = json.loads(CONFIG.read_text())
        self.assertEqual(cfg["schema_version"], 1)
        self.assertTrue(cfg["deterministic_first"])
        ids = {m["id"] for m in cfg["models"]}
        self.assertTrue({"qwen-coder-local", "deepseek-v4-flash", "grok-4.6", "claude", "codex-luna", "codex-terra", "codex-sol"} <= ids)
        self.assertEqual(cfg["route_chains"]["remediation"][:3], ["qwen-coder-local", "deepseek-v4-flash", "grok-4.6"])

    def test_remediation_rejects_executor_without_isolated_cwd(self):
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
                    "GEM_DEEPSEEK_EXECUTABLE": "/missing",
                    "GEM_GROK_EXECUTABLE": "/missing",
                    "GEM_CLAUDE_EXECUTABLE": "/missing",
                    "GEM_PR_DRAIN_CODEX": "/missing",
                },
            )
            document = json.loads(result.stdout)
            self.assertEqual(document["candidates"][0]["reason"], "executor_invalid")
            self.assertIsNone(document["selected"])

    def test_codex_is_exception_only(self):
        with tempfile.TemporaryDirectory() as td:
            state = pathlib.Path(td) / "state.json"
            out = self.run_router("choose", "--workflow", "remediation", "--capability", "mechanical", env={"GEM_MODEL_ROUTER_STATE": str(state), "GEM_PR_DRAIN_QWEN": "/missing", "GEM_DEEPSEEK_EXECUTABLE": "/missing", "GEM_GROK_EXECUTABLE": "/missing", "GEM_CLAUDE_EXECUTABLE": "/missing", "GEM_PR_DRAIN_CODEX": "/missing"})
            doc = json.loads(out.stdout)
            self.assertIsNone(doc["selected"])
            self.assertNotIn("codex-terra", [x["id"] for x in doc["candidates"]])

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

if __name__ == "__main__": unittest.main()
