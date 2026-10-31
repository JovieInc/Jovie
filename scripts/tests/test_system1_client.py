"""System-1 Python entry point: a provider failure returns a null decision, never raises."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import system1  # noqa: E402


class System1ClientTest(unittest.TestCase):
    def test_failed_call_is_logged_and_returns_null_decision(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = {
                "HOME": tmp,
                "JOVIE_SYSTEM1_STATE": os.path.join(tmp, "system1"),
                "PATH": os.environ.get("PATH", ""),
            }
            old = dict(os.environ)
            os.environ.clear()
            os.environ.update(env)
            try:
                result = system1.call("backlog-readiness", "Title: x", key="JOV-1", timeout=30)
                system1.label("backlog-readiness", "JOV-1", "ready", source="test")
            finally:
                os.environ.clear()
                os.environ.update(old)
            self.assertEqual(result["status"], "error")
            self.assertIsNone(result["decision"])
            calls = list(Path(tmp, "system1", "calls").glob("*.jsonl"))
            self.assertEqual(len(calls), 1)
            self.assertEqual(json.loads(calls[0].read_text().splitlines()[0])["key"], "JOV-1")
            labels = Path(tmp, "system1", "labels.jsonl").read_text().splitlines()
            self.assertEqual(json.loads(labels[0])["label"], "ready")


if __name__ == "__main__":
    unittest.main()
