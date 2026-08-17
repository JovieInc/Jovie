#!/usr/bin/env python3
import json
import os
import pathlib
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
RESEARCH = ROOT / "scripts/hermes/model-registry-research.py"
ROUTER = ROOT / "scripts/hermes/model-router.py"
CONFIG = ROOT / "scripts/hermes/config/model-registry.json"
SNAPSHOT = ROOT / "scripts/hermes/config/model-research/2026-08-17-central-registry.json"
EVALS = ROOT / "scripts/hermes/tests/fixtures/model-routing-evals.json"


class ResearchAndEvalTests(unittest.TestCase):
    def run_py(self, script, *args, env=None):
        merged = os.environ.copy()
        merged.update(env or {})
        return subprocess.run(
            ["python3", str(script), *args],
            text=True,
            capture_output=True,
            env=merged,
            check=True,
        )

    def test_live_registry_validates(self):
        out = json.loads(self.run_py(ROUTER, "validate").stdout)
        self.assertTrue(out["ok"])

    def test_research_apply_is_idempotent_and_writes_strengths(self):
        with tempfile.TemporaryDirectory() as td:
            registry_path = pathlib.Path(td) / "model-registry.json"
            registry_path.write_text(CONFIG.read_text())
            first = json.loads(
                self.run_py(
                    RESEARCH,
                    "apply",
                    "--snapshot",
                    str(SNAPSHOT),
                    "--config",
                    str(registry_path),
                    "--write",
                ).stdout
            )
            self.assertTrue(first["ok"])
            updated = json.loads(registry_path.read_text())
            luna = next(model for model in updated["models"] if model["id"] == "codex-luna")
            self.assertIn("mrcr-recall-cliff", luna["weaknesses"])
            self.assertEqual(luna["family"], "gpt-5.6")
            second = json.loads(
                self.run_py(
                    RESEARCH,
                    "apply",
                    "--snapshot",
                    str(SNAPSHOT),
                    "--config",
                    str(registry_path),
                    "--write",
                ).stdout
            )
            self.assertEqual(second["applied"], [])

    def test_research_rejects_claude(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            registry_path = root / "model-registry.json"
            registry_path.write_text(CONFIG.read_text())
            snapshot = {
                "schema": "model-research/v1",
                "source": "test",
                "updates": [{"id": "claude", "quality": 1}],
            }
            snap_path = root / "bad.json"
            snap_path.write_text(json.dumps(snapshot))
            out = json.loads(
                self.run_py(
                    RESEARCH,
                    "apply",
                    "--snapshot",
                    str(snap_path),
                    "--config",
                    str(registry_path),
                ).stdout
            )
            self.assertEqual(out["rejected"][0]["reason"], "unknown_model")

    def test_eval_cases_match_research_backed_choices(self):
        cases = json.loads(EVALS.read_text())["cases"]
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            bins = {}
            for name, output in (
                ("cursor-agent", "echo cursor\n"),
                ("grok", "echo grok-4.6\n"),
                ("kimi", "echo 0.34.0\n"),
                ("codex", "echo GEM_MODEL_READY\n"),
                ("hermes", "echo ok\n"),
                ("ollama", "echo qwen3-coder:30b\n"),
            ):
                path = root / name
                path.write_text("#!/bin/sh\n" + output)
                path.chmod(0o755)
                bins[name] = path
            env = {
                "GEM_CURSOR_EXECUTABLE": str(bins["cursor-agent"]),
                "GEM_GROK_EXECUTABLE": str(bins["grok"]),
                "GEM_KIMI_EXECUTABLE": str(bins["kimi"]),
                "GEM_PR_DRAIN_CODEX": str(bins["codex"]),
                "GEM_DEEPSEEK_EXECUTABLE": str(bins["hermes"]),
                "GEM_PR_DRAIN_QWEN": str(bins["ollama"]),
                "GEM_QWEN_AGENT_EXECUTABLE": str(bins["hermes"]),
            }
            for case in cases:
                with self.subTest(case=case["id"]):
                    state = {"pools": {}}
                    for pool in case.get("exhausted", []):
                        state["pools"][pool] = {"exhausted_until": 4_000_000_000, "uses": 9}
                    state_path = root / f"{case['id']}.json"
                    state_path.write_text(json.dumps(state))
                    result = self.run_py(
                        ROUTER,
                        "choose",
                        "--workflow",
                        "new_pr",
                        "--capability",
                        case["capability"],
                        env={**env, "GEM_MODEL_ROUTER_STATE": str(state_path)},
                    )
                    selected = json.loads(result.stdout)["selected"]
                    self.assertIsNotNone(selected, case)
                    self.assertEqual(selected["id"], case["expect"])


if __name__ == "__main__":
    unittest.main()
