#!/usr/bin/env python3
"""cursor-appserver-adapter: Codex app-server JSON-RPC subset backed by Cursor CLI.

Speaks newline-delimited JSON-RPC 2.0 on stdio, exactly the subset Symphony
(lib/symphony_elixir/codex/app_server.ex) uses:

  client -> adapter:  initialize, initialized, thread/start, turn/start,
                      turn/interrupt, (client responses)
  adapter -> client:  responses plus notifications thread/started, turn/started,
                      item/started, item/completed, thread/tokenUsage/updated,
                      thread/status/changed, turn/completed | turn/failed |
                      turn/cancelled

Underneath it drives headless Cursor:
  first turn:  cursor-agent -p --force --output-format stream-json --model MODEL PROMPT
  later turn:  cursor-agent -p --force --resume SESSION_ID ... PROMPT

The explicit ``--force`` flag implements Symphony's approval_policy=never.
Per-thread state (Cursor session id, cumulative
usage estimate) lives in $STATE_DIR/threads/<thread_id>.json.

Env:
  CURSOR_BIN                    path to cursor-agent (default ~/.local/bin/cursor-agent-std)
  CURSOR_MODEL                  model identifier (default gpt-5.6-luna)
  CURSOR_ADAPTER_STATE_DIR      default ~/.codex-accounts/cursor-adapter
  CURSOR_TURN_TIMEOUT_SECONDS   default 7200; kill + turn/failed on expiry

stdlib only. Never logs secrets: the log records metadata only.
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

HOME = Path.home()
STATE_DIR = Path(
    os.environ.get(
        "CURSOR_ADAPTER_STATE_DIR",
        os.path.join(os.environ.get("CODEX_ACCOUNTS_ROOT", str(HOME / ".codex-accounts")), "cursor-adapter"),
    )
)
THREADS_DIR = STATE_DIR / "threads"
LOG_FILE = STATE_DIR / "adapter.log"
TURN_TIMEOUT = float(os.environ.get("CURSOR_TURN_TIMEOUT_SECONDS", "7200"))
HEARTBEAT_SECONDS = float(os.environ.get("CURSOR_HEARTBEAT_SECONDS", "45"))
CURSOR_MODEL = os.environ.get("CURSOR_MODEL", "gpt-5.6-luna-high")

_write_lock = threading.Lock()
_log_lock = threading.Lock()


def _cursor_bin() -> str:
    configured = os.environ.get("CURSOR_BIN")
    if configured:
        return configured
    candidate = HOME / ".local/bin/cursor-agent-std"
    if candidate.is_file() and os.access(candidate, os.X_OK):
        return str(candidate)
    return "cursor-agent"


def log(msg: str) -> None:
    try:
        THREADS_DIR.mkdir(parents=True, exist_ok=True)
        with _log_lock:
            with open(LOG_FILE, "a", encoding="utf-8") as fh:
                fh.write(f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} {msg}\n")
        try:
            os.chmod(LOG_FILE, 0o600)
        except OSError:
            pass
    except OSError:
        pass


def send(obj: dict) -> None:
    line = json.dumps(obj, separators=(",", ":")) + "\n"
    with _write_lock:
        try:
            sys.stdout.write(line)
            sys.stdout.flush()
        except BrokenPipeError:
            # Client closed the port; nothing left to do.
            os._exit(0)


class ThreadState:
    def __init__(self, thread_id: str, cwd: str):
        self.thread_id = thread_id
        self.cwd = cwd
        self.cursor_session_id: str | None = None
        self.turns = 0
        self.usage = {"input": 0, "output": 0}  # cumulative char//4 estimate

    @property
    def path(self) -> Path:
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in self.thread_id)
        return THREADS_DIR / f"{safe}.json"

    def save(self) -> None:
        try:
            THREADS_DIR.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(
                json.dumps(
                    {
                        "thread_id": self.thread_id,
                        "cwd": self.cwd,
                        "cursor_session_id": self.cursor_session_id,
                        "turns": self.turns,
                        "usage": self.usage,
                    },
                    indent=2,
                )
                + "\n"
            )
            os.chmod(tmp, 0o600)
            os.replace(tmp, self.path)
        except OSError as exc:
            log(f"state_save_error thread={self.thread_id} err={exc}")

    @classmethod
    def load(cls, thread_id: str) -> "ThreadState | None":
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in thread_id)
        path = THREADS_DIR / f"{safe}.json"
        try:
            data = json.loads(path.read_text())
        except (OSError, ValueError):
            return None
        state = cls(thread_id, data.get("cwd") or os.getcwd())
        state.cursor_session_id = data.get("cursor_session_id")
        state.turns = int(data.get("turns") or 0)
        usage = data.get("usage") or {}
        state.usage = {"input": int(usage.get("input") or 0), "output": int(usage.get("output") or 0)}
        return state


def _descendant_pids(pid: int) -> list[int]:
    """All transitive child PIDs of pid, via /proc (Linux). Best-effort."""
    ppid_of: dict[int, int] = {}
    try:
        entries = os.listdir("/proc")
    except OSError:
        return []
    for entry in entries:
        if not entry.isdigit():
            continue
        try:
            with open(f"/proc/{entry}/stat", "rb") as fh:
                stat = fh.read()
            close = stat.rfind(b")")
            fields = stat[close + 2 :].split()
            ppid_of[int(entry)] = int(fields[1])
        except (OSError, ValueError, IndexError):
            continue
    descendants: list[int] = []
    seen = {pid}
    stack = [pid]
    while stack:
        parent = stack.pop()
        for child, ppid in ppid_of.items():
            if ppid == parent and child not in seen:
                seen.add(child)
                descendants.append(child)
                stack.append(child)
    return descendants


class TurnRunner:
    """Runs one cursor headless turn in a background thread."""

    COMMAND_TOOLS = {"bash", "shell", "run_command", "exec"}
    FILE_TOOLS = {"write", "edit", "notebookedit", "multiedit", "applypatch"}

    def __init__(self, adapter: "Adapter", thread: ThreadState, turn_id: str, prompt: str):
        self.adapter = adapter
        self.thread = thread
        self.turn_id = turn_id
        self.prompt = prompt
        self.proc: subprocess.Popen | None = None
        self.interrupted = False
        self.timed_out = False
        self.started_at = time.time()
        self.pending_tools: dict[str, dict] = {}
        self.out_chars = 0
        self.stderr_tail: list[str] = []
        self.saw_first_event = False
        self.cursor_reported_error = False
        self._heartbeat_stop = threading.Event()

    # ---- heartbeat ---------------------------------------------------------------
    # cursor emits no stream-json events while a tool call runs, and this repo's
    # pre-push gate (biome + typecheck + 8 vitest shards) can run for many
    # minutes. Symphony's stall detector restarts any issue with >300s of
    # notification silence (codex.stall_timeout_ms), which was killing sessions
    # mid-push. A periodic thread/status/changed keeps the session alive.

    def _heartbeat_loop(self) -> None:
        while not self._heartbeat_stop.wait(HEARTBEAT_SECONDS):
            if self.adapter.shutting_down:
                break
            try:
                self.notify(
                    "thread/status/changed",
                    {
                        "threadId": self.thread.thread_id,
                        "status": {"type": "active", "activeFlags": ["adapter-heartbeat"]},
                    },
                )
            except Exception:
                break

    # ---- notification helpers -------------------------------------------------

    def notify(self, method: str, params: dict) -> None:
        send({"method": method, "params": params})

    def item_started(self, item: dict) -> None:
        self.notify(
            "item/started",
            {
                "threadId": self.thread.thread_id,
                "turnId": self.turn_id,
                "item": item,
                "startedAtMs": int(time.time() * 1000),
            },
        )

    def item_completed(self, item: dict) -> None:
        self.notify(
            "item/completed",
            {
                "threadId": self.thread.thread_id,
                "turnId": self.turn_id,
                "item": item,
                "completedAtMs": int(time.time() * 1000),
            },
        )

    def emit_agent_message(self, text: str) -> None:
        item_id = f"msg_{uuid.uuid4().hex[:12]}"
        self.item_started(
            {"type": "agentMessage", "id": item_id, "text": "", "phase": None, "memoryCitation": None}
        )
        self.item_completed(
            {"type": "agentMessage", "id": item_id, "text": text, "phase": None, "memoryCitation": None}
        )
        self.out_chars += len(text)

    def emit_tool_started(self, call_id: str, name: str, arguments: str) -> None:
        safe_call_id = "".join(c if c.isalnum() or c in "-_" else "_" for c in call_id)
        item_id = f"tool_{safe_call_id[:96]}"
        lname = name.lower()
        if lname in self.COMMAND_TOOLS:
            command = arguments
            try:
                command = json.loads(arguments).get("command", arguments)
            except ValueError:
                pass
            item = {
                "type": "commandExecution",
                "id": item_id,
                "command": command,
                "cwd": self.thread.cwd,
                "processId": None,
                "status": "inProgress",
                "commandActions": [],
                "aggregatedOutput": "",
                "exitCode": None,
                "durationMs": None,
            }
        elif lname in self.FILE_TOOLS:
            path = None
            try:
                path = json.loads(arguments).get("path") or json.loads(arguments).get("file_path")
            except ValueError:
                pass
            item = {
                "type": "fileChange",
                "id": item_id,
                "changes": [{"path": path, "kind": "update"}] if path else [],
                "status": "inProgress",
            }
        else:
            item = {
                "type": "mcpToolCall",
                "id": item_id,
                "server": "cursor",
                "tool": name,
                "arguments": arguments,
                "result": None,
                "error": None,
                "status": "inProgress",
            }
        self.pending_tools[call_id] = item
        self.item_started(item)

    def emit_tool_completed(self, call_id: str, content: str, exit_code: int | None = None) -> None:
        item = self.pending_tools.pop(call_id, None)
        self.out_chars += len(content or "")
        if item is None:
            return
        if item["type"] == "commandExecution":
            item["aggregatedOutput"] = (content or "")[:20000]
            item["exitCode"] = exit_code
            item["status"] = "completed" if exit_code in (None, 0) else "failed"
        elif item["type"] == "fileChange":
            item["status"] = "completed"
        else:
            item["result"] = (content or "")[:20000]
            item["status"] = "completed"
        self.item_completed(item)

    def emit_usage(self) -> None:
        usage_in = self.thread.usage["input"]
        usage_out = self.thread.usage["output"]
        total = usage_in + usage_out
        payload = {
            "totalTokens": total,
            "inputTokens": usage_in,
            "cachedInputTokens": 0,
            "outputTokens": usage_out,
            "reasoningOutputTokens": 0,
        }
        self.notify(
            "thread/tokenUsage/updated",
            {
                "threadId": self.thread.thread_id,
                "turnId": self.turn_id,
                "tokenUsage": {"total": payload, "last": payload},
            },
        )

    # ---- turn lifecycle --------------------------------------------------------

    def run(self) -> None:
        thread = self.thread
        tid = thread.thread_id
        started_epoch = int(self.started_at)
        self.notify("thread/status/changed", {"threadId": tid, "status": {"type": "active", "activeFlags": []}})
        self.notify(
            "turn/started",
            {
                "threadId": tid,
                "turn": {
                    "id": self.turn_id,
                    "items": [],
                    "itemsView": "notLoaded",
                    "status": "inProgress",
                    "error": None,
                    "startedAt": started_epoch,
                    "completedAt": None,
                    "durationMs": None,
                },
            },
        )
        user_item = {
            "type": "userMessage",
            "id": f"usr_{uuid.uuid4().hex[:12]}",
            "clientId": None,
            "content": [{"type": "text", "text": self.prompt, "text_elements": []}],
        }
        self.item_started(user_item)
        self.item_completed(user_item)

        cmd = [
            _cursor_bin(),
            "-p",
            "--force",
            "--output-format",
            "stream-json",
            "--model",
            CURSOR_MODEL,
        ]
        if thread.cursor_session_id:
            cmd += ["--resume", thread.cursor_session_id]
        cmd.append(self.prompt)
        thread.usage["input"] += max(1, len(self.prompt) // 4)
        log(f"turn_start thread={tid} turn={self.turn_id} resume={'yes' if thread.cursor_session_id else 'no'} cwd={thread.cwd}")

        try:
            self.proc = subprocess.Popen(
                cmd,
                cwd=thread.cwd,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                env=dict(os.environ),
                start_new_session=True,
            )
        except OSError as exc:
            self.finish_failed(f"cursor spawn failed: {exc}")
            self.adapter.turn_finished(self)
            return

        stderr_thread = threading.Thread(target=self._drain_stderr, daemon=True)
        stderr_thread.start()
        heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        heartbeat_thread.start()
        timer = threading.Timer(TURN_TIMEOUT, self._on_timeout)
        timer.daemon = True
        timer.start()

        assert self.proc.stdout is not None
        for line in self.proc.stdout:
            self.handle_cursor_line(line.rstrip("\n"))

        rc = self.proc.wait()
        timer.cancel()
        self._heartbeat_stop.set()
        heartbeat_thread.join(timeout=2)
        self.out_chars_flush()

        if self.interrupted and not self.timed_out:
            self.notify(
                "turn/cancelled",
                {"threadId": tid, "turnId": self.turn_id, "reason": "interrupted by client"},
            )
            log(f"turn_cancelled thread={tid} turn={self.turn_id}")
        elif rc == 0 and not self.timed_out and not self.cursor_reported_error:
            self.finish_completed()
        else:
            tail = " | ".join(self.stderr_tail[-5:]) or f"cursor exited rc={rc}"
            self.finish_failed(f"cursor exited rc={rc}: {tail[:800]}")

        self.adapter.turn_finished(self)

    def out_chars_flush(self) -> None:
        self.thread.usage["output"] += max(1, self.out_chars // 4)
        self.thread.turns += 1
        self.thread.save()

    def finish_completed(self) -> None:
        completed_epoch = int(time.time())
        self.emit_usage()
        self.notify("thread/status/changed", {"threadId": self.thread.thread_id, "status": {"type": "idle"}})
        usage = {
            "input_tokens": self.thread.usage["input"],
            "output_tokens": self.thread.usage["output"],
            "total_tokens": self.thread.usage["input"] + self.thread.usage["output"],
        }
        message = {
            "method": "turn/completed",
            "params": {
                "threadId": self.thread.thread_id,
                "turn": {
                    "id": self.turn_id,
                    "items": [],
                    "itemsView": "notLoaded",
                    "status": "completed",
                    "error": None,
                    "startedAt": int(self.started_at),
                    "completedAt": completed_epoch,
                    "durationMs": int((time.time() - self.started_at) * 1000),
                },
            },
            "usage": usage,
        }
        send(message)
        # A completed turn proves cursor is healthy; keep codex-rotate's
        # preflight cache warm so the next spawn skips the live probe.
        try:
            (STATE_DIR / "preflight.ok").touch()
        except OSError:
            pass
        log(f"turn_completed thread={self.thread.thread_id} turn={self.turn_id}")

    def finish_failed(self, message: str) -> None:
        self.notify("thread/status/changed", {"threadId": self.thread.thread_id, "status": {"type": "idle"}})
        self.notify(
            "turn/failed",
            {
                "threadId": self.thread.thread_id,
                "turnId": self.turn_id,
                "turn": {
                    "id": self.turn_id,
                    "items": [],
                    "itemsView": "notLoaded",
                    "status": "failed",
                    "error": {"message": message},
                    "startedAt": int(self.started_at),
                    "completedAt": int(time.time()),
                    "durationMs": int((time.time() - self.started_at) * 1000),
                },
                "error": {"message": message},
            },
        )
        log(f"turn_failed thread={self.thread.thread_id} turn={self.turn_id} msg={message[:300]}")

    # ---- cursor stream parsing ----------------------------------------------------

    def handle_cursor_line(self, line: str) -> None:
        if not line.strip():
            return
        if not self.saw_first_event:
            self.saw_first_event = True
            # First stream event proves cursor authenticated and is producing
            # output; keep codex-rotate's preflight cache warm.
            try:
                (STATE_DIR / "preflight.ok").touch()
            except OSError:
                pass
        try:
            event = json.loads(line)
        except ValueError:
            log(f"cursor_nonjson line={line[:200]}")
            return
        if not isinstance(event, dict):
            return
        event_type = event.get("type")
        if event_type == "system" and event.get("subtype") == "init":
            if event.get("session_id"):
                self.thread.cursor_session_id = str(event["session_id"])
                self.thread.save()
        elif event_type == "assistant":
            message = event.get("message") or {}
            content = message.get("content") if isinstance(message, dict) else None
            parts = []
            for item in content if isinstance(content, list) else []:
                if isinstance(item, dict) and item.get("type") == "text" and item.get("text"):
                    parts.append(str(item["text"]))
            if parts:
                self.emit_agent_message("\n".join(parts))
        elif event_type == "tool_call":
            call_id = str(event.get("call_id") or event.get("toolCallId") or uuid.uuid4().hex)
            tool_call = event.get("tool_call")
            tool_call = tool_call if isinstance(tool_call, dict) else {}
            name = "cursor_tool"
            body: dict = {}
            for key, value in tool_call.items():
                if key.endswith("ToolCall") and isinstance(value, dict):
                    name = key[: -len("ToolCall")]
                    body = value
                    break
            arguments = body.get("args")
            arguments_text = json.dumps(arguments or {}, sort_keys=True)
            if event.get("subtype") == "started":
                self.emit_tool_started(call_id, name, arguments_text)
            elif event.get("subtype") == "completed":
                result = body.get("result")
                exit_code = None
                if isinstance(result, dict):
                    success = result.get("success")
                    if isinstance(success, dict) and isinstance(success.get("exitCode"), int):
                        exit_code = success["exitCode"]
                self.emit_tool_completed(
                    call_id,
                    json.dumps(result, sort_keys=True) if result is not None else "",
                    exit_code,
                )
        elif event_type == "result":
            usage = event.get("usage") or {}
            if isinstance(usage, dict):
                self.thread.usage["input"] = max(
                    self.thread.usage["input"],
                    int(usage.get("input_tokens") or usage.get("inputTokens") or 0),
                )
                self.thread.usage["output"] = max(
                    self.thread.usage["output"],
                    int(usage.get("output_tokens") or usage.get("outputTokens") or 0),
                )
            if event.get("is_error"):
                self.cursor_reported_error = True
                self.stderr_tail.append(str(event.get("result") or "Cursor reported failure")[:800])
        elif event.get("type") == "error" or event.get("error"):
            self.cursor_reported_error = True
            message = event.get("message") or json.dumps(event.get("error"))[:500]
            self.emit_agent_message(f"[cursor error event] {message}")

    def _drain_stderr(self) -> None:
        assert self.proc is not None and self.proc.stderr is not None
        for line in self.proc.stderr:
            self.stderr_tail.append(line.rstrip("\n"))
            if len(self.stderr_tail) > 50:
                self.stderr_tail = self.stderr_tail[-50:]

    def _on_timeout(self) -> None:
        if self.proc is not None and self.proc.poll() is None:
            log(f"turn_timeout thread={self.thread.thread_id} turn={self.turn_id}")
            self.timed_out = True
            self._kill()
            self.stderr_tail.append(f"adapter: turn timed out after {TURN_TIMEOUT}s")

    def interrupt(self) -> None:
        self.interrupted = True
        self._kill()

    def _kill(self) -> None:
        if self.proc is None:
            return
        cursor_pid = self.proc.pid
        if self.proc.poll() is None:
            try:
                os.killpg(os.getpgid(cursor_pid), signal.SIGTERM)
            except (ProcessLookupError, PermissionError, OSError):
                try:
                    self.proc.terminate()
                except OSError:
                    pass
        # Reap tool-call descendants (git push, vitest shards, dev servers)
        # that escaped cursor's process group; otherwise they outlive the
        # session and keep burning CPU after a restart.
        for pid in _descendant_pids(cursor_pid):
            try:
                os.kill(pid, signal.SIGTERM)
            except OSError:
                pass
        if self.proc.poll() is None:
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(os.getpgid(cursor_pid), signal.SIGKILL)
                except (ProcessLookupError, PermissionError, OSError):
                    self.proc.kill()
        time.sleep(1.5)  # grace for TERM'd descendants to exit
        for pid in _descendant_pids(cursor_pid):
            try:
                os.kill(pid, signal.SIGKILL)
            except OSError:
                pass


class Adapter:
    def __init__(self) -> None:
        self.threads: dict[str, ThreadState] = {}
        self.current_turn: TurnRunner | None = None
        self.turn_lock = threading.Lock()
        self.shutting_down = False

    def turn_finished(self, runner: TurnRunner) -> None:
        with self.turn_lock:
            if self.current_turn is runner:
                self.current_turn = None

    # ---- request handlers -------------------------------------------------------

    def handle_initialize(self, rid) -> None:
        send(
            {
                "id": rid,
                "result": {
                    "userAgent": "cursor-appserver-adapter/0.1.0",
                    "platformFamily": "unix",
                    "platformOs": "linux",
                },
            }
        )

    def handle_thread_start(self, rid, params: dict) -> None:
        cwd = params.get("cwd") or os.getcwd()
        thread_id = uuid.uuid4().hex[:8] + "-" + str(uuid.uuid4())[9:]
        thread = ThreadState(thread_id, cwd)
        thread.save()
        self.threads[thread_id] = thread
        thread_payload = {
            "id": thread_id,
            "sessionId": thread_id,
            "preview": "",
            "ephemeral": False,
            "modelProvider": "cursor",
            "createdAt": int(time.time()),
            "updatedAt": int(time.time()),
            "status": {"type": "idle"},
            "cwd": cwd,
            "cliVersion": "cursor-agent",
            "turns": [],
        }
        send(
            {
                "id": rid,
                "result": {
                    "thread": thread_payload,
                    "model": CURSOR_MODEL,
                    "modelProvider": "cursor",
                    "cwd": cwd,
                    "approvalPolicy": params.get("approvalPolicy") or "never",
                    "sandbox": params.get("sandbox") or "danger-full-access",
                },
            }
        )
        send({"method": "thread/started", "params": {"thread": thread_payload}})
        log(f"thread_start thread={thread_id} cwd={cwd}")

    def handle_turn_start(self, rid, params: dict) -> None:
        thread_id = params.get("threadId") or ""
        thread = self.threads.get(thread_id) or ThreadState.load(thread_id)
        if thread is None:
            send({"id": rid, "error": {"code": -32602, "message": f"unknown threadId {thread_id}"}})
            return
        self.threads[thread_id] = thread
        if params.get("cwd"):
            thread.cwd = params["cwd"]

        with self.turn_lock:
            if self.current_turn is not None:
                send({"id": rid, "error": {"code": -32000, "message": "a turn is already in progress"}})
                return

            prompt_parts = []
            for item in params.get("input") or []:
                if isinstance(item, dict) and item.get("type") == "text" and isinstance(item.get("text"), str):
                    prompt_parts.append(item["text"])
            prompt = "\n\n".join(prompt_parts).strip()
            if not prompt:
                send({"id": rid, "error": {"code": -32602, "message": "empty turn input"}})
                return

            turn_id = str(uuid.uuid4())
            send(
                {
                    "id": rid,
                    "result": {
                        "turn": {
                            "id": turn_id,
                            "items": [],
                            "itemsView": "notLoaded",
                            "status": "inProgress",
                            "error": None,
                            "startedAt": None,
                            "completedAt": None,
                            "durationMs": None,
                        }
                    },
                }
            )
            runner = TurnRunner(self, thread, turn_id, prompt)
            self.current_turn = runner
            worker = threading.Thread(target=runner.run, daemon=True)
            worker.start()

    def handle_turn_interrupt(self, rid, params: dict) -> None:
        with self.turn_lock:
            runner = self.current_turn
        if runner is not None and (not params.get("turnId") or params.get("turnId") == runner.turn_id):
            runner.interrupt()
        send({"id": rid, "result": {}})

    # ---- main loop ---------------------------------------------------------------

    def dispatch(self, message: dict) -> None:
        method = message.get("method")
        rid = message.get("id")
        if method is None:
            return  # client response to a server request; we never send any
        params = message.get("params") or {}
        if not isinstance(params, dict):
            params = {}
        if rid is None:
            # notifications from the client (e.g. "initialized")
            log(f"client_notification method={method}")
            return
        if method == "initialize":
            self.handle_initialize(rid)
        elif method == "thread/start":
            self.handle_thread_start(rid, params)
        elif method == "turn/start":
            self.handle_turn_start(rid, params)
        elif method == "turn/interrupt":
            self.handle_turn_interrupt(rid, params)
        else:
            send({"id": rid, "error": {"code": -32601, "message": f"method not found: {method}"}})
            log(f"unknown_method method={method}")

    def shutdown(self) -> None:
        self.shutting_down = True
        with self.turn_lock:
            runner = self.current_turn
        if runner is not None:
            runner.interrupt()
            time.sleep(1)

    def serve(self) -> None:
        THREADS_DIR.mkdir(parents=True, exist_ok=True)
        log("adapter_start")
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                message = json.loads(line)
            except ValueError:
                log(f"bad_json line={line[:200]}")
                continue
            if isinstance(message, dict):
                try:
                    self.dispatch(message)
                except Exception as exc:  # never take the stream down
                    log(f"dispatch_error err={exc!r}")
                    if message.get("id") is not None:
                        send({"id": message["id"], "error": {"code": -32603, "message": f"internal error: {exc}"}})
        self.shutdown()
        log("adapter_eof_exit")


def main() -> None:
    adapter = Adapter()

    def _sigterm(_signum, _frame):
        adapter.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGTERM, _sigterm)
    signal.signal(signal.SIGINT, _sigterm)
    adapter.serve()


if __name__ == "__main__":
    main()
