#!/usr/bin/env python3
"""Canonical Gem model registry adapter (stdlib only).

Both new-PR shipping and existing-PR remediation call this adapter. It is
fail-closed: deterministic gates precede model selection; exception-only
Codex routes require an explicit flag; cooldowns are persisted atomically.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import time

QUOTA_RE = re.compile(
    r"(429|rate.?limit|quota|usage (limit|exceeded|cap)|too many requests|"
    r"insufficient (credit|quota)|weekly usage|limit reached)",
    re.I,
)

HERE = pathlib.Path(__file__).resolve()
CONFIG = HERE.with_name("model-registry.json")
if not CONFIG.is_file():
    CONFIG = HERE.parent / "config" / "model-registry.json"

FORBIDDEN_MODEL_IDS = frozenset({
    "claude",
    "claude-sonnet",
    "claude-opus",
    "cursor-composer-2.5",
    "grok-composer",
    "grok-composer-2.5-fast",
})
REQUIRED_MODEL_FIELDS = (
    "id",
    "provider",
    "model",
    "family",
    "channel",
    "pool",
    "quality",
    "list_price_in",
    "list_price_out",
    "capabilities",
    "cost_tier",
)
REQUIRED_POLICY_RULES = (
    "included_subscription_is_zero_marginal",
    "never_pay_api_for_a_family_with_remaining_included_pool",
    "never_spend_api_that_would_have_been_cheaper_as_a_renewed_sub",
    "gateway_only_after_included_pools_are_exhausted",
    "no_claude",
    "no_composer",
    "no_on_demand_overage",
)


def validate_registry(data):
    if data.get("schema_version") != 1 or not data.get("deterministic_first"):
        raise ValueError("unsupported or non-deterministic registry")
    policy = data.get("routing_policy")
    if not isinstance(policy, dict):
        raise ValueError("routing_policy missing")
    rules = policy.get("rules")
    if not isinstance(rules, list) or any(rule not in rules for rule in REQUIRED_POLICY_RULES):
        raise ValueError("routing_policy.rules missing required cost rules")
    models = data.get("models")
    if not isinstance(models, list) or not models:
        raise ValueError("models missing")
    ids = []
    for model in models:
        if not isinstance(model, dict):
            raise ValueError("model is not an object")
        missing = [field for field in REQUIRED_MODEL_FIELDS if field not in model]
        if missing:
            raise ValueError(f"{model.get('id')}: missing {missing}")
        mid = model["id"]
        if mid in FORBIDDEN_MODEL_IDS or "claude" in mid or "composer" in mid:
            raise ValueError(f"forbidden model id: {mid}")
        if model["channel"] not in {"subscription", "api", "local"}:
            raise ValueError(f"{mid}: invalid channel")
        if not isinstance(model["capabilities"], list) or not model["capabilities"]:
            raise ValueError(f"{mid}: capabilities required")
        quality = model["quality"]
        if not isinstance(quality, (int, float)) or quality < 0 or quality > 100:
            raise ValueError(f"{mid}: quality must be 0-100")
        for price in ("list_price_in", "list_price_out"):
            if not isinstance(model[price], (int, float)) or model[price] < 0:
                raise ValueError(f"{mid}: {price} must be >= 0")
        ids.append(mid)
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate model ids")
    for chain in (data.get("route_chains") or {}).values():
        if not isinstance(chain, list) or any(item not in ids for item in chain):
            raise ValueError("route chain references unknown model")
    return data


def load(path=None):
    p = pathlib.Path(path or os.environ.get("GEM_MODEL_REGISTRY", CONFIG))
    data = validate_registry(json.loads(p.read_text()))
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

def configured_executable(model, prefix=""):
    env_key = model.get(f"{prefix}executable_env", "")
    default = model.get(f"{prefix}executable_default", "")
    return str(os.environ.get(env_key, default))


def executable(model):
    return configured_executable(model)


def executor(model, *, require_cwd=False):
    executable_value = configured_executable(model, "agent_")
    argv = model.get("agent_argv")
    if not executable_value or not isinstance(argv, list) or not all(isinstance(x, str) for x in argv):
        return None
    if require_cwd and not (
        any("{cwd}" in argument for argument in argv)
        or model.get("agent_cwd_mode") == "process"
    ):
        return None
    return {
        "executable": executable_value,
        "argv": argv,
    }

def _pool_state(st, pool):
    pools = st.setdefault("pools", {})
    entry = pools.get(pool)
    if not isinstance(entry, dict):
        entry = {"exhausted_until": 0, "uses": 0}
        pools[pool] = entry
    entry.setdefault("exhausted_until", 0)
    entry.setdefault("uses", 0)
    return entry


def pool_exhausted(st, pool, now):
    if not pool:
        return False
    return float(_pool_state(st, pool).get("exhausted_until") or 0) > now


def mark_pool_exhausted(st, pool, seconds, now=None):
    if not pool:
        return
    now = time.time() if now is None else now
    _pool_state(st, pool)["exhausted_until"] = now + max(60, int(seconds))
    save_state(st)


def record_pool_use(st, pool):
    if not pool:
        return
    entry = _pool_state(st, pool)
    entry["uses"] = int(entry.get("uses") or 0) + 1
    save_state(st)


def _quota_signal(text):
    return bool(text and QUOTA_RE.search(text))


def probe(m, timeout=20, st=None, now=None):
    exe = executable(m)
    resolved = exe if pathlib.Path(exe).is_absolute() else shutil.which(exe)
    if not resolved: return False, "executable_missing"
    argv = [x.format(executable=resolved, model=m["model"]) for x in m["probe_argv"]]
    try:
        result = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
        out = (result.stdout or "") + "\n" + (result.stderr or "")
        if _quota_signal(out):
            if st is not None:
                mark_pool_exhausted(st, m.get("pool"), m.get("pool_cooldown_seconds") or m.get("cooldown_seconds") or 1800, now)
            return False, "pool_exhausted"
        if m.get("probe_mode") == "exit-zero":
            return (result.returncode == 0, "ready" if result.returncode == 0 else "probe_failed")
        if m["provider"] == "ollama" and m["model"] not in result.stdout: return False, "model_missing"
        if m["provider"] == "grok" and m["model"] not in result.stdout: return False, "model_unlisted"
        if m["provider"] == "codex" and "GEM_MODEL_READY" not in result.stdout: return False, "auth_or_runtime_failed"
        if result.returncode != 0 and m["provider"] in {"cursor", "kimi"}:
            return False, "probe_failed"
        return True, "ready"
    except Exception as e: return False, type(e).__name__


def _selection_document(workflow, capability, config_path, mid, model, selected_executor, candidates, extra=None):
    selected = {
        "id": mid,
        "provider": model["provider"],
        "model": model["model"],
        "family": model.get("family"),
        "channel": model.get("channel"),
        "pool": model.get("pool"),
        "quality": model.get("quality"),
        "executable": executable(model),
        "executor": selected_executor,
        "cost_tier": model["cost_tier"],
    }
    if extra:
        selected.update(extra)
    return {
        "schema_version": 1,
        "workflow": workflow,
        "capability": capability,
        "deterministic_first": True,
        "config": str(config_path),
        "selected": selected,
        "candidates": candidates,
    }


def _job_tokens(cfg, capability):
    estimates = ((cfg.get("routing_policy") or {}).get("job_token_estimates") or {})
    estimate = estimates.get(capability) or estimates.get("code") or {"input": 80000, "output": 40000}
    return float(estimate.get("input") or 0), float(estimate.get("output") or 0)


def _job_list_cost(model, tokens_in, tokens_out):
    return (tokens_in / 1_000_000.0) * float(model.get("list_price_in") or 0) + (
        tokens_out / 1_000_000.0
    ) * float(model.get("list_price_out") or 0)


def _family_has_included(models, st, family, now, exclude_pools=()):
    if not family:
        return False
    for model in models:
        if model.get("family") != family:
            continue
        if model.get("channel") not in {"subscription", "local"}:
            continue
        if model.get("pool") in exclude_pools:
            continue
        if pool_exhausted(st, model.get("pool"), now):
            continue
        return True
    return False


def _family_sub(models, family):
    for model in models:
        if model.get("family") == family and model.get("sub_monthly_usd"):
            return model
    return None


def score_candidate(cfg, model, st, capability, now, exclude_pools=()):
    """Return (ok, reason, rank, extra). Lower rank wins."""
    policy = cfg.get("routing_policy") or {}
    tokens_in, tokens_out = _job_tokens(cfg, capability)
    list_cost = _job_list_cost(model, tokens_in, tokens_out)
    channel = model.get("channel") or (
        "api" if str(model.get("cost_tier") or "").startswith("gateway") else "subscription"
    )
    family = model.get("family")
    uses = int(_pool_state(st, model.get("pool")).get("uses") or 0)
    quality = int(model.get("quality") or 0)
    extra = {"marginal_usd": 0.0, "list_cost_usd": round(list_cost, 4), "channel": channel}

    if channel in {"subscription", "local"}:
        extra["marginal_usd"] = 0.0
        return True, "included", (0, -quality, uses, model["id"]), extra

    if _family_has_included(cfg["models"], st, family, now, exclude_pools):
        return False, "family_sub_remaining", None, extra

    sub = _family_sub(cfg["models"], family)
    if sub:
        fraction = float(policy.get("api_burn_fraction_of_sub") or 0.15)
        cap = float(sub.get("sub_monthly_usd") or 0) * fraction
        spent = float((st.get("api_spend") or {}).get(family) or 0)
        if spent + list_cost > cap:
            extra["renew_subscription"] = {
                "family": family,
                "sub_monthly_usd": sub.get("sub_monthly_usd"),
                "effective_included_usd": float(sub.get("sub_monthly_usd") or 0)
                * float(sub.get("sub_included_multiplier") or 1),
                "period_api_spend": spent,
                "job_list_cost": round(list_cost, 4),
                "cap": cap,
            }
            return False, "renew_sub_not_api", None, extra

    extra["marginal_usd"] = round(list_cost, 4)
    return True, "api", (1, list_cost, -quality, model["id"]), extra


def record_api_spend(st, family, amount):
    if not family or amount <= 0:
        return
    spend = st.setdefault("api_spend", {})
    spend[family] = float(spend.get(family) or 0) + float(amount)
    save_state(st)


def choose(workflow, capability, allow_exceptions=False, path=None, exclude_pools=None):
    cfg, config_path = load(path); mm = model_map(cfg); st = state(); now = time.time()
    exclude_pools = tuple(exclude_pools or ())
    chain = cfg["route_chains"][workflow]
    candidates = []
    ready = []
    for mid in chain:
        m = mm[mid]
        if capability not in m["capabilities"]: continue
        if m.get("pool") in exclude_pools:
            candidates.append({"id": mid, "status": "unavailable", "reason": "excluded_pool", "pool": m.get("pool")})
            continue
        if m.get("exception_only") and not allow_exceptions: continue
        until = float(st.get("cooldowns", {}).get(mid, 0))
        if until > now:
            candidates.append({"id": mid, "status": "cooldown", "until": until})
            continue
        if pool_exhausted(st, m.get("pool"), now):
            candidates.append({"id": mid, "status": "unavailable", "reason": "pool_exhausted", "pool": m.get("pool")})
            continue
        ok, reason = probe(m, st=st, now=now)
        selected_executor = executor(m, require_cwd=workflow == "remediation")
        if ok and selected_executor is None:
            candidates.append({"id": mid, "status": "unavailable", "reason": "executor_invalid", "pool": m.get("pool")})
            continue
        if not ok:
            candidates.append({"id": mid, "status": "unavailable", "reason": reason, "pool": m.get("pool")})
            continue
        scored, score_reason, rank, extra = score_candidate(cfg, m, st, capability, now, exclude_pools)
        row = {"id": mid, "status": "ready" if scored else "unavailable", "reason": score_reason, "pool": m.get("pool"), "family": m.get("family")}
        if extra.get("renew_subscription"):
            row["renew_subscription"] = extra["renew_subscription"]
        candidates.append(row)
        if scored:
            ready.append((rank, mid, m, selected_executor, extra))
    if ready:
        ready.sort(key=lambda item: item[0])
        _rank, mid, model, selected_executor, extra = ready[0]
        record_pool_use(st, model.get("pool"))
        if extra.get("channel") == "api":
            record_api_spend(st, model.get("family"), extra.get("marginal_usd") or 0)
        return _selection_document(workflow, capability, config_path, mid, model, selected_executor, candidates, extra)
    return {"schema_version": 1, "workflow": workflow, "capability": capability, "deterministic_first": True, "config": str(config_path), "selected": None, "candidates": candidates}

def main():
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("choose"); c.add_argument("--workflow", choices=["remediation", "new_pr"], required=True); c.add_argument("--capability", default="mechanical"); c.add_argument("--allow-codex-exception", action="store_true"); c.add_argument("--exclude-pool", action="append", default=[]); c.add_argument("--config")
    p = sub.add_parser("probe"); p.add_argument("--config")
    v = sub.add_parser("validate"); v.add_argument("--config")
    args = ap.parse_args(); cfg, config_path = load(getattr(args, "config", None))
    if args.cmd == "probe":
        print(json.dumps({m["id"]: {"ready": probe(m)[0], "reason": probe(m)[1]} for m in cfg["models"]}, indent=2)); return 0
    if args.cmd == "validate":
        print(json.dumps({"ok": True, "config": str(config_path), "models": len(cfg["models"])}, indent=2)); return 0
    print(json.dumps(choose(args.workflow, args.capability, args.allow_codex_exception, args.config, args.exclude_pool), indent=2)); return 0
if __name__ == "__main__": sys.exit(main())
