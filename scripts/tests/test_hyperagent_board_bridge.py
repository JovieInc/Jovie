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

        with patch.object(self.bridge, "TOKEN", "test-token"), \
                patch.object(self.bridge, "hub", return_value={"ok": True}), \
                patch.object(self.bridge, "tick", side_effect=tick), \
                patch.object(self.bridge.time, "sleep") as sleep:
            with self.assertRaises(KeyboardInterrupt):
                self.bridge.main()
        self.assertEqual(sleep.call_count, 2)


class RuntimeLifecycleTest(unittest.TestCase):
    def setUp(self):
        self.bridge = load()
        self.task = {"id": "task-1", "poster": "claude", "title": "Check", "body": "question"}

    def cli(self, responses):
        from unittest.mock import Mock
        return {"resolve_agent": Mock(return_value=("real-agent", "Runtime")),
                "mcp_call": Mock(side_effect=responses), "THREAD_URL": "https://hyperagent.com/thread/{thread_id}",
                "last_assistant_text": lambda thread: thread.get("answer")}

    def test_thread_runs_until_real_answer_and_renews_board_lease(self):
        cli = self.cli([{"threadId": "abc"}, {"isRunning": True}, {"answer": "result"}])
        with patch.object(self.bridge.time, "time", side_effect=[0, 0, 1, 300, 301, 302, 303, 304]), \
                patch.object(self.bridge.time, "sleep"), patch.object(self.bridge, "hub") as hub:
            out = self.bridge.run_thread(cli, self.task)
        self.assertEqual(out, ("result", None, "https://hyperagent.com/thread/abc", "Runtime"))
        self.assertEqual(hub.call_args.args[1], "/v1/board/update")

    def test_direct_runtime_never_updates_board_lease(self):
        cli = self.cli([{"threadId": "abc"}, {"answer": "nonce"}])
        with patch.object(self.bridge.time, "sleep"), patch.object(self.bridge, "hub") as hub:
            out = self.bridge.run_thread(cli, {**self.task, "direct": True})
        hub.assert_not_called()
        self.assertEqual(out[0], "nonce")

    def test_provider_approval_is_preserved(self):
        cli = self.cli([{"threadId": "abc"}, {"awaitingApproval": True}])
        with patch.object(self.bridge.time, "sleep"):
            out = self.bridge.run_thread(cli, self.task)
        self.assertIsNone(out[0])
        self.assertIn("awaits an approval", out[1])

    def test_model_budget_finalization_happens_once(self):
        error = {"messages": [{"role": "error", "content": "budget exhausted"}]}
        cli = self.cli([{"threadId": "abc"}, error, {}, error])
        with patch.object(self.bridge.time, "sleep"):
            out = self.bridge.run_thread(cli, self.task)
        self.assertIsNone(out[0])
        self.assertEqual(sum(c.args[0] == "send_message" for c in cli["mcp_call"].call_args_list), 1)

    def test_timeout_keeps_original_provider_reference(self):
        cli = self.cli([{"threadId": "abc"}])
        with patch.object(self.bridge, "TIMEOUT", 0):
            out = self.bridge.run_thread(cli, self.task)
        self.assertIn("timed out", out[1])
        self.assertEqual(out[2], "https://hyperagent.com/thread/abc")

    def test_missing_thread_id_fails_closed(self):
        with self.assertRaisesRegex(RuntimeError, "no threadId"):
            self.bridge.run_thread(self.cli([{}]), self.task)

    def test_board_work_success_failure_claim_race_and_budget(self):
        self.bridge.STATE.mkdir(parents=True, exist_ok=True)
        for text, error in [("deliverable", None), (None, "failed")]:
            with patch.object(self.bridge, "hub", side_effect=[{"claimed": True}, {"ok": True}]) as hub, \
                    patch("runpy.run_path", return_value={}), \
                    patch.object(self.bridge, "run_thread", return_value=(text, error, "thread", "agent")):
                self.bridge.work(self.task)
            self.assertEqual(hub.call_args.args[2]["status"], "done" if text else "failed")
        with patch.object(self.bridge, "hub", return_value={"claimed": False}), \
                patch.object(self.bridge, "run_thread") as run:
            self.bridge.work(self.task)
        run.assert_not_called()
        with patch.object(self.bridge, "RUNS_PER_DAY", 0), patch.object(self.bridge, "hub") as hub:
            self.bridge.work(self.task)
        hub.assert_not_called()

    def test_board_executor_exception_becomes_failed_result(self):
        self.bridge.STATE.mkdir(parents=True, exist_ok=True)
        with patch.object(self.bridge, "hub", side_effect=[{"claimed": True}, {"ok": True}]) as hub, \
                patch("runpy.run_path", side_effect=RuntimeError("unavailable")):
            self.bridge.work(self.task)
        self.assertEqual(hub.call_args.args[2]["status"], "failed")

    def test_eligible_board_notice_and_deadman_work_remain_enabled(self):
        task = {**self.task, "caps": ["hyperagent"], "postedAt": 1, "status": "open"}
        box = {"messages": [{"id": "notice", "from": "board", "body": json.dumps({"event": "task.open", "task": task})}]}
        with patch.object(self.bridge, "hub", side_effect=[box, {"task": task}, {"ok": True}, {"tasks": [task]}, {"task": task}]), \
                patch.object(self.bridge, "work") as work:
            self.bridge.tick({"last_scan": 0})
        self.assertEqual(work.call_count, 2)
        self.assertFalse(self.bridge.eligible({**task, "poster": "untrusted"}))

    def test_malformed_notice_and_http_error_are_nonfatal(self):
        with patch.object(self.bridge, "hub", side_effect=[{"messages": [{"id": "x", "from": "board", "body": "{"}]}, {}]):
            self.assertTrue(self.bridge.tick({"last_scan": 9e18}))
        def opener(req, timeout):
            raise urllib.error.HTTPError(req.full_url, 503, "bad", {}, io.BytesIO(b"bad"))
        self.assertEqual(self.bridge.hub("GET", "/x", opener=opener), {"ok": False, "status": 503})


class DirectRuntimeTest(unittest.TestCase):
    def setUp(self):
        self.bridge = load()
        self.message = {"id": "claude:nonce-123", "from": "claude", "kind": "message",
                        "seq": 17, "body": "Reply with nonce fresh-456", "correlationId": "nonce-123"}

    def runtime(self):
        return patch.object(self.bridge, "run_thread", return_value=(
            "Hyperagent here: fresh-456", None, "https://hyperagent.com/thread/real", "Astra Planner"))

    def test_mailbox_direct_message_reaches_the_real_provider_adapter_before_ack(self):
        calls = []
        def hub(method, path, body=None):
            calls.append(path)
            return {"ok": True, "messages": [self.message]} if method == "GET" else {"ok": True}
        with patch.object(self.bridge, "hub", side_effect=hub), patch("runpy.run_path", return_value={}), self.runtime() as run:
            self.bridge.tick({"last_scan": 9e18})
        run.assert_called_once()
        self.assertEqual(calls, ["/v1/mailbox?wait=25", "/v1/send", "/v1/ack"])

    def test_injected_token_does_not_read_legacy_token_file(self):
        with patch.dict(os.environ, {"MESH_HUB_TOKEN_HYPERAGENT": "test-token",
                                     "MESH_TOKEN_FILE": "/does/not/exist"}):
            module = load()
        self.assertEqual(module.TOKEN, "test-token")

    def test_direct_message_executes_actual_adapter_and_hashes_exact_reply(self):
        with patch("runpy.run_path", return_value={"adapter": True}) as adapter, self.runtime() as run, \
                patch.object(self.bridge, "hub", return_value={"ok": True, "recipients": ["claude"]}) as hub:
            self.assertTrue(self.bridge.reply_direct(self.message))
        adapter.assert_called_once_with(self.bridge.BIN)
        task = run.call_args.args[1]
        self.assertEqual(task["body"], self.message["body"])
        self.assertTrue(task["direct"])
        sent = hub.call_args.args[2]
        self.assertEqual(sent["inReplyTo"], self.message["id"])
        self.assertEqual(sent["to"], "claude")
        self.assertIn("fresh-456", sent["body"])
        self.assertEqual(sent["sha256"], self.bridge.hashlib.sha256(sent["body"].encode()).hexdigest())

    def test_failed_send_reuses_result_on_redelivery_without_another_paid_run(self):
        with patch("runpy.run_path", return_value={}), self.runtime() as run, \
                patch.object(self.bridge, "hub", side_effect=[{"ok": False}, {"ok": True}]) as hub:
            self.assertFalse(self.bridge.reply_direct(self.message))
            self.assertTrue(self.bridge.reply_direct(self.message))
        run.assert_called_once()
        self.assertEqual(hub.call_args_list[0].args, hub.call_args_list[1].args)
        self.assertEqual(self.bridge.runs_today()[1], 1)

    def test_failed_runtime_is_not_restarted_or_acknowledged(self):
        with patch("runpy.run_path", return_value={}), \
                patch.object(self.bridge, "run_thread", side_effect=RuntimeError("transport")) as run, \
                patch.object(self.bridge, "hub") as hub:
            self.assertFalse(self.bridge.reply_direct(self.message))
            self.assertFalse(self.bridge.reply_direct(self.message))
        run.assert_called_once()
        hub.assert_not_called()

    def test_empty_runtime_output_does_not_fabricate_a_reply(self):
        with patch("runpy.run_path", return_value={}), \
                patch.object(self.bridge, "run_thread", return_value=(None, "timeout", "thread", "agent")), \
                patch.object(self.bridge, "hub") as hub:
            self.assertFalse(self.bridge.reply_direct(self.message))
        hub.assert_not_called()

    def test_budget_exhaustion_preserves_message(self):
        self.bridge.STATE.mkdir(parents=True, exist_ok=True)
        path, _ = self.bridge.runs_today()
        path.write_text(str(self.bridge.RUNS_PER_DAY))
        with patch("runpy.run_path") as adapter:
            self.assertFalse(self.bridge.reply_direct(self.message))
        adapter.assert_not_called()

    def test_tick_acks_only_after_accepted_direct_response(self):
        for accepted in (False, True):
            calls = []
            def hub(method, path, body=None):
                calls.append(path)
                return {"ok": True, "messages": [self.message]} if method == "GET" else {"ok": True}
            with patch.object(self.bridge, "hub", side_effect=hub), \
                    patch.object(self.bridge, "reply_direct", return_value=accepted) as reply:
                self.bridge.tick({"last_scan": 9e18})
            reply.assert_called_once_with(self.message)
            self.assertEqual("/v1/ack" in calls, accepted)

    def test_replies_and_untrusted_messages_never_execute_runtime(self):
        messages = [{**self.message, "from": "other"}, {**self.message, "inReplyTo": "previous"}]
        with patch.object(self.bridge, "hub", return_value={"ok": True, "messages": messages}), \
                patch.object(self.bridge, "reply_direct") as reply:
            self.bridge.tick({"last_scan": 9e18})
        reply.assert_not_called()

    def test_prompt_identifies_runtime_without_claiming_a_receipt(self):
        text = self.bridge.prompt({"direct": True, "poster": "claude", "body": "nonce"})
        self.assertIn("real hosted executor", text)
        self.assertIn("Never invent a runtime or delivery receipt", text)

    def test_missing_injected_credential_fails_before_network(self):
        with patch.object(self.bridge, "TOKEN", ""), patch.object(self.bridge, "hub") as hub:
            with self.assertRaisesRegex(RuntimeError, "doppler run"):
                self.bridge.main()
        hub.assert_not_called()


if __name__ == "__main__":
    unittest.main()
