"""SWARM_MODEL_MODE is a fail-closed kill switch on every model path (select, prepare, agent)."""
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "swarm"), str(HERE.parent), str(HERE.parent / "lanes")]


def _stub_if_missing(name, **attrs):
    """The repo has these siblings; a bare checkout of this file alone (e.g. a replay box) gets stubs."""
    try:
        __import__(name)
    except ImportError:
        sys.modules[name] = types.SimpleNamespace(**attrs)


_stub_if_missing("fix_red_classes", AGENT="agent", RERUN="rerun", RENUMBER="renumber", REGISTER_DOMAIN="register-domain",
                 BIOME_FORMAT="biome", WIRE_CI_FAST="wire-ci-fast", classify=None, owner_handoff_reason=lambda cls: None)
_stub_if_missing("model_pool_calls", request_refusal=lambda *a, **k: None)
_stub_if_missing("apiclient")
_stub_if_missing("apiclient.gh", run_gh=None)
import pr_remediation_swarm as sw  # noqa: E402


class ModelModeIsFailClosed(unittest.TestCase):
    def test_only_exact_on_opens(self):
        for value, want in ((None, False), ("", False), ("off", False), ("ON", False), ("true", False), ("on", True)):
            env = {k: v for k, v in os.environ.items() if k != "SWARM_MODEL_MODE"}
            if value is not None:
                env["SWARM_MODEL_MODE"] = value
            with mock.patch.dict(os.environ, env, clear=True):
                self.assertIs(sw.model_mode_on(), want, value)

    def test_agent_makes_no_model_call_when_off(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.dict(os.environ, {}, clear=True), \
                mock.patch.object(sw.subprocess, "Popen", side_effect=AssertionError("model call")), \
                mock.patch.object(sw, "pick_model", side_effect=AssertionError("model list")):
            plan, meta, key = Path(d, "plan.json"), Path(d, "meta.json"), Path(d, "key")
            plan.write_text(json.dumps({"pr": 1, "sha": "abc"}))
            key.write_text("k")
            a = types.SimpleNamespace(plan=str(plan), meta=str(meta), key_file=str(key), log="", cwd=d,
                                      max_steps=8, timeout=600)
            self.assertEqual(sw.cmd_agent(a), 0)
            self.assertEqual(json.loads(meta.read_text())["costUsd"], 0)
            self.assertEqual(json.loads(plan.read_text())["reason"], "model-mode-off")
            self.assertFalse(key.exists(), "the staged key is removed")

    def test_prepare_skips_before_claim_when_off(self):
        """Off must not claim or leave a receipt, or turning the switch on later finds `already-handled-sha`."""
        cls = {"cls": "lint", "key": "fp1", "action": sw.classes.AGENT, "files": [], "checks": ["lint"], "signature": "s"}
        with tempfile.TemporaryDirectory() as d, mock.patch.dict(os.environ, {}, clear=True), \
                mock.patch.object(sw, "latest_failures", return_value=([{"name": "lint", "conclusion": "failure"}], False)), \
                mock.patch.object(sw, "job_log_tail", return_value="src/a.ts:1 Error: boom"), \
                mock.patch.object(sw.classes, "classify", return_value=cls, create=True), \
                mock.patch.object(sw.classes, "owner_handoff_reason", return_value=None, create=True), \
                mock.patch.object(sw, "concrete_error", return_value=True), \
                mock.patch.object(sw, "receipts_for", return_value={"fp": 0, "sha": 0}), \
                mock.patch.object(sw, "take_claim", side_effect=AssertionError("claimed")), \
                mock.patch.object(sw, "out_var"):
            plan_path = Path(d, "plan.json")
            a = types.SimpleNamespace(agent="true", plan=str(plan_path), log=str(Path(d, "log")))
            sw.prepare_red(a, {"pr": 7, "sha": "abc"}, {"mergeable_state": "blocked"})
            plan = json.loads(plan_path.read_text())
            self.assertEqual((plan["reason"], plan["action"]), ("model-budget-closed", "none"))


if __name__ == "__main__":
    unittest.main()
