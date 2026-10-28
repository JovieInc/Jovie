"""Availability watch for registry roles (read-only, metadata only).

A role candidate that is only being watched never wins until this confirms it. The Hyperagent MCP exposes
no model catalog tool, so the signal is a Hyperagent agent named for the model (list_agents); agents are
created per model (GLM 5.3 Developer, GLM 5.3 Flash Developer). Writes watch rows into capacity-live.json and
the resolved roles into state/roles.json for agents that cannot import the registry.
"""
from __future__ import annotations

import re
import shutil
import runpy

import capacity_registry


def hyperagent_agent_names(call=None) -> list[str] | None:
    """Agent names from list_agents, or None when the transport is unavailable."""
    if call is None:
        executable = shutil.which("hyperagent")
        if not executable:
            return None
        try:
            call = runpy.run_path(executable)["mcp_call"]
        except (Exception, SystemExit):
            return None
    try:
        agents = call("list_agents", {}).get("agents", [])
    except (Exception, SystemExit):
        return None
    return [str(a.get("name")) for a in agents if isinstance(a, dict) and a.get("name")]


def read_watch(registry: dict, now_iso: str, names: list[str] | None) -> dict:
    """{'models': {model: {available, via, agent, observedAt}}} for every candidate with a watch."""
    out = {}
    for role in (registry.get("roles") or {}).values():
        for candidate in role.get("candidates", []):
            pattern = ((candidate.get("availability") or {}).get("watch") or {}).get("hyperagentAgentNamePattern")
            if not pattern:
                continue
            if names is None:
                out[candidate["model"]] = {"available": False, "via": "hyperagent-unreadable", "observedAt": now_iso}
                continue
            hit = next((n for n in names if re.search(pattern, n, re.IGNORECASE)), None)
            out[candidate["model"]] = {"available": hit is not None, "via": "hyperagent-agent" if hit else "not-listed",
                                       "agent": hit, "observedAt": now_iso}
    return {"models": out}


def resolve_roles(registry: dict, watch: dict) -> dict:
    return {rid: capacity_registry.resolve_role(registry, rid, watch.get("models") or {})
            for rid in (registry.get("roles") or {})}
