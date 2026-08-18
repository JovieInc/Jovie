#!/usr/bin/env python3
"""Bridge MCP JSON-lines stdio to the shared authenticated HTTP daemon."""

from __future__ import annotations

import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


MCP_URL = os.environ.get("GBRAIN_MCP_URL", "http://127.0.0.1:7801/mcp")
TOKEN_FILE = pathlib.Path(
    os.environ.get(
        "GBRAIN_MCP_TOKEN_FILE",
        str(pathlib.Path.home() / ".gbrain" / "agent-tokens" / "codex.token"),
    )
)
RETRY_DELAYS = (0.0, 0.25, 1.0)


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(
            req.full_url, code, "redirects are disabled", headers, fp
        )


HTTP_OPENER = urllib.request.build_opener(NoRedirectHandler())


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


def validate_token_file() -> None:
    if TOKEN_FILE.stat().st_mode & 0o077:
        raise RuntimeError("token file must not be accessible by group or others")


def validate_token(token: str) -> None:
    if not token:
        raise RuntimeError("token file is empty")
    if any(ord(character) < 0x21 or ord(character) > 0x7E for character in token):
        raise RuntimeError("token must be one printable ASCII line")


def public_error(exc: Exception) -> str:
    if isinstance(exc, RuntimeError):
        return str(exc)
    return f"gbrain proxy request failed: {type(exc).__name__}"


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def error_response(request_id: object, message: str) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": -32000, "message": message},
    }


def parse_response(body: str, content_type: str) -> list[dict]:
    if not body.strip():
        return []
    if "text/event-stream" in content_type:
        return [
            json.loads(line[6:])
            for line in body.splitlines()
            if line.startswith("data: ")
        ]
    return [json.loads(body)]


def forward(payload: dict, token: str) -> list[dict]:
    data = json.dumps(payload, separators=(",", ":")).encode()
    last_error: Exception | None = None
    # tools/call can mutate state. An ambiguous response failure must surface to
    # the client instead of replaying a write that may already have committed.
    delays = (0.0,) if payload.get("method") == "tools/call" else RETRY_DELAYS
    for delay in delays:
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
                return parse_response(
                    response.read().decode(),
                    response.headers.get("content-type", "application/json"),
                )
        except urllib.error.HTTPError as exc:
            if 300 <= exc.code < 400:
                raise RuntimeError("shared gbrain HTTP redirect rejected") from exc
            # Authentication and request-shape failures are deterministic.
            if 400 <= exc.code < 500 and exc.code != 429:
                raise RuntimeError(f"shared gbrain HTTP returned {exc.code}") from exc
            last_error = exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
    raise RuntimeError(
        "shared gbrain HTTP unavailable after retries: "
        f"{type(last_error).__name__}"
    )


def main() -> int:
    try:
        validate_mcp_url()
        validate_token_file()
        token = TOKEN_FILE.read_text().strip()
        validate_token(token)
    except (OSError, RuntimeError) as exc:
        sys.stderr.write(f"gbrain proxy: startup validation failed: {exc}\n")
        return 1
    for line in sys.stdin:
        if not line.strip():
            continue
        request_id: object = None
        try:
            payload = json.loads(line)
            request_id = payload.get("id")
            for response in forward(payload, token):
                emit(response)
        except Exception as exc:
            # Keep stdio alive. A daemon restart fails one call, not the task.
            message = public_error(exc)
            if request_id is not None:
                emit(error_response(request_id, message))
            else:
                sys.stderr.write(f"gbrain proxy notification failed: {message}\n")
                sys.stderr.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
