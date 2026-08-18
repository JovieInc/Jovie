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


def iter_response(response):
    content_type = response.headers.get("content-type", "application/json")
    if "text/event-stream" in content_type:
        while True:
            raw_line = response.readline(MAX_RESPONSE_BYTES + 1)
            if not raw_line:
                break
            if len(raw_line) > MAX_RESPONSE_BYTES:
                raise RuntimeError("shared gbrain SSE event exceeds size limit")
            line = raw_line.decode()
            if not line.startswith("data:"):
                continue
            data = line[5:].lstrip().strip()
            if data and data != "[DONE]":
                yield json.loads(data)
        return
    body_bytes = response.read(MAX_RESPONSE_BYTES + 1)
    if len(body_bytes) > MAX_RESPONSE_BYTES:
        raise RuntimeError("shared gbrain HTTP response exceeds size limit")
    body = body_bytes.decode()
    if body.strip():
        yield json.loads(body)


def forward(payload: dict, token: str) -> None:
    data = json.dumps(payload, separators=(",", ":")).encode()
    last_error: Exception | None = None
    # tools/call can mutate state. An ambiguous response failure must surface to
    # the client instead of replaying a write that may already have committed.
    delays = (0.0,) if payload.get("method") == "tools/call" else RETRY_DELAYS
    for delay in delays:
        emitted = False
        if delay:
            time.sleep(delay)
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
            with HTTP_OPENER.open(request, timeout=90) as response:
                emitted = False
                terminal_emitted = False
                for response_payload in iter_response(response):
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
                        terminal_emitted = True
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


def handle_line(line: str, token: str) -> None:
    request_id: object = None
    try:
        payload = json.loads(line)
        request_id = payload.get("id")
        forward(payload, token)
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
                continue
            if not raw_line.strip():
                continue
            capacity.acquire()
            future = executor.submit(handle_line, raw_line.decode(), token)
            future.add_done_callback(lambda _future: capacity.release())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
