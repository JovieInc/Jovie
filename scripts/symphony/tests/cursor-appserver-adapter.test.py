#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import pathlib
import queue
import subprocess
import tempfile
import threading
import time
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
ADAPTER = ROOT / "scripts/symphony/cursor-appserver-adapter.py"


class CursorAppServerAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = pathlib.Path(self.temp.name)
        self.args_log = root / "args.jsonl"
        self.fake = root / "cursor-agent"
        self.fake.write_text(
            "#!/usr/bin/env python3\n"
            "import json, os, sys\n"
            "with open(os.environ['ARGS_LOG'], 'a') as f: f.write(json.dumps(sys.argv[1:]) + '\\n')\n"
            "print(json.dumps({'type':'system','subtype':'init','session_id':'cursor-session-1'}), flush=True)\n"
            "tool={'shellToolCall':{'args':{'command':'pwd'},'result':{'success':{'exitCode':0,'stdout':'/tmp/example\\n'}}}}\n"
            "print(json.dumps({'type':'tool_call','subtype':'started','call_id':'call-1','tool_call':tool}), flush=True)\n"
            "print(json.dumps({'type':'tool_call','subtype':'completed','call_id':'call-1','tool_call':tool}), flush=True)\n"
            "print(json.dumps({'type':'assistant','message':{'role':'assistant','content':[{'type':'text','text':'worked'}]}}), flush=True)\n"
            "print(json.dumps({'type':'result','subtype':'success','is_error':False,'usage':{'inputTokens':12,'outputTokens':3}}), flush=True)\n"
        )
        self.fake.chmod(0o755)
        env = os.environ.copy()
        env.update(
            {
                "ARGS_LOG": str(self.args_log),
                "CURSOR_BIN": str(self.fake),
                "CURSOR_MODEL": "gpt-5.6-luna-high",
                "CURSOR_ADAPTER_STATE_DIR": str(root / "state"),
                "CURSOR_HEARTBEAT_SECONDS": "0.05",
            }
        )
        self.process = subprocess.Popen(
            ["python3", str(ADAPTER)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
        )
        self.output: queue.Queue[dict] = queue.Queue()
        assert self.process.stdout is not None
        self.reader = threading.Thread(
            target=lambda: [self.output.put(json.loads(line)) for line in self.process.stdout],
            daemon=True,
        )
        self.reader.start()
        self.addCleanup(self.stop)

    def stop(self) -> None:
        if self.process.poll() is None:
            self.process.terminate()
            self.process.wait(timeout=5)
        for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
            if stream is not None:
                stream.close()

    def send(self, message: dict) -> None:
        assert self.process.stdin is not None
        self.process.stdin.write(json.dumps(message) + "\n")
        self.process.stdin.flush()

    def read_until(self, predicate, timeout: float = 5.0) -> dict:
        deadline = time.monotonic() + timeout
        observed: list[dict] = []
        while time.monotonic() < deadline:
            try:
                item = self.output.get(timeout=min(0.1, deadline - time.monotonic()))
            except queue.Empty:
                continue
            observed.append(item)
            if predicate(item):
                return item
        self.fail(f"expected adapter event; observed={observed!r}")

    def start_thread(self) -> str:
        self.send({"id": 1, "method": "initialize", "params": {}})
        initialized = self.read_until(lambda item: item.get("id") == 1)
        self.assertIn("cursor-appserver-adapter", initialized["result"]["userAgent"])
        self.send({"id": 2, "method": "thread/start", "params": {"cwd": self.temp.name}})
        started = self.read_until(lambda item: item.get("id") == 2)
        self.assertEqual(started["result"]["modelProvider"], "cursor")
        return started["result"]["thread"]["id"]

    def run_turn(self, thread_id: str, prompt: str, request_id: int) -> None:
        self.send(
            {
                "id": request_id,
                "method": "turn/start",
                "params": {"threadId": thread_id, "input": [{"type": "text", "text": prompt}]},
            }
        )
        self.read_until(lambda item: item.get("id") == request_id)
        tool = self.read_until(
            lambda item: item.get("method") == "item/completed"
            and item.get("params", {}).get("item", {}).get("type") == "commandExecution"
        )
        self.assertEqual(tool["params"]["item"]["command"], "pwd")
        self.assertEqual(tool["params"]["item"]["exitCode"], 0)
        self.assertIn("/tmp/example", tool["params"]["item"]["aggregatedOutput"])
        completed = self.read_until(lambda item: item.get("method") == "turn/completed")
        self.assertEqual(completed["params"]["turn"]["status"], "completed")
        self.assertGreaterEqual(completed["usage"]["total_tokens"], 15)

    def test_executes_cursor_with_force_model_and_resumes_session(self) -> None:
        thread_id = self.start_thread()
        self.run_turn(thread_id, "first task", 3)
        self.run_turn(thread_id, "continue task", 4)
        calls = [json.loads(line) for line in self.args_log.read_text().splitlines()]
        self.assertEqual(len(calls), 2)
        self.assertEqual(
            calls[0],
            ["-p", "--force", "--output-format", "stream-json", "--model", "gpt-5.6-luna-high", "first task"],
        )
        self.assertEqual(calls[1][-3:], ["--resume", "cursor-session-1", "continue task"])


if __name__ == "__main__":
    unittest.main()
