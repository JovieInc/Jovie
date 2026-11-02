"""Hyperagent board bridge: transport errors retry with backoff and never kill the loop."""
import importlib.util
import io
import json
import os
import ssl
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def load():
    os.environ.pop("MESH_TOKEN_FILE", None)
    os.environ["BRIDGE_STATE"] = tempfile.mkdtemp()
    spec = importlib.util.spec_from_file_location("board_bridge", ROOT / "scripts/hyperagent/board_bridge.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def ssl_eof():
    return urllib.error.URLError(ssl.SSLEOFError(8, "UNEXPECTED_EOF_WHILE_READING"))


class HubTransportTest(unittest.TestCase):
    def setUp(self):
        self.bridge = load()

    def test_ssl_eof_retries_then_succeeds(self):
        calls, sleeps = [], []

        def opener(req, timeout):
            calls.append(req.full_url)
            if len(calls) < 3:
                raise ssl_eof()
            return Response(json.dumps({"ok": True, "messages": []}).encode())

        out = self.bridge.hub("GET", "/v1/mailbox?wait=25", retries=5, sleep=sleeps.append, opener=opener)
        self.assertEqual(out, {"ok": True, "messages": []})
        self.assertEqual(len(calls), 3)
        self.assertEqual(len(sleeps), 2)
        self.assertTrue(all(0 < s <= self.bridge.BACKOFF_MAX_S for s in sleeps))

    def test_persistent_transport_failure_returns_receipt_instead_of_raising(self):
        def opener(req, timeout):
            raise ssl_eof()

        out = self.bridge.hub("GET", "/v1/mailbox?wait=25", retries=2, sleep=lambda s: None, opener=opener)
        self.assertIs(out["ok"], False)
        self.assertIn("URLError", out["transport"])

    def test_http_error_is_a_receipt_not_a_retry(self):
        calls = []

        def opener(req, timeout):
            calls.append(1)
            raise urllib.error.HTTPError(req.full_url, 409, "conflict", {}, io.BytesIO(b'{"code":"taken"}'))

        out = self.bridge.hub("POST", "/v1/board/claim", {"id": "x"}, retries=3, sleep=lambda s: None, opener=opener)
        self.assertEqual(out, {"ok": False, "status": 409, "code": "taken"})
        self.assertEqual(len(calls), 1)

    def test_backoff_is_capped(self):
        self.assertLessEqual(self.bridge.backoff_s(30), self.bridge.BACKOFF_MAX_S)

    def test_unreachable_tick_reports_failure_and_main_survives_exceptions(self):
        with patch.object(self.bridge, "hub", return_value={"ok": False, "transport": "x"}):
            self.assertFalse(self.bridge.tick({"last_scan": 9e18, "failures": 0}))
        ticks = iter([RuntimeError("boom"), False, KeyboardInterrupt()])

        def tick(state):
            value = next(ticks)
            if isinstance(value, BaseException):
                raise value
            return value

        with patch.object(self.bridge, "hub", return_value={"ok": True}), \
                patch.object(self.bridge, "tick", side_effect=tick), \
                patch.object(self.bridge.time, "sleep") as sleep:
            with self.assertRaises(KeyboardInterrupt):
                self.bridge.main()
        self.assertEqual(sleep.call_count, 2)


if __name__ == "__main__":
    unittest.main()
