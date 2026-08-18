#!/usr/bin/env python3
"""Bridge MCP JSON-lines stdio to the shared authenticated HTTP daemon."""

from __future__ import annotations

import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request


MCP_URL = os.environ.get("GBRAIN_MCP_URL", "http://127.0.0.1:7801/mcp")
TOKEN_FILE = pathlib.Path(
    os.environ.get(
        "GBRAIN_MCP_TOKEN_FILE",
        str(pathlib.Path.home() / ".gbrain" / "agent-tokens" / "codex.token"),
    )
)
RETRY_DELAYS = (0.0, 0.25, 1.0)


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
    for delay in RETRY_DELAYS:
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
            with urllib.request.urlopen(request, timeout=90) as response:
                return parse_response(
                    response.read().decode(),
                    response.headers.get("content-type", "application/json"),
                )
        except urllib.error.HTTPError as exc:
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
        token = TOKEN_FILE.read_text().strip()
    except OSError as exc:
        sys.stderr.write(f"gbrain proxy: cannot read token file: {exc}\n")
        return 1
    if not token:
        sys.stderr.write("gbrain proxy: token file is empty\n")
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
            message = str(exc)
            if request_id is not None:
                emit(error_response(request_id, message))
            else:
                sys.stderr.write(f"gbrain proxy notification failed: {message}\n")
                sys.stderr.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
