#!/usr/bin/env python3
"""Bounded authenticated Gem shipping-authority bridge (JOV-5248).

The ovie.shipping-state.v1 publisher runs on the web host and cannot read
Gem's loopback Symphony API or the fleet receipt under ~/gem-workspace. This
bridge is the normalized transport: it serves only the named authorities the
publisher is contractually allowed to read, over HTTP with bearer auth, and
writes a fixed receipt after every serve so a shutdown leaves an auditable
last-known marker.

Read-only. No path parameters, no log access, no actuation.

Install (Gem, after credential approval):
    OVIE_SHIPPING_BRIDGE_TOKEN=<token> python3 scripts/symphony/ovie_shipping_bridge.py

Environment:
    OVIE_SHIPPING_BRIDGE_TOKEN   required bearer token
    OVIE_SHIPPING_BRIDGE_HOST    bind host (default 127.0.0.1; front with the
                                 existing Tailscale serve binding to reach web)
    OVIE_SHIPPING_BRIDGE_PORT    bind port (default 4043)
    SYMPHONY_STATE_URL           official Symphony state endpoint
    FLEET_RECEIPT_PATH           typed fleet receipt JSON
    OVIE_SHIPPING_BRIDGE_STATE   fixed-receipt directory
"""
from __future__ import annotations

import hmac
import json
import os
import pathlib
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SCHEMA = "ovie-gem-bridge-receipt/v1"
SYMPHONY_RUNTIME_SCHEMA = "symphony-runtime-state/v1"
SYMPHONY_TASK_SCHEMA = "symphony-workspace-revision/v1"
LEASE_GUARD_SCHEMA = "symphony-lease-guard-report/v1"
FLEET_SCHEMA = "jovie-fleet-gate/v1"

DEFAULT_SYMPHONY_STATE_URL = "http://127.0.0.1:4041/api/v1/state"
DEFAULT_FLEET_RECEIPT = "~/gem-workspace/state/gem-priority-gate/latest.json"
DEFAULT_BRIDGE_STATE_DIR = "~/gem-workspace/state/ovie-shipping-bridge"
AUTHORITY_PREFIX = "/api/v1/shipping-authorities/"
AUTHORITIES = (
    "symphony-runtime",
    "symphony-task",
    "lease-guard-capacity",
    "fleet-receipt",
)
UPSTREAM_TIMEOUT_SECONDS = 5


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


class BridgeConfig:
    def __init__(self, env: dict[str, str] | None = None) -> None:
        env = env if env is not None else os.environ
        self.token = env.get("OVIE_SHIPPING_BRIDGE_TOKEN") or ""
        self.host = env.get("OVIE_SHIPPING_BRIDGE_HOST", "127.0.0.1")
        self.port = int(env.get("OVIE_SHIPPING_BRIDGE_PORT", "4043"))
        self.symphony_state_url = env.get(
            "SYMPHONY_STATE_URL", DEFAULT_SYMPHONY_STATE_URL
        )
        self.fleet_receipt_path = pathlib.Path(
            env.get("FLEET_RECEIPT_PATH", DEFAULT_FLEET_RECEIPT)
        ).expanduser()
        self.state_dir = pathlib.Path(
            env.get("OVIE_SHIPPING_BRIDGE_STATE", DEFAULT_BRIDGE_STATE_DIR)
        ).expanduser()


def _http_json(url: str, timeout: float = UPSTREAM_TIMEOUT_SECONDS) -> dict:
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = json.loads(response.read().decode("utf-8"))
    if not isinstance(body, dict):
        raise ValueError("upstream payload was not an object")
    return body


def _fleet_receipt(config: BridgeConfig) -> dict:
    with config.fleet_receipt_path.open("r", encoding="utf-8") as handle:
        body = json.load(handle)
    if not isinstance(body, dict):
        raise ValueError("fleet receipt was not an object")
    return body


def _task_receipt(state: dict, observed_at: str) -> dict:
    """Workspace task receipt: the same official task lists, carrying each
    task's workspace revision so consumers can pin an exact head."""
    revisions: dict[str, str] = {}
    for group in ("running", "retrying", "blocked", "failed"):
        for item in state.get(group) or []:
            if not isinstance(item, dict):
                continue
            issue = item.get("issue_identifier") or item.get("issue")
            head = item.get("head") or item.get("workspaceRevision")
            if isinstance(issue, str) and isinstance(head, str):
                revisions[issue.upper()] = head
    return {
        "schema": SYMPHONY_TASK_SCHEMA,
        "observedAt": state.get("observedAt") or state.get("generated_at") or observed_at,
        "running": state.get("running") or [],
        "retrying": state.get("retrying") or [],
        "blocked": state.get("blocked") or [],
        "failed": state.get("failed") or state.get("terminal") or [],
        "revisions": revisions,
    }


def authority_payload(
    source_id: str, config: BridgeConfig
) -> tuple[int, dict]:
    """Return (http_status, payload) for a named authority read."""
    observed_at = _iso(_now())
    if source_id in ("symphony-runtime", "symphony-task"):
        try:
            state = _http_json(config.symphony_state_url)
        except (OSError, ValueError, urllib.error.URLError) as error:
            return 503, {
                "schema": SCHEMA,
                "sourceId": source_id,
                "state": "disconnected",
                "error": f"symphony-state-unreachable: {error.__class__.__name__}",
            }
        if source_id == "symphony-task":
            return 200, _task_receipt(state, observed_at)
        payload = dict(state)
        payload.setdefault("schema", SYMPHONY_RUNTIME_SCHEMA)
        payload.setdefault("observedAt", observed_at)
        return 200, payload

    try:
        fleet = _fleet_receipt(config)
    except FileNotFoundError:
        return 503, {
            "schema": SCHEMA,
            "sourceId": source_id,
            "state": "disconnected",
            "error": "fleet-receipt-missing",
        }
    except (OSError, ValueError) as error:
        return 503, {
            "schema": SCHEMA,
            "sourceId": source_id,
            "state": "unavailable",
            "error": f"fleet-receipt-unreadable: {error.__class__.__name__}",
        }

    if source_id == "fleet-receipt":
        payload = dict(fleet)
        payload.setdefault("schema", FLEET_SCHEMA)
        return 200, payload

    signals = fleet.get("signals")
    lease = signals.get("lease") if isinstance(signals, dict) else None
    if not isinstance(lease, dict):
        return 503, {
            "schema": SCHEMA,
            "sourceId": source_id,
            "state": "unavailable",
            "error": "missing-lease-signal",
        }
    payload = dict(lease)
    payload["schema"] = LEASE_GUARD_SCHEMA
    payload.setdefault("observedAt", observed_at)
    return 200, payload


def write_receipt(config: BridgeConfig, record: dict) -> pathlib.Path:
    """Persist the fixed bridge receipt atomically."""
    config.state_dir.mkdir(parents=True, exist_ok=True)
    receipt = {
        "schema": SCHEMA,
        "producerId": "ovie-gem-shipping-bridge",
        "producerVersion": "1",
        "emittedAt": _iso(_now()),
        **record,
    }
    fd, tmp = tempfile.mkstemp(dir=config.state_dir, prefix=".latest-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(receipt, handle, sort_keys=True)
        os.replace(tmp, config.state_dir / "latest.json")
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return config.state_dir / "latest.json"


def make_handler(config: BridgeConfig):
    class Handler(BaseHTTPRequestHandler):
        server_version = "OvieShippingBridge/1"

        def _send(self, status: int, body: dict) -> None:
            data = json.dumps(body).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def _authorized(self) -> bool:
            header = self.headers.get("Authorization") or ""
            scheme, _, token = header.partition(" ")
            return scheme == "Bearer" and hmac.compare_digest(
                token.encode(), config.token.encode()
            )

        def do_GET(self) -> None:  # noqa: N802 (stdlib API)
            if not config.token or not self._authorized():
                self._send(
                    401, {"schema": SCHEMA, "state": "unauthorized"}
                )
                return
            if not self.path.startswith(AUTHORITY_PREFIX):
                self._send(404, {"schema": SCHEMA, "state": "unknown"})
                return
            source_id = self.path[len(AUTHORITY_PREFIX):].strip("/")
            if source_id not in AUTHORITIES:
                self._send(404, {"schema": SCHEMA, "state": "unknown"})
                return
            status, payload = authority_payload(source_id, config)
            write_receipt(
                config,
                {
                    "sourceId": source_id,
                    "status": status,
                    "state": "fresh" if status == 200 else payload.get("state", "unavailable"),
                    "sourceRevision": payload.get("sourceRevision"),
                },
            )
            self._send(status, payload)

        def log_message(self, _format: str, *args: object) -> None:
            return

    return Handler


def main() -> int:
    config = BridgeConfig()
    if not config.token:
        raise SystemExit("OVIE_SHIPPING_BRIDGE_TOKEN is required")
    server = ThreadingHTTPServer(
        (config.host, config.port), make_handler(config)
    )
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
