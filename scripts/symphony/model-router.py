#!/usr/bin/env python3
"""Canonical Gem model registry adapter (stdlib only).

Both new-PR shipping and existing-PR remediation call this adapter. It is
fail-closed: deterministic gates precede model selection; exception-only
Codex routes require an explicit flag; cooldowns are persisted atomically.
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime

QUOTA_RE = re.compile(
    r"(429|402|rate.?limit|quota|usage (limit|exceeded|cap)|too many requests|"
    r"insufficient (credit|quota)|weekly usage|limit reached|can only afford|"
    r"max_tokens)",
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


def route_priority(model):
    """Preserve included capacity, then Hyperagent overflow, then Gateway."""
    if model.get("channel") in {"subscription", "local"}:
        return 0
    if model.get("provider") == "hyperagent":
        return 1
    if model.get("provider") == "vercel-ai-gateway":
        return 2
    raise ValueError(f"{model.get('id')}: direct provider API routes are forbidden")


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
        route_priority(model)
        if not isinstance(model["capabilities"], list) or not model["capabilities"]:
            raise ValueError(f"{mid}: capabilities required")
        quality = model["quality"]
        if not isinstance(quality, (int, float)) or quality < 0 or quality > 100:
            raise ValueError(f"{mid}: quality must be 0-100")
        for price in ("list_price_in", "list_price_out"):
            if not isinstance(model[price], (int, float)) or model[price] < 0:
                raise ValueError(f"{mid}: {price} must be >= 0")
        _validate_economics(mid, model)
        ids.append(mid)
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate model ids")
    for chain in (data.get("route_chains") or {}).values():
        if not isinstance(chain, list) or any(item not in ids for item in chain):
            raise ValueError("route chain references unknown model")
    return data


def _timestamp(value):
    """Epoch seconds from a number or an ISO-8601 string; None when invalid."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return None
    return None


def _validate_economics(mid, model):
    """Optional pricing fields: promos with an end date and credit multipliers."""
    promo = model.get("promo")
    if promo is not None:
        if not isinstance(promo, dict) or _timestamp(promo.get("until")) is None:
            raise ValueError(f"{mid}: promo needs an until date")
        for price in ("price_in", "price_out"):
            value = promo.get(price)
            if not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0:
                raise ValueError(f"{mid}: promo.{price} must be >= 0")
    by_capability = model.get("quality_by_capability")
    if by_capability is not None:
        if not isinstance(by_capability, dict) or not by_capability or any(
            not isinstance(value, (int, float)) or isinstance(value, bool) or not 0 <= value <= 100
            for value in by_capability.values()
        ):
            raise ValueError(f"{mid}: quality_by_capability values must be 0-100")
    if "effective_price_multiplier" in model:
        value = model["effective_price_multiplier"]
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not 0 <= value <= 1:
            raise ValueError(f"{mid}: effective_price_multiplier must be 0-1")
        if not str(model.get("price_basis") or "").strip():
            raise ValueError(f"{mid}: effective_price_multiplier needs price_basis")


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

def update_state(snapshot, mutate):
    """Merge one transition under the stable state lock, never stale snapshots."""
    path = state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path.with_name(path.name + ".lock"), "a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        latest = state()
        mutate(latest)
        save_state(latest)
        snapshot.clear()
        snapshot.update(latest)


def model_map(cfg): return {m["id"]: m for m in cfg["models"]}

def _runnable(candidate: str) -> str | None:
    if not candidate:
        return None
    path = pathlib.Path(candidate).expanduser()
    resolved = str(path) if path.is_absolute() else shutil.which(candidate)
    if resolved and os.access(resolved, os.X_OK):
        return resolved
    return None


def configured_executable(model, prefix=""):
    env_key = model.get(f"{prefix}executable_env", "")
    default = model.get(f"{prefix}executable_default", "")
    explicit = os.environ.get(env_key) if env_key else None
    if explicit:
        return str(explicit)
    candidates = []
    if model.get("provider") == "grok":
        alias = os.environ.get("GEM_GROK_BIN")
        if alias:
            candidates.append(alias)
        home = pathlib.Path.home()
        candidates.append(str(home / ".local/bin/grok"))
        candidates.append(str(home / ".grok/bin/grok"))
    if model.get("provider") == "cursor":
        alias = os.environ.get("GEM_CURSOR_BIN")
        if alias:
            candidates.append(alias)
        home = pathlib.Path.home()
        candidates.append(str(home / ".local/bin/cursor-agent-std"))
        candidates.append(str(home / ".local/bin/cursor-agent"))
    if default:
        candidates.append(str(default))
    for candidate in candidates:
        resolved = _runnable(candidate)
        if resolved:
            return resolved
    return str(default)


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
    until = now + max(60, int(seconds))
    def mutate(latest):
        entry = _pool_state(latest, pool)
        entry["exhausted_until"] = max(float(entry["exhausted_until"] or 0), until)
    update_state(st, mutate)


def record_pool_use(st, pool):
    if not pool:
        return
    def mutate(latest):
        entry = _pool_state(latest, pool)
        entry["uses"] = int(entry.get("uses") or 0) + 1
    update_state(st, mutate)


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
        forbidden = [
            str(value).lower()
            for value in (m.get("probe_forbidden_patterns") or [])
            if isinstance(value, str) and value
        ]
        if any(pattern in out.lower() for pattern in forbidden):
            return False, "auth_or_runtime_failed"
        if _quota_signal(out):
            if st is not None:
                mark_pool_exhausted(st, m.get("pool"), m.get("pool_cooldown_seconds") or m.get("cooldown_seconds") or 1800, now)
            return False, "pool_exhausted"
        if m.get("probe_mode") == "exit-zero":
            return (result.returncode == 0, "ready" if result.returncode == 0 else "probe_failed")
        if m.get("probe_mode") == "json-model-key":
            try:
                payload = json.loads(result.stdout)
                models = payload.get("models")
            except (AttributeError, TypeError, ValueError, json.JSONDecodeError):
                return False, "probe_invalid_json"
            ready = result.returncode == 0 and isinstance(models, dict) and m["model"] in models
            return ready, "ready" if ready else "model_unlisted"
        if result.returncode != 0: return False, "probe_failed"
        if m["provider"] == "ollama" and m["model"] not in result.stdout: return False, "model_missing"
        if m["provider"] == "grok" and m["model"] not in result.stdout: return False, "model_unlisted"
        if m["provider"] == "codex" and "GEM_MODEL_READY" not in result.stdout: return False, "auth_or_runtime_failed"
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


def effective_prices(model, now):
    """Per-1M-token prices after an active promo and any credit multiplier."""
    price_in = float(model.get("list_price_in") or 0)
    price_out = float(model.get("list_price_out") or 0)
    basis = "list"
    promo = model.get("promo")
    if isinstance(promo, dict) and (_timestamp(promo.get("until")) or 0) > now:
        price_in = float(promo.get("price_in") or 0)
        price_out = float(promo.get("price_out") or 0)
        basis = "promo"
    multiplier = float(model.get("effective_price_multiplier", 1))
    if multiplier != 1:
        price_in *= multiplier
        price_out *= multiplier
        basis += "+credits"
    return price_in, price_out, basis


def capability_quality(model, capability):
    """Benchmark-backed quality for this capability, else the global quality."""
    by_capability = model.get("quality_by_capability") or {}
    value = by_capability.get(capability)
    return float(value if isinstance(value, (int, float)) else model.get("quality") or 0)


def _outcome(st, model_id, capability):
    return ((st.get("outcomes") or {}).get(model_id) or {}).get(capability) or {}


def expected_cost_per_success(cfg, model, st, capability, now):
    """Expected USD to get one successful result for this capability.

    Cost of one attempt (tokens at the effective price plus valued minutes)
    divided by the success probability. Success is a Beta-smoothed blend of
    observed outcomes and the registry quality prior; observed tokens and
    minutes replace the job estimate once there are enough samples.
    """
    policy = cfg.get("routing_policy") or {}
    min_samples = int(policy.get("min_samples") or 5)
    prior_weight = float(policy.get("prior_weight") or 2)
    minute_value = float(policy.get("minute_value_usd") or 0)
    prior_p = min(0.99, max(0.01, capability_quality(model, capability) / 100.0))
    observed = _outcome(st, model["id"], capability)
    attempts = max(0, int(observed.get("attempts") or 0))
    successes = min(attempts, max(0, int(observed.get("successes") or 0)))
    p_success = (successes + prior_weight * prior_p) / (attempts + prior_weight)
    if attempts >= min_samples:
        tokens_in = float(observed.get("tokens_in") or 0) / attempts
        tokens_out = float(observed.get("tokens_out") or 0) / attempts
        minutes = float(observed.get("minutes") or 0) / attempts
    else:
        tokens_in, tokens_out = _job_tokens(cfg, capability)
        minutes = 0.0
    price_in, price_out, basis = effective_prices(model, now)
    if model.get("channel") in {"subscription", "local"}:
        # Subsidy: a subscription buys a multiple of its price in list usage.
        included = float(model.get("sub_included_multiplier") or 1)
        price_in /= included
        price_out /= included
        basis = "subscription-included"
    token_cost = (tokens_in * price_in + tokens_out * price_out) / 1_000_000.0
    attempt_cost = token_cost + minutes * minute_value
    failure_cost = (policy.get("failure_cost_usd") or {}).get(capability)
    if isinstance(failure_cost, (int, float)) and failure_cost >= 0:
        # One-shot work (a review is not retried): pay once, plus the
        # downstream cost of a miss or a false result.
        expected = attempt_cost + (1 - p_success) * failure_cost
    else:
        # Retry-until-done work (code tasks): expected attempts = 1 / p.
        expected = attempt_cost / p_success
    return {
        "expected_cost_per_success": expected,
        "attempt_token_cost": token_cost,
        "p_success": p_success,
        "samples": attempts,
        "price_basis": basis,
    }


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
    economics = expected_cost_per_success(cfg, model, st, capability, now)
    extra = {
        "marginal_usd": 0.0,
        "list_cost_usd": round(list_cost, 4),
        "channel": channel,
        "expected_cost_per_success_usd": round(economics["expected_cost_per_success"], 6),
        "p_success": round(economics["p_success"], 4),
        "price_basis": economics["price_basis"],
    }
    floor = (policy.get("min_quality") or {}).get(capability)
    if isinstance(floor, (int, float)) and capability_quality(model, capability) < floor:
        return False, "below_quality_floor", None, extra

    if channel in {"subscription", "local"}:
        extra["marginal_usd"] = 0.0
        return True, "included", (0, -economics["p_success"], uses, model["id"]), extra

    if _family_has_included(cfg["models"], st, family, now, exclude_pools):
        return False, "family_sub_remaining", None, extra

    sub = _family_sub(cfg["models"], family)
    if sub:
        fraction = float(policy.get("api_burn_fraction_of_sub") or 0.15)
        cap = float(sub.get("sub_monthly_usd") or 0) * fraction
        spent = float((st.get("api_spend") or {}).get(family) or 0)
        if spent + economics["attempt_token_cost"] > cap:
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

    extra["marginal_usd"] = round(economics["attempt_token_cost"], 4)
    return True, "api", (
        route_priority(model),
        economics["expected_cost_per_success"],
        -quality,
        model["id"],
    ), extra


def record_api_spend(st, family, amount):
    if not family or amount <= 0:
        return
    def mutate(latest):
        spend = latest.setdefault("api_spend", {})
        spend[family] = float(spend.get(family) or 0) + float(amount)
    update_state(st, mutate)


def parse_oauth_seats(payload):
    """Return a non-negative live OAuth seat count from provider probe JSON."""
    if isinstance(payload, dict):
        for key in ("oauth_seats", "max_concurrent", "concurrency", "seats"):
            value = payload.get(key)
            if isinstance(value, int) and value >= 0:
                return value
        accounts = payload.get("accounts")
        if isinstance(accounts, list) and accounts:
            return len(accounts)
        models = payload.get("models")
        if isinstance(models, dict):
            nested = parse_oauth_seats(models)
            if nested is not None:
                return nested
            for item in models.values():
                nested = parse_oauth_seats(item)
                if nested is not None:
                    return nested
    return None


def choose(workflow, capability, allow_exceptions=False, path=None, exclude_pools=None, include_ids=None):
    cfg, config_path = load(path); mm = model_map(cfg); st = state(); now = time.time()
    exclude_pools = tuple(exclude_pools or ())
    include_ids = tuple(include_ids or ())
    chain = cfg["route_chains"][workflow]
    candidates = []
    ready = []
    for mid in chain:
        if include_ids and mid not in include_ids:
            continue
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

def record_outcome(st, model_id, capability, success, tokens_in=0, tokens_out=0, minutes=0.0):
    """Add one observed attempt; the router learns cost per success from these."""
    def mutate(latest):
        entry = latest.setdefault("outcomes", {}).setdefault(model_id, {}).setdefault(capability, {})
        entry["attempts"] = int(entry.get("attempts") or 0) + 1
        entry["successes"] = int(entry.get("successes") or 0) + (1 if success else 0)
        entry["tokens_in"] = float(entry.get("tokens_in") or 0) + max(0.0, float(tokens_in))
        entry["tokens_out"] = float(entry.get("tokens_out") or 0) + max(0.0, float(tokens_out))
        entry["minutes"] = float(entry.get("minutes") or 0) + max(0.0, float(minutes))
    update_state(st, mutate)


def rank(capability, path=None, provider=None, channel=None, min_quality=None,
         exclude_families=(), st=None, now=None):
    """Score every registry model for a capability without chains or probes.

    For callers outside Symphony (for example the PR review kernel) that pick
    a model per call instead of launching an agent executor.
    """
    cfg, config_path = load(path)
    st = state() if st is None else st
    now = time.time() if now is None else now
    ready, refused = [], []
    for model in cfg["models"]:
        mid = model["id"]
        if capability not in model["capabilities"]:
            continue
        if provider and model.get("provider") != provider:
            continue
        if channel and model.get("channel") != channel:
            continue
        reason = None
        if model.get("family") in exclude_families:
            reason = "excluded_family"
        elif min_quality is not None and capability_quality(model, capability) < min_quality:
            reason = "below_min_quality"
        elif pool_exhausted(st, model.get("pool"), now):
            reason = "pool_exhausted"
        elif float((st.get("cooldowns") or {}).get(mid, 0)) > now:
            reason = "cooldown"
        if reason:
            refused.append({"id": mid, "reason": reason})
            continue
        ok, score_reason, key, extra = score_candidate(cfg, model, st, capability, now)
        if not ok:
            refused.append({"id": mid, "reason": score_reason})
            continue
        ready.append((key, {
            "id": mid,
            "model": model["model"],
            "provider": model["provider"],
            "family": model.get("family"),
            "quality": capability_quality(model, capability),
            "list_price_in": model["list_price_in"],
            "list_price_out": model["list_price_out"],
            **extra,
        }))
    ready.sort(key=lambda item: item[0])
    return {
        "schema_version": 1,
        "capability": capability,
        "config": str(config_path),
        "ranked": [row for _key, row in ready],
        "refused": refused,
    }


def mark_model_exhausted(model_id, seconds=3600, path=None, st=None):
    cfg, _config_path = load(path)
    model = model_map(cfg).get(model_id)
    if model is None:
        raise KeyError(model_id)
    st = state() if st is None else st
    mark_pool_exhausted(st, model.get("pool"), seconds)
    return model.get("pool")


def main():
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("choose"); c.add_argument("--workflow", choices=["remediation", "new_pr"], required=True); c.add_argument("--capability", default="mechanical"); c.add_argument("--allow-codex-exception", action="store_true"); c.add_argument("--exclude-pool", action="append", default=[]); c.add_argument("--include-id", action="append", default=[]); c.add_argument("--config")
    p = sub.add_parser("probe"); p.add_argument("--config")
    v = sub.add_parser("validate"); v.add_argument("--config")
    r = sub.add_parser("rank"); r.add_argument("--capability", required=True); r.add_argument("--provider"); r.add_argument("--channel", choices=["subscription", "api", "local"]); r.add_argument("--min-quality", type=float); r.add_argument("--exclude-family", action="append", default=[]); r.add_argument("--config")
    o = sub.add_parser("record-outcome"); o.add_argument("--model-id", required=True); o.add_argument("--capability", required=True); o.add_argument("--success", type=int, choices=[0, 1], required=True); o.add_argument("--tokens-in", type=float, default=0); o.add_argument("--tokens-out", type=float, default=0); o.add_argument("--minutes", type=float, default=0); o.add_argument("--config")
    x = sub.add_parser("mark-exhausted"); x.add_argument("--model-id", required=True); x.add_argument("--reason", default=""); x.add_argument("--seconds", type=int, default=3600); x.add_argument("--config")
    args = ap.parse_args(); cfg, config_path = load(getattr(args, "config", None))
    if args.cmd == "rank":
        print(json.dumps(rank(args.capability, args.config, args.provider, args.channel, args.min_quality, tuple(args.exclude_family)), indent=2)); return 0
    if args.cmd == "record-outcome":
        if args.model_id not in model_map(cfg):
            print(json.dumps({"ok": False, "reason": "unknown_model"})); return 2
        record_outcome(state(), args.model_id, args.capability, bool(args.success), args.tokens_in, args.tokens_out, args.minutes)
        print(json.dumps({"ok": True})); return 0
    if args.cmd == "mark-exhausted":
        try:
            pool = mark_model_exhausted(args.model_id, args.seconds, args.config)
        except KeyError:
            print(json.dumps({"ok": False, "reason": "unknown_model"})); return 2
        print(json.dumps({"ok": True, "pool": pool, "reason": args.reason})); return 0
    if args.cmd == "probe":
        results = {}
        for model in cfg["models"]:
            ready, reason = probe(model)
            results[model["id"]] = {"ready": ready, "reason": reason}
        print(json.dumps(results, indent=2)); return 0
    if args.cmd == "validate":
        print(json.dumps({"ok": True, "config": str(config_path), "models": len(cfg["models"])}, indent=2)); return 0
    print(json.dumps(choose(args.workflow, args.capability, args.allow_codex_exception, args.config, args.exclude_pool, args.include_id), indent=2)); return 0
if __name__ == "__main__": sys.exit(main())
