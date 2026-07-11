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
        self.assertTrue({"qwen-coder-local", "deepseek-v4-flash", "grok-composer-2.5-fast", "claude", "codex-luna", "codex-terra", "codex-sol"} <= ids)
        self.assertEqual(cfg["route_chains"]["remediation"][:3], ["qwen-coder-local", "deepseek-v4-flash", "grok-composer-2.5-fast"])

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

if __name__ == "__main__": unittest.main()
