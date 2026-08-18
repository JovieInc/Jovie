#!/usr/bin/env python3
"""Bridge MCP JSON-lines stdio to the shared authenticated HTTP daemon."""

from __future__ import annotations

import json
import os
import pathlib
import stat
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
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


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(
            req.full_url, code, "redirects are disabled", headers, fp
        )


# Never let inherited HTTP(S)_PROXY settings receive the MCP bearer. Remote
# endpoints, when explicitly enabled, are also contacted directly.
HTTP_OPENER = urllib.request.build_opener(
    urllib.request.ProxyHandler({}), NoRedirectHandler()
)


def validate_mcp_url() -> None:
    parsed = urllib.parse.urlsplit(MCP_URL)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise RuntimeError("GBRAIN_MCP_URL must be an absolute HTTP(S) URL")
    if parsed.username or parsed.password or parsed.fragment:
        raise RuntimeError("GBRAIN_MCP_URL must not contain credentials or a fragment")
    if parsed.hostname not in {"127.0.0.1", "::1", "localhost"}:
        if os.environ.get("GBRAIN_MCP_ALLOW_REMOTE") != "1":
            raise RuntimeError(
                "refusing non-loopback GBRAIN_MCP_URL without "
                "GBRAIN_MCP_ALLOW_REMOTE=1"
            )


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


def forward(payload: dict, token: str, deadline_seconds: float) -> None:
    data = json.dumps(payload, separators=(",", ":")).encode()
    last_error: Exception | None = None
    total_deadline = time.monotonic() + deadline_seconds
    # tools/call can mutate state. An ambiguous response failure must surface to
    # the client instead of replaying a write that may already have committed.
    delays = (0.0,) if payload.get("method") == "tools/call" else RETRY_DELAYS
    for delay in delays:
        emitted = False
        if time.monotonic() >= total_deadline:
            raise RuntimeError("shared gbrain HTTP exceeded total deadline")
        if delay:
            time.sleep(delay)
        if time.monotonic() >= total_deadline:
            raise RuntimeError("shared gbrain HTTP exceeded total deadline")
        request = urllib.request.Request(
            MCP_URL,
            data=data,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
            },
        )
        try:
            remaining = max(1.0, total_deadline - time.monotonic())
            with HTTP_OPENER.open(request, timeout=min(90.0, remaining)) as response:
                emitted = False
                terminal_emitted = False
                for response_payload in iter_response(response, total_deadline):
                    if not isinstance(response_payload, dict):
                        error = RuntimeError("shared gbrain returned non-object JSON-RPC")
                        if terminal_emitted:
                            raise PostResponseProtocolError(str(error))
                        raise error
                    if response_payload.get("jsonrpc") != "2.0":
                        error = RuntimeError("shared gbrain returned invalid JSON-RPC version")
                        if terminal_emitted:
                            raise PostResponseProtocolError(str(error))
                        raise error
                    response_id = response_payload.get("id")
                    if response_id is not None:
                        if response_id != payload.get("id"):
                            error = RuntimeError("shared gbrain returned mismatched JSON-RPC id")
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
                        if has_error and not isinstance(response_payload["error"], dict):
                            raise RuntimeError(
                                "shared gbrain returned invalid JSON-RPC error shape"
                            )
                        terminal_emitted = True
                    elif not isinstance(response_payload.get("method"), str):
                        raise RuntimeError(
                            "shared gbrain returned invalid JSON-RPC notification"
                        )
                    emit(response_payload)
                    emitted = True
                    if terminal_emitted:
                        break
                if payload.get("id") is not None and not terminal_emitted:
                    raise RuntimeError("shared gbrain returned no terminal response")
                return
        except urllib.error.HTTPError as exc:
            if 300 <= exc.code < 400:
                raise RuntimeError("shared gbrain HTTP redirect rejected") from exc
            # Authentication and request-shape failures are deterministic.
            if 400 <= exc.code < 500 and exc.code != 429:
                raise RuntimeError(f"shared gbrain HTTP returned {exc.code}") from exc
            last_error = exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            if emitted:
                raise RuntimeError(
                    "shared gbrain HTTP interrupted after response began"
                ) from exc
            last_error = exc
    raise RuntimeError(
        "shared gbrain HTTP unavailable after retries: "
        f"{type(last_error).__name__}"
    )


def handle_line(raw_line: bytes, token: str, deadline_seconds: float) -> None:
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
        request_id = payload.get("id")
        forward(payload, token, deadline_seconds)
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
            capacity.acquire()
            future = executor.submit(handle_line, raw_line, token, request_deadline)
            future.add_done_callback(lambda _future: capacity.release())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
