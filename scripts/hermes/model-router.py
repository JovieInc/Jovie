#!/usr/bin/env python3
"""Canonical Gem model registry adapter (stdlib only).

Both new-PR shipping and existing-PR remediation call this adapter. It is
fail-closed: deterministic gates precede model selection; exception-only
Codex routes require an explicit flag; cooldowns are persisted atomically.
"""
from __future__ import annotations
import argparse, json, os, pathlib, shutil, subprocess, sys, tempfile, time

HERE = pathlib.Path(__file__).resolve()
CONFIG = HERE.parent / "config" / "model-registry.json"

def load(path=None):
    p = pathlib.Path(path or os.environ.get("GEM_MODEL_REGISTRY", CONFIG))
    data = json.loads(p.read_text())
    if data.get("schema_version") != 1 or not data.get("deterministic_first"):
        raise ValueError("unsupported or non-deterministic registry")
    return data, p

def state_path():
    return pathlib.Path(os.environ.get("GEM_MODEL_ROUTER_STATE", str(HERE.parent.parent.parent / "state" / "gem-model-router.json")))

def state():
    try: return json.loads(state_path().read_text())
    except Exception: return {}

def save_state(d):
    p = state_path(); p.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=p.name + ".", dir=p.parent)
    try:
        with os.fdopen(fd, "w") as f: json.dump(d, f, indent=2); f.write("\n")
        os.replace(tmp, p)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)

def model_map(cfg): return {m["id"]: m for m in cfg["models"]}

def executable(m): return str(os.environ.get(m.get("executable_env", ""), m.get("executable_default", "")))

def probe(m, timeout=20):
    exe = executable(m)
    resolved = exe if pathlib.Path(exe).is_absolute() else shutil.which(exe)
    if not resolved: return False, "executable_missing"
    argv = [x.format(executable=resolved, model=m["model"]) for x in m["probe_argv"]]
    try:
        out = subprocess.run(argv, capture_output=True, text=True, timeout=timeout).stdout
        if m["provider"] == "ollama" and m["model"] not in out: return False, "model_missing"
        if m["provider"] == "grok" and m["model"] not in out: return False, "model_unlisted"
        if m["provider"] == "codex" and "GEM_MODEL_READY" not in out: return False, "auth_or_runtime_failed"
        return True, "ready"
    except Exception as e: return False, type(e).__name__

def choose(workflow, capability, allow_exceptions=False, path=None):
    cfg, config_path = load(path); mm = model_map(cfg); st = state(); now = time.time()
    chain = cfg["route_chains"][workflow]
    candidates = []
    for mid in chain:
        m = mm[mid]
        if capability not in m["capabilities"]: continue
        if m.get("exception_only") and not allow_exceptions: continue
        until = float(st.get("cooldowns", {}).get(mid, 0))
        if until > now: candidates.append({"id": mid, "status": "cooldown", "until": until}); continue
        ok, reason = probe(m)
        candidates.append({"id": mid, "status": "ready" if ok else "unavailable", "reason": reason})
        if ok:
            return {"schema_version": 1, "workflow": workflow, "capability": capability, "deterministic_first": True, "config": str(config_path), "selected": {"id": mid, "provider": m["provider"], "model": m["model"], "executable": executable(m), "cost_tier": m["cost_tier"]}, "candidates": candidates}
    return {"schema_version": 1, "workflow": workflow, "capability": capability, "deterministic_first": True, "config": str(config_path), "selected": None, "candidates": candidates}

def main():
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("choose"); c.add_argument("--workflow", choices=["remediation", "new_pr"], required=True); c.add_argument("--capability", default="mechanical"); c.add_argument("--allow-codex-exception", action="store_true"); c.add_argument("--config")
    p = sub.add_parser("probe"); p.add_argument("--config")
    args = ap.parse_args(); cfg, _ = load(getattr(args, "config", None))
    if args.cmd == "probe":
        print(json.dumps({m["id"]: {"ready": probe(m)[0], "reason": probe(m)[1]} for m in cfg["models"]}, indent=2)); return 0
    print(json.dumps(choose(args.workflow, args.capability, args.allow_codex_exception, args.config), indent=2)); return 0
if __name__ == "__main__": sys.exit(main())
