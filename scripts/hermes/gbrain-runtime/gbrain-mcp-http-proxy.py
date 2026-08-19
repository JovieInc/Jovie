#!/usr/bin/env python3
"""Bridge MCP JSON-lines stdio to the shared authenticated HTTP daemon."""

from __future__ import annotations

import http.client
import json
import os
import pathlib
import socket
import stat
import sys
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor


MCP_URL = os.environ.get("GBRAIN_MCP_URL", "http://127.0.0.1:7801/mcp")
TOKEN_FILE = pathlib.Path(
    os.environ.get(
        "GBRAIN_MCP_TOKEN_FILE",
        str(pathlib.Path.home() / ".gbrain" / "agent-tokens" / "codex.token"),
    )
)
RETRY_DELAYS = (0.0, 0.25, 1.0)
MAX_WORKERS_RAW = os.environ.get("GBRAIN_MCP_MAX_WORKERS", "8")
REQUEST_DEADLINE_RAW = os.environ.get("GBRAIN_MCP_REQUEST_DEADLINE_SECONDS", "120")
MAX_REQUEST_BYTES = 1024 * 1024
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
MAX_TOKEN_BYTES = 16 * 1024
OUTPUT_LOCK = threading.Lock()


def validate_mcp_url() -> None:
    parsed = urllib.parse.urlsplit(MCP_URL)
    if parsed.scheme != "http" or not parsed.hostname:
        raise RuntimeError("GBRAIN_MCP_URL must be an absolute HTTP URL")
    if parsed.username or parsed.password or parsed.fragment:
        raise RuntimeError("GBRAIN_MCP_URL must not contain credentials or a fragment")
    if parsed.hostname not in {"127.0.0.1", "::1"}:
        raise RuntimeError("refusing non-loopback GBRAIN_MCP_URL")


def resolve_worker_budget() -> int:
    try:
        max_workers = int(MAX_WORKERS_RAW)
    except ValueError as exc:
        raise RuntimeError("GBRAIN_MCP_MAX_WORKERS must be an integer") from exc
    if not 1 <= max_workers <= 32:
        raise RuntimeError("GBRAIN_MCP_MAX_WORKERS must be between 1 and 32")
    return max_workers


def resolve_request_deadline() -> float:
    try:
        deadline = float(REQUEST_DEADLINE_RAW)
    except ValueError as exc:
        raise RuntimeError(
            "GBRAIN_MCP_REQUEST_DEADLINE_SECONDS must be numeric"
        ) from exc
    if not 1 <= deadline <= 300:
        raise RuntimeError(
            "GBRAIN_MCP_REQUEST_DEADLINE_SECONDS must be between 1 and 300"
        )
    return deadline


def read_token_file() -> str:
    flags = os.O_RDONLY | os.O_NONBLOCK
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(TOKEN_FILE, flags)
    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode):
            raise RuntimeError("token path must be a regular file")
        if metadata.st_uid != os.getuid():
            raise RuntimeError("token file must be owned by the current user")
        if metadata.st_mode & 0o077:
            raise RuntimeError("token file must not be accessible by group or others")
        token_bytes = os.read(descriptor, MAX_TOKEN_BYTES + 1)
        if len(token_bytes) > MAX_TOKEN_BYTES:
            raise RuntimeError("token file is too large")
        try:
            return token_bytes.decode().strip()
        except UnicodeDecodeError as exc:
            raise RuntimeError("token file must contain UTF-8 text") from exc
    finally:
        os.close(descriptor)


def validate_token(token: str) -> None:
    if not token:
        raise RuntimeError("token file is empty")
    if any(ord(character) < 0x21 or ord(character) > 0x7E for character in token):
        raise RuntimeError("token must be one printable ASCII line")


def public_error(exc: Exception) -> str:
    if isinstance(exc, RuntimeError):
        return str(exc)
    return f"gbrain proxy request failed: {type(exc).__name__}"


class PostResponseProtocolError(RuntimeError):
    """The client already received a terminal response; do not emit another."""


def emit(payload: dict) -> None:
    with OUTPUT_LOCK:
        sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
        sys.stdout.flush()


def error_response(request_id: object, message: str) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": -32000, "message": message},
    }


def abort_connection_at_deadline(
    connection: http.client.HTTPConnection,
    expired: threading.Event,
    completed: threading.Event,
    outcome_lock: threading.Lock,
) -> None:
    with outcome_lock:
        if completed.is_set():
            return
        expired.set()
    try:
        if connection.sock is not None:
            connection.sock.shutdown(socket.SHUT_RDWR)
    except OSError:
        pass
    finally:
        connection.close()


def valid_request_id(value: object) -> bool:
    return isinstance(value, str) or (
        isinstance(value, int) and not isinstance(value, bool)
    )


def iter_response(response, deadline: float):
    content_type = response.headers.get("content-type", "application/json")
    if "text/event-stream" in content_type:
        total_bytes = 0
        event_count = 0
        while True:
            if time.monotonic() >= deadline:
                raise RuntimeError("shared gbrain HTTP exceeded total deadline")
            raw_line = response.readline(MAX_RESPONSE_BYTES + 1)
            if not raw_line:
                break
            total_bytes += len(raw_line)
            if total_bytes > MAX_RESPONSE_BYTES:
                raise RuntimeError("shared gbrain SSE response exceeds size limit")
            if len(raw_line) > MAX_RESPONSE_BYTES:
                raise RuntimeError("shared gbrain SSE event exceeds size limit")
            line = raw_line.decode()
            if not line.startswith("data:"):
                continue
            data = line[5:].lstrip().strip()
            if data and data != "[DONE]":
                event_count += 1
                if event_count > 1024:
                    raise RuntimeError("shared gbrain SSE event count exceeds limit")
                yield json.loads(data)
        return
    body_chunks = []
    body_size = 0
    while True:
        if time.monotonic() >= deadline:
            raise RuntimeError("shared gbrain HTTP exceeded total deadline")
        chunk = response.read(min(64 * 1024, MAX_RESPONSE_BYTES + 1 - body_size))
        if not chunk:
            break
        body_chunks.append(chunk)
        body_size += len(chunk)
        if body_size > MAX_RESPONSE_BYTES:
            raise RuntimeError("shared gbrain HTTP response exceeds size limit")
    body_bytes = b"".join(body_chunks)
    body = body_bytes.decode()
    if body.strip():
        yield json.loads(body)


def forward(payload: dict, token: str, total_deadline: float) -> None:
    data = json.dumps(payload, separators=(",", ":")).encode()
    last_error: Exception | None = None
    expects_response = "id" in payload
    # tools/call can mutate state. An ambiguous response failure must surface to
    # the client instead of replaying a write that may already have committed.
    delays = (0.0,) if payload.get("method") == "tools/call" else RETRY_DELAYS
    for delay in delays:
        if time.monotonic() >= total_deadline:
            raise RuntimeError("shared gbrain HTTP exceeded total deadline")
        if delay:
            time.sleep(delay)
        if time.monotonic() >= total_deadline:
            raise RuntimeError("shared gbrain HTTP exceeded total deadline")
        parsed_url = urllib.parse.urlsplit(MCP_URL)
        connection = http.client.HTTPConnection(
            parsed_url.hostname,
            parsed_url.port,
            timeout=max(0.001, min(90.0, total_deadline - time.monotonic())),
        )
        request_path = urllib.parse.urlunsplit(
            ("", "", parsed_url.path or "/", parsed_url.query, "")
        )
        deadline_expired = threading.Event()
        terminal_completed = threading.Event()
        outcome_lock = threading.Lock()
        deadline_timer = threading.Timer(
            max(0.001, total_deadline - time.monotonic()),
            abort_connection_at_deadline,
            args=(
                connection,
                deadline_expired,
                terminal_completed,
                outcome_lock,
            ),
        )
        deadline_timer.daemon = True
        deadline_timer.start()
        emitted = False
        try:
            connection.request(
                "POST",
                request_path,
                body=data,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                },
            )
            response = connection.getresponse()
            if deadline_expired.is_set():
                raise RuntimeError("shared gbrain HTTP exceeded total deadline")
            if 300 <= response.status < 400:
                raise RuntimeError("shared gbrain HTTP redirect rejected")
            if 400 <= response.status < 500 and response.status != 429:
                raise RuntimeError(f"shared gbrain HTTP returned {response.status}")
            if response.status == 429 or response.status >= 500:
                last_error = RuntimeError(f"shared gbrain HTTP returned {response.status}")
                continue
            if not 200 <= response.status < 300:
                raise RuntimeError(f"shared gbrain HTTP returned {response.status}")
            try:
                terminal_emitted = False
                for response_payload in iter_response(response, total_deadline):
                    if not isinstance(response_payload, dict):
                        error = RuntimeError(
                            "shared gbrain returned non-object JSON-RPC"
                        )
                        if terminal_emitted:
                            raise PostResponseProtocolError(str(error))
                        raise error
                    if response_payload.get("jsonrpc") != "2.0":
                        error = RuntimeError(
                            "shared gbrain returned invalid JSON-RPC version"
                        )
                        if terminal_emitted:
                            raise PostResponseProtocolError(str(error))
                        raise error
                    if "id" in response_payload:
                        response_id = response_payload["id"]
                        if not valid_request_id(response_id):
                            error = RuntimeError(
                                "shared gbrain returned invalid JSON-RPC response id"
                            )
                            if terminal_emitted:
                                raise PostResponseProtocolError(str(error))
                            raise error
                        if type(response_id) is not type(payload.get("id")) or (
                            response_id != payload.get("id")
                        ):
                            error = RuntimeError(
                                "shared gbrain returned mismatched JSON-RPC id"
                            )
                            if terminal_emitted:
                                raise PostResponseProtocolError(str(error))
                            raise error
                        if terminal_emitted:
                            raise PostResponseProtocolError(
                                "shared gbrain returned multiple terminal responses"
                            )
                        has_result = "result" in response_payload
                        has_error = "error" in response_payload
                        if has_result == has_error:
                            raise RuntimeError(
                                "shared gbrain returned invalid terminal response shape"
                            )
                        if has_error:
                            error_payload = response_payload["error"]
                            if (
                                not isinstance(error_payload, dict)
                                or not isinstance(error_payload.get("code"), int)
                                or isinstance(error_payload.get("code"), bool)
                                or not isinstance(error_payload.get("message"), str)
                            ):
                                raise RuntimeError(
                                    "shared gbrain returned invalid JSON-RPC error shape"
                                )
                        with outcome_lock:
                            if deadline_expired.is_set() or (
                                time.monotonic() >= total_deadline
                            ):
                                deadline_expired.set()
                                raise RuntimeError(
                                    "shared gbrain HTTP exceeded total deadline"
                                )
                            emit(response_payload)
                            terminal_completed.set()
                        terminal_emitted = True
                    elif not isinstance(response_payload.get("method"), str):
                        raise RuntimeError(
                            "shared gbrain returned invalid JSON-RPC notification"
                        )
                    else:
                        emit(response_payload)
                    emitted = True
                    if terminal_emitted:
                        break
            except Exception as exc:
                if deadline_expired.is_set():
                    raise RuntimeError(
                        "shared gbrain HTTP exceeded total deadline"
                    ) from exc
                raise
            if deadline_expired.is_set() and not terminal_completed.is_set():
                raise RuntimeError("shared gbrain HTTP exceeded total deadline")
            if expects_response and not terminal_emitted:
                raise RuntimeError("shared gbrain returned no terminal response")
            return
        except (http.client.HTTPException, TimeoutError, OSError) as exc:
            if time.monotonic() >= total_deadline:
                raise RuntimeError("shared gbrain HTTP exceeded total deadline") from exc
            if emitted:
                raise RuntimeError(
                    "shared gbrain HTTP interrupted after response began"
                ) from exc
            last_error = exc
        finally:
            deadline_timer.cancel()
            deadline_timer.join()
            connection.close()
    raise RuntimeError(
        "shared gbrain HTTP unavailable after retries: "
        f"{type(last_error).__name__}"
    )


def handle_line(raw_line: bytes, token: str, total_deadline: float) -> None:
    request_id: object = None
    try:
        try:
            line = raw_line.decode()
            payload = json.loads(line)
        except (UnicodeDecodeError, json.JSONDecodeError):
            emit(error_response(None, "invalid JSON-RPC request"))
            return
        if not isinstance(payload, dict):
            emit(error_response(None, "invalid JSON-RPC request"))
            return
        if payload.get("jsonrpc") != "2.0" or not isinstance(
            payload.get("method"), str
        ):
            emit(error_response(payload.get("id"), "invalid JSON-RPC request"))
            return
        if "id" in payload and not valid_request_id(payload["id"]):
            emit(error_response(None, "invalid JSON-RPC request id"))
            return
        request_id = payload.get("id")
        forward(payload, token, total_deadline)
    except Exception as exc:
        # Keep stdio alive. A daemon restart fails one call, not the task.
        message = public_error(exc)
        if isinstance(exc, PostResponseProtocolError):
            with OUTPUT_LOCK:
                sys.stderr.write(f"gbrain proxy protocol warning: {public_error(exc)}\n")
                sys.stderr.flush()
        elif request_id is not None:
            emit(error_response(request_id, message))
        else:
            with OUTPUT_LOCK:
                sys.stderr.write(f"gbrain proxy notification failed: {message}\n")
                sys.stderr.flush()


def main() -> int:
    try:
        validate_mcp_url()
        max_workers = resolve_worker_budget()
        request_deadline = resolve_request_deadline()
        token = read_token_file()
        validate_token(token)
    except (OSError, RuntimeError) as exc:
        sys.stderr.write(f"gbrain proxy: startup validation failed: {exc}\n")
        return 1
    capacity = threading.Semaphore(max_workers * 2)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        while True:
            raw_line = sys.stdin.buffer.readline(MAX_REQUEST_BYTES + 1)
            if not raw_line:
                break
            if len(raw_line) > MAX_REQUEST_BYTES:
                while raw_line and not raw_line.endswith(b"\n"):
                    raw_line = sys.stdin.buffer.readline(MAX_REQUEST_BYTES + 1)
                with OUTPUT_LOCK:
                    sys.stderr.write("gbrain proxy: request exceeds size limit\n")
                    sys.stderr.flush()
                return 1
            if not raw_line.strip():
                continue
            total_deadline = time.monotonic() + request_deadline
            capacity.acquire()
            future = executor.submit(handle_line, raw_line, token, total_deadline)
            future.add_done_callback(lambda _future: capacity.release())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
