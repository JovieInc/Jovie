#!/usr/bin/env python3
"""CI guard for the model pools table (model-pools.json): `python3 scripts/lanes/model_pools.py check`.

Fails when a lane config, registry row, workflow or lane source routes an Anthropic model through a
forbidden or undeclared pool. Exceptions live in the table with a reason, owner and removal
trigger; one that matches nothing fails, so the list only shrinks.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import model_pools as pools  # noqa: E402

MODEL_KEYS = ("model", "id", "currentModel", "modelId", "requestedModel")
MODEL_LIST_KEYS = ("alsoRoutes", "fallbacks")
SIGNAL_KEYS = ("channel", "pool", "accessPath", "provider", "accountClass")
SOURCE_SUFFIXES = (".py", ".sh", ".json", ".mjs", ".yaml", ".yml", ".service")
OWN_FILES = ("scripts/lanes/model_pools.py", "scripts/lanes/model_pool_guard.py", "scripts/lanes/model-pools.json")
GATEWAY_FORM = re.compile(r"(?i)(?<![\w/-])anthropic/(?:claude|fable|opus|sonnet|haiku)[\w.-]*")
COMMENT = re.compile(r"^\s*(?:#|//|\*|/\*)")


def _walk(node, pointer=""):
    if isinstance(node, dict):
        yield pointer, node
        for key, value in node.items():
            yield from _walk(value, f"{pointer}/{key}")
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from _walk(value, f"{pointer}/{index}")


def _node_models(node: dict) -> list[str]:
    models = [node[key] for key in MODEL_KEYS if isinstance(node.get(key), str)]
    for key in MODEL_LIST_KEYS:
        models += [item for item in node.get(key) or () if isinstance(item, str)] if isinstance(node.get(key), list) else []
    return models


def _label(pointer: str, node: dict) -> str:
    name = node.get("id") or node.get("name") or node.get("label")
    return f"{pointer or '/'}" + (f" ({name})" if isinstance(name, str) else "")


def scan_structured(path: str, data, table: dict) -> list[dict]:
    """A config object that names an Anthropic model next to a forbidden pool word."""
    found = []
    for pointer, node in _walk(data):
        models = [model for model in _node_models(node) if pools.is_anthropic(model, table)]
        if not models:
            continue
        for key in SIGNAL_KEYS:
            pool = pools.pool_for_signal(node.get(key), table)
            if pool and pools._pools(table)[pool].get("anthropic") != "allowed":
                found.append({"path": path, "rule": "anthropic-on-forbidden-pool",
                              "detail": f"{_label(pointer, node)}: {models[0]} with {key}={node[key]}",
                              "fix": pools.verdict(models[0], pool, table)})
    return found


def scan_commands(path: str, data, table: dict) -> list[dict]:
    """A lane or proposer command (`cmd`) that runs an Anthropic model: default deny. Its executor must
    belong to an allowed pool, its accountClass must name that pool, and its routes its cost class."""
    found = []
    for pointer, node in _walk(data):
        if not isinstance(node.get("cmd"), list):
            continue
        routes = [route for route in node.get("routes") or () if isinstance(route, dict)]
        where = _label(pointer, node)
        refused = pools.command_refusal(node["cmd"], None, table, agent=True)  # the same check the runner makes at spawn
        if refused:
            found.append({"path": path, "rule": "anthropic-on-forbidden-pool", "fix": refused["reason"],
                          "detail": f"{where}: {refused['model']} run by {pools.executor(node['cmd'])}"})
            continue
        models = ([node["model"]] if isinstance(node.get("model"), str) else []) + \
            [route["model"] for route in routes if isinstance(route.get("model"), str)] + pools.command_models(node["cmd"])
        models = [model for model in models if model and pools.is_anthropic(model, table)]
        if not models:
            continue
        pool = pools.pool_for_command(node["cmd"], table)
        reason = pools.verdict(models[0], pool, table)
        if reason:
            found.append({"path": path, "rule": "anthropic-on-forbidden-pool",
                          "detail": f"{where}: {models[0]} run by {pools.executor(node['cmd'])}", "fix": reason})
            continue
        declared = node.get("accountClass")
        if declared is not None and pools.pool_for_signal(declared, table) != pool:
            found.append({"path": path, "rule": "anthropic-pool-mismatch",
                          "detail": f"{where}: accountClass {declared} does not name pool {pool}",
                          "fix": f"Set accountClass to one of {pools._pools(table)[pool].get('signals')}."})
        cost_class = pools._pools(table)[pool].get("requireCostClass")
        for route in routes:
            if cost_class and pools.is_anthropic(route.get("model"), table) and route.get("costClass") != cost_class:
                found.append({"path": path, "rule": "anthropic-pool-mismatch",
                              "detail": f"{where}: route {route.get('model')} has costClass {route.get('costClass')}",
                              "fix": f"Routes on {pool} are costClass {cost_class}."})
    return found


def _forbidden(table: dict, key: str) -> list[str]:
    return sorted({item for pool in pools._pools(table).values() if pool.get("anthropic") != "allowed"
                   for item in pool.get(key) or ()})


def scan_text(path: str, text: str, table: dict, *, workflow: bool) -> list[dict]:
    """Workflows: a metered Anthropic credential, host or gateway-form model id. Lane sources: a metered
    Anthropic host, or an Anthropic id on the same line as a forbidden host. Comment lines never count."""
    found = []
    hosts = _forbidden(table, "hosts")
    api_hosts = [host for host in (pools._pools(table).get("anthropic-api") or {}).get("hosts") or ()]
    credentials = [name for name in _forbidden(table, "credentials") if name.startswith("ANTHROPIC_")]
    credential = re.compile(r"(?i)\b(?:" + "|".join(map(re.escape, credentials)) + r")\b") if credentials else None
    for number, line in enumerate(text.splitlines(), 1):
        if COMMENT.match(line):
            continue
        at = f"line {number}"
        if any(host in line for host in api_hosts):
            found.append({"path": path, "rule": "metered-anthropic-host", "detail": f"{at}: {line.strip()[:160]}",
                          "fix": pools.verdict("claude", "anthropic-api", table)})
        elif workflow and credential and credential.search(line):
            found.append({"path": path, "rule": "metered-anthropic-credential", "detail": f"{at}: {line.strip()[:160]}",
                          "fix": pools.verdict("claude", "anthropic-api", table)})
        elif (workflow and GATEWAY_FORM.search(line)) or (
                any(host in line for host in hosts) and pools.is_anthropic(GATEWAY_FORM.search(line) and GATEWAY_FORM.search(line).group(0), table)):
            found.append({"path": path, "rule": "anthropic-gateway-model", "detail": f"{at}: {line.strip()[:160]}",
                          "fix": pools.verdict("claude", "vercel-ai-gateway", table)})
    return found


def _files(root: Path, entries, suffixes) -> list[Path]:
    out = []
    for entry in entries or ():
        base = root / entry
        if base.is_file():
            out.append(base)
        elif base.is_dir():
            out += sorted(path for path in base.rglob("*") if path.is_file() and path.suffix in suffixes
                          and "__pycache__" not in path.parts and "hud_fixtures" not in path.parts)
    return out


def scan(root: Path, table: dict | None = None) -> list[dict]:
    """Every violation under `root`, after exceptions. An exception that matches nothing is itself a failure,
    so the list only shrinks. The tree is judged on the files it has: the trusted guard also scans partial
    trees (a scripts-only base, source admission fixtures), and an absent file routes nothing. A listed
    file that is present but unreadable fails."""
    root = Path(root)
    table = pools.load(root / "scripts/lanes/model-pools.json") if table is None else table
    if not table:
        return [{"path": "scripts/lanes/model-pools.json", "rule": "table-unreadable",
                 "detail": f"missing or not {pools.SCHEMA}", "fix": "Restore the model pools table."}]
    guard = table.get("guard") or {}
    found = []
    for entry in guard.get("structured") or ():
        if not (root / entry).is_file():
            continue
        try:
            data = json.loads((root / entry).read_text())
        except (OSError, ValueError):
            found.append({"path": entry, "rule": "config-unreadable", "detail": "invalid JSON",
                          "fix": "Fix the JSON or remove the file from guard.structured."})
            continue
        found += scan_structured(entry, data, table)
        if entry in (guard.get("commands") or ()):
            found += scan_commands(entry, data, table)
    for path in _files(root, guard.get("workflows"), (".yml", ".yaml")):
        found += scan_text(path.relative_to(root).as_posix(), path.read_text(errors="replace"), table, workflow=True)
    structured = set(guard.get("structured") or ())
    for path in _files(root, guard.get("sources"), SOURCE_SUFFIXES):
        rel = path.relative_to(root).as_posix()
        if rel not in OWN_FILES and rel not in structured:
            found += scan_text(rel, path.read_text(errors="replace"), table, workflow=False)
    kept, used = [], set()
    exceptions = [row for row in table.get("exceptions") or () if isinstance(row, dict)]
    for row in found:
        match = next((index for index, item in enumerate(exceptions)
                      if item.get("path") == row["path"] and item.get("rule") == row["rule"]
                      and (not item.get("match") or item["match"] in row["detail"])), None)
        if match is None:
            kept.append(row)
        else:
            used.add(match)
    for index, item in enumerate(exceptions):
        if index not in used and not (root / str(item.get("path"))).exists():
            continue
        if index not in used:
            kept.append({"path": str(item.get("path")), "rule": "stale-exception",
                         "detail": f"exception for {item.get('rule')} matches nothing",
                         "fix": "Delete this exception from scripts/lanes/model-pools.json."})
        elif not all(isinstance(item.get(key), str) and item[key] for key in ("reason", "owner", "removeWhen")):
            kept.append({"path": str(item.get("path")), "rule": "exception-incomplete",
                         "detail": "an exception needs reason, owner and removeWhen",
                         "fix": "Fill in the exception or remove the route."})
    return kept
