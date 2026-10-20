#!/usr/bin/env python3
"""Live hyperagent.com execute path for Gem/Summer.

Repository-managed; install with python3 scripts/hyperagent/install.py.
Recovered from installed CLI SHA256 d38a1f8f89d0f1492538da6ba005bdf6a5b55d56f60efdd15b3c2e609ab97a73.
Talks to https://hyperagent.com/api/mcp with a stored OAuth token (hat_).
Eve-the-Hyperagent-agent is retired. Eve is the Vercel framework that runs Summer.

Probe:  hyperagent models --json
Exec:   hyperagent --model {model} -p {prompt}
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SCHEMA = "gem-hyperagent-cli/v1"
MCP_URL = "https://hyperagent.com/api/mcp"
TOKEN_URL = "https://hyperagent.com/api/oauth/token"
AUTHORIZE_URL = "https://hyperagent.com/api/oauth/authorize"
REGISTER_URL = "https://hyperagent.com/api/oauth/register"
RESOURCE = "https://hyperagent.com/api/mcp"
SCOPE = "threads:read threads:write approvals:read approvals:write offline_access"
CLIENT_NAME = "gem-hyperagent-cli"
PROTOCOL = "2025-03-26"
THREAD_URL = "https://hyperagent.com/thread/{thread_id}"
EXIT_OK = 0
EXIT_USAGE = 2
EXIT_CONFIG = 78
SECRET_RE = re.compile(r"hat_[A-Za-z0-9_-]+")
PLACEHOLDER_RE = re.compile(r"^\[\d+ tool calls?\]$")

MAPPING_SCHEMA = "jovie-hyperagent-models/v1"


class MappingError(ValueError):
    """An invalid mapping must never fall back to another agent."""


def mapping_path() -> Path:
    override = os.environ.get("HYPERAGENT_MODELS_FILE")
    return Path(override) if override is not None else Path(__file__).resolve().with_name("models.json")


def load_mappings() -> dict:
    def unique_object(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise MappingError("duplicate mapping key")
            result[key] = value
        return result

    try:
        document = json.loads(mapping_path().read_text(encoding="utf-8"), object_pairs_hook=unique_object)
    except (OSError, ValueError) as exc:
        raise MappingError("cannot read valid Hyperagent model configuration") from exc
    if (not isinstance(document, dict) or set(document) != {"schema", "models"}
            or document["schema"] != MAPPING_SCHEMA):
        raise MappingError("invalid Hyperagent model configuration schema")
    models = document["models"]
    if not isinstance(models, dict) or not models:
        raise MappingError("model mappings must be a nonempty object")
    agents = set()
    for model, spec in models.items():
        if not re.fullmatch(r"[a-z0-9][a-z0-9./_-]*", model):
            raise MappingError("invalid model identifier")
        if not isinstance(spec, dict) or set(spec) != {"agent_id", "agent_name", "role"}:
            raise MappingError("invalid model mapping fields")
        agent = spec["agent_id"]
        name = spec["agent_name"]
        if not isinstance(agent, str) or not re.fullmatch(r"[a-z0-9]{25}", agent):
            raise MappingError("invalid agent identifier")
        if (not isinstance(name, str) or not name.strip() or name != name.strip()
                or len(name) > 100 or any(ord(char) < 32 for char in name)):
            raise MappingError("invalid agent name")
        if spec["role"] not in ("coding", "research"):
            raise MappingError("invalid agent role")
        if agent in agents:
            raise MappingError("an agent cannot map to multiple models")
        agents.add(agent)
    return models


def config_dir() -> Path:
    override = os.environ.get("HYPERAGENT_CONFIG_DIR")
    return Path(override) if override else Path.home() / ".config" / "hyperagent"


def token_path() -> Path:
    override = os.environ.get("HYPERAGENT_MCP_TOKEN_FILE")
    return Path(override) if override else config_dir() / "mcp-oauth.json"


def client_path() -> Path:
    return config_dir() / "mcp-oauth-client.json"


def redact(text: str) -> str:
    return SECRET_RE.sub("hat_[redacted]", text or "")


def eprint(*parts: object) -> None:
    sys.stderr.write(redact(" ".join(str(part) for part in parts)) + "\n")


def die(code: int, message: str) -> int:
    eprint(message)
    return code


def load_json(path: Path) -> dict:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def save_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.parent.chmod(0o700)
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(json.dumps(payload), encoding="utf-8")
    tmp.chmod(0o600)
    tmp.replace(path)
    path.chmod(0o600)


def token_bundle() -> dict:
    env_token = os.environ.get("HYPERAGENT_MCP_TOKEN", "").strip()
    if env_token:
        return {"access_token": env_token, "token_type": "bearer", "obtained_at": int(time.time()), "expires_in": 0}
    path = token_path()
    if not path.is_file():
        return {}
    return load_json(path)


def token_expired(bundle: dict, skew: int = 60) -> bool:
    access = bundle.get("access_token")
    if not isinstance(access, str) or not access:
        return True
    obtained = int(bundle.get("obtained_at") or 0)
    expires_in = int(bundle.get("expires_in") or 0)
    if not obtained or not expires_in:
        return False
    return time.time() >= obtained + expires_in - skew


def refresh_bundle(bundle: dict) -> dict:
    refresh = bundle.get("refresh_token")
    client_id = bundle.get("client_id") or load_json(client_path()).get("client_id")
    if not refresh or not client_id:
        return bundle
    body = urllib.parse.urlencode(
        {
            "grant_type": "refresh_token",
            "refresh_token": refresh,
            "client_id": client_id,
            "resource": RESOURCE,
        }
    ).encode()
    req = urllib.request.Request(
        TOKEN_URL,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        tok = json.loads(resp.read().decode())
    out = {
        "token_type": tok.get("token_type") or "bearer",
        "scope": tok.get("scope") or bundle.get("scope"),
        "expires_in": tok.get("expires_in"),
        "obtained_at": int(time.time()),
        "access_token": tok.get("access_token"),
        "refresh_token": tok.get("refresh_token") or refresh,
        "client_id": client_id,
        "resource": RESOURCE,
    }
    if os.environ.get("HYPERAGENT_MCP_TOKEN"):
        return out
    save_json(token_path(), out)
    return out


def access_token() -> str:
    bundle = token_bundle()
    if not bundle.get("access_token"):
        raise RuntimeError(
            f"missing Hyperagent MCP token; run `{sys.argv[0]} login` or write {token_path()}"
        )
    if token_expired(bundle):
        try:
            bundle = refresh_bundle(bundle)
        except Exception as exc:
            raise RuntimeError(f"hyperagent token refresh failed: {type(exc).__name__}") from exc
    token = bundle.get("access_token")
    if not isinstance(token, str) or not token:
        raise RuntimeError("hyperagent access token missing after refresh")
    return token


def http_json(url: str, payload: dict | None, headers: dict, timeout: int = 30) -> tuple[int, dict, dict | list | str]:
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if data is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            parsed: dict | list | str
            try:
                parsed = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                parsed = raw
            return resp.status, dict(resp.headers.items()), parsed
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = {"raw": redact(raw[:2000])}
        raise RuntimeError(f"HTTP {exc.code} {redact(str(parsed)[:500])}") from exc


def mcp_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "MCP-Protocol-Version": PROTOCOL,
    }


def mcp_call(name: str, arguments: dict | None = None, timeout: int = 60) -> dict:
    token = access_token()
    headers = mcp_headers(token)
    init = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": PROTOCOL,
            "capabilities": {},
            "clientInfo": {"name": CLIENT_NAME, "version": "1.0.0"},
        },
    }
    status, hdrs, body = http_json(MCP_URL, init, headers, timeout=timeout)
    if status != 200 or not isinstance(body, dict) or "result" not in body:
        raise RuntimeError(f"mcp initialize failed: HTTP {status}")
    session = hdrs.get("Mcp-Session-Id") or hdrs.get("mcp-session-id")
    if session:
        headers = {**headers, "Mcp-Session-Id": session}
    try:
        http_json(MCP_URL, {"jsonrpc": "2.0", "method": "notifications/initialized"}, headers, timeout=timeout)
    except RuntimeError:
        pass
    call = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {"name": name, "arguments": arguments or {}},
    }
    status, _hdrs, body = http_json(MCP_URL, call, headers, timeout=timeout)
    if not isinstance(body, dict):
        raise RuntimeError("mcp tools/call returned non-json")
    if body.get("error"):
        raise RuntimeError(f"mcp {name} error: {redact(json.dumps(body['error'])[:500])}")
    result = body.get("result")
    if not isinstance(result, dict):
        raise RuntimeError(f"mcp {name} missing result")
    if result.get("isError"):
        raise RuntimeError(f"mcp {name} tool error")
    content = result.get("content")
    if not isinstance(content, list) or not content:
        return result
    text = content[0].get("text") if isinstance(content[0], dict) else None
    if isinstance(text, str) and text:
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return {"text": text}
    return result


def models_document(role: str = "coding") -> dict:
    if role not in ("coding", "research"):
        raise MappingError("invalid requested role")
    models = {model: spec for model, spec in load_mappings().items()
              if role == "research" or spec["role"] == "coding"}
    return {"models": models, "schema": SCHEMA, "surface": "mcp"}


def resolve_agent(model: str, agent_id: str | None, role: str = "coding") -> tuple[str, str]:
    models = models_document(role)["models"]
    spec = models.get(model)
    if not spec:
        raise MappingError("model is unknown or unavailable for the requested role; refusing silent swap")
    if agent_id is not None and agent_id != spec["agent_id"]:
        raise MappingError("agent override does not match the configured model and role")
    return spec["agent_id"], spec["agent_name"]


def last_assistant_text(payload: dict) -> str | None:
    messages = payload.get("messages")
    if not isinstance(messages, list):
        return None
    text = None
    for message in messages:
        if not isinstance(message, dict) or message.get("role") != "assistant":
            continue
        content = message.get("content")
        if not isinstance(content, str):
            continue
        stripped = content.strip()
        if not stripped or PLACEHOLDER_RE.match(stripped):
            continue
        text = stripped
    return text


def execute(model: str, prompt: str, agent_id: str | None, timeout: int, poll: float, as_json: bool, role: str = "coding") -> int:
    mapped_id, mapped_name = resolve_agent(model, agent_id, role)
    naming = f"Gem {mapped_name} {model}"
    created = mcp_call(
        "create_thread",
        {
            "agentId": mapped_id,
            "message": prompt,
            "namingHint": naming[:80],
        },
    )
    thread_id = created.get("threadId") or created.get("thread_id") or (created.get("thread") or {}).get("id")
    if not isinstance(thread_id, str) or not thread_id:
        raise RuntimeError("create_thread did not return threadId")
    url = THREAD_URL.format(thread_id=thread_id)
    eprint(f"hyperagent: thread {url} agent={mapped_name} model={model}")
    deadline = time.time() + timeout
    last_text = None
    while time.time() < deadline:
        payload = mcp_call("get_thread", {"threadId": thread_id, "messageLimit": 50})
        running = payload.get("isRunning") is True
        awaiting = payload.get("awaitingApproval") is True
        last_text = last_assistant_text(payload) or last_text
        if awaiting:
            eprint(f"hyperagent: awaiting approval on {url}")
            return die(EXIT_USAGE, "ask-first/approval pause; resolve in Hyperagent")
        if not running:
            if not last_text:
                return die(EXIT_USAGE, f"thread finished with no assistant text: {url}")
            if as_json:
                print(
                    json.dumps(
                        {
                            "ok": True,
                            "schema": SCHEMA,
                            "thread_id": thread_id,
                            "thread_url": url,
                            "agent_id": mapped_id,
                            "agent_name": mapped_name,
                            "model": model,
                            "text": last_text,
                        }
                    )
                )
            else:
                sys.stdout.write(last_text if last_text.endswith("\n") else last_text + "\n")
            return EXIT_OK
        time.sleep(max(1.0, poll))
    eprint(f"hyperagent: timeout after {timeout}s still running {url}")
    return EXIT_USAGE


def cmd_models(as_json: bool, role: str = "coding") -> int:
    doc = models_document(role)
    if as_json:
        print(json.dumps({"models": {key: {} for key in doc["models"]}}))
        return EXIT_OK
    print(json.dumps(doc, indent=2))
    return EXIT_OK


def cmd_login() -> int:
    import base64
    import hashlib
    import secrets
    import threading
    import webbrowser
    from http.server import BaseHTTPRequestHandler, HTTPServer

    redirect = os.environ.get("HYPERAGENT_OAUTH_REDIRECT", "http://127.0.0.1:8765/callback")
    parsed = urllib.parse.urlparse(redirect)
    host, port = parsed.hostname or "127.0.0.1", parsed.port or 8765
    register = {
        "client_name": CLIENT_NAME,
        "redirect_uris": [redirect],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
        "scope": SCOPE,
    }
    _status, _hdrs, client = http_json(
        REGISTER_URL,
        register,
        {"Content-Type": "application/json", "Accept": "application/json"},
    )
    if not isinstance(client, dict) or not client.get("client_id"):
        return die(EXIT_CONFIG, "oauth register failed")
    client_id = client["client_id"]
    save_json(
        client_path(),
        {
            "client_id": client_id,
            "redirect_uris": [redirect],
            "token_endpoint": TOKEN_URL,
            "authorization_endpoint": AUTHORIZE_URL,
            "resource": RESOURCE,
            "scope": SCOPE,
        },
    )
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(24)
    result: dict[str, str] = {}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args: object) -> None:
            return

        def do_GET(self) -> None:  # noqa: N802
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            result.update({key: values[0] for key, values in query.items() if values})
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<html><body><p>Gem Hyperagent CLI authorized. Close this tab.</p></body></html>")

    httpd = HTTPServer((host, port), Handler)
    thread = threading.Thread(target=httpd.handle_request, daemon=True)
    thread.start()
    url = AUTHORIZE_URL + "?" + urllib.parse.urlencode(
        {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect,
            "scope": SCOPE,
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "resource": RESOURCE,
        }
    )
    eprint("hyperagent: opening browser for MCP OAuth")
    webbrowser.open(url, new=1, autoraise=True)
    thread.join(timeout=180)
    httpd.server_close()
    if result.get("state") != state or not result.get("code"):
        return die(EXIT_USAGE, f"oauth callback missing code: {result.get('error') or 'no_code'}")
    body = urllib.parse.urlencode(
        {
            "grant_type": "authorization_code",
            "code": result["code"],
            "redirect_uri": redirect,
            "client_id": client_id,
            "code_verifier": verifier,
            "resource": RESOURCE,
        }
    ).encode()
    req = urllib.request.Request(
        TOKEN_URL,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        tok = json.loads(resp.read().decode())
    access = tok.get("access_token") or ""
    if not isinstance(access, str) or not access.startswith("hat_"):
        return die(EXIT_CONFIG, "oauth token was not a Hyperagent hat_ bearer")
    save_json(
        token_path(),
        {
            "token_type": tok.get("token_type") or "bearer",
            "scope": tok.get("scope"),
            "expires_in": tok.get("expires_in"),
            "obtained_at": int(time.time()),
            "access_token": access,
            "refresh_token": tok.get("refresh_token"),
            "client_id": client_id,
            "resource": RESOURCE,
        },
    )
    eprint(f"hyperagent: saved token to {token_path()} (mode 0600)")
    return EXIT_OK


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="hyperagent",
        description="Gem/Summer execute wrapper for hyperagent.com MCP (not a probe-only shim).",
    )
    parser.add_argument("command", nargs="?", help="models | login | execute")
    parser.add_argument("--model", help="Registry model id, e.g. z-ai/glm-5.3-flash")
    parser.add_argument("-p", "--prompt", help="Opening user message for create_thread")
    parser.add_argument("--agent-id", dest="agent_id", help="Must match the configured agent for this model")
    parser.add_argument("--role", choices=("coding", "research"), default="coding",
                        help="coding (default, shipping safe) or research (also permits coding agents)")
    parser.add_argument("--json", action="store_true", help="JSON output")
    parser.add_argument("--timeout", type=int, default=int(os.environ.get("HYPERAGENT_TIMEOUT_SECONDS", "1800")))
    parser.add_argument("--poll", type=float, default=float(os.environ.get("HYPERAGENT_POLL_SECONDS", "4")))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    command = args.command
    if command in {None, "execute"} and args.model and args.prompt:
        command = "execute"
    if command == "models":
        try:
            return cmd_models(args.json, args.role)
        except MappingError as exc:
            return die(EXIT_CONFIG, str(exc))
    if command == "login":
        try:
            return cmd_login()
        except Exception as exc:
            return die(EXIT_CONFIG, f"login failed: {type(exc).__name__}: {redact(str(exc))}")
    if command == "execute" or (args.model and args.prompt):
        if not args.model or not args.prompt:
            return die(EXIT_USAGE, "execute requires --model and -p/--prompt")
        try:
            return execute(args.model, args.prompt, args.agent_id, args.timeout, args.poll, args.json, args.role)
        except MappingError as exc:
            return die(EXIT_CONFIG, str(exc))
        except Exception as exc:
            message = redact(str(exc))
            if "missing Hyperagent MCP token" in message:
                return die(EXIT_CONFIG, message)
            return die(EXIT_USAGE, f"execute failed: {type(exc).__name__}: {message}")
    if command in {None, "help"}:
        build_parser().print_help()
        return EXIT_OK
    return die(EXIT_USAGE, f"unknown command {command}")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
