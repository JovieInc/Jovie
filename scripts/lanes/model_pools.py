#!/usr/bin/env python3
"""Model pools: which pool may run an Anthropic model, enforced in code (table: model-pools.json).

Tim, 2026-11-11: Fable runs never run on Vercel. Anthropic models (Fable, Opus, Sonnet, Haiku, any
claude-*) run on the Claude subscription that is already paid for, or on Hyperagent, balanced by
whichever pool's quota expires first. The Vercel AI Gateway and a metered Anthropic API key are
forbidden for them. Non-Anthropic models keep their routes; nothing here governs them.

    model_pools.py check [--root DIR]   CI guard: fail when any config routes an Anthropic model
                                        through a forbidden or undeclared pool
    model_pools.py explain MODEL POOL   print the verdict for one route
    model_pools.py utilization [--state DIR] [--window-hours N] [--write]
                                        per-pool runs and busy time against capacity, as JSON

The table also names every other pool the fleet uses (Codex, Grok, Devin, Kimi) with where its reset
or expiry is read from; `balanced` spends the allowance that is lost first within a capability class.

Runtime: `command_guard(cmd)` refuses an agent command before it starts (lane_runner.run_agent),
`refusal(model, pool)` is the same verdict for an API call site, and both append the refusal to
runs/model-pool-refusals.jsonl. An unreadable table refuses every Anthropic route (fail closed).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
TABLE_PATH = HERE / "model-pools.json"
SCHEMA = "jovie.model-pools/v1"
REFUSAL_SCHEMA = "jovie.model-pool-refusal/v1"
REFUSALS_FILE = "model-pool-refusals.jsonl"
FALLBACK_PATTERN = r"(?i)(?<![a-z])(claude|fable|opus|sonnet|haiku|anthropic)(?![a-z])"


class ModelPoolRefused(RuntimeError):
    """An Anthropic model was about to run on a pool the table does not allow."""

    def __init__(self, row: dict):
        super().__init__(row.get("reason") or "model-pool-refused")
        self.row = row


def load(path: Path | None = None) -> dict:
    try:
        table = json.loads(Path(path or TABLE_PATH).read_text())
    except (OSError, ValueError):
        return {}
    return table if isinstance(table, dict) and table.get("schema") == SCHEMA else {}


def _pools(table: dict) -> dict:
    pools = table.get("pools")
    return pools if isinstance(pools, dict) else {}


def is_anthropic(model, table: dict | None = None) -> bool:
    """True for any Anthropic model id in any catalog spelling (claude-opus-5-5, anthropic/claude-..., fable-5.1)."""
    if not isinstance(model, str) or not model:
        return False
    pattern = ((table or {}).get("anthropic") or {}).get("idPattern") or FALLBACK_PATTERN
    try:
        return re.search(pattern, model) is not None
    except re.error:
        return re.search(FALLBACK_PATTERN, model) is not None


def tier(model: str, table: dict | None = None) -> str | None:
    """fable, opus, sonnet or haiku: two ids of one tier are the same model for pool balancing."""
    lowered = str(model).lower()
    for name in ((table or {}).get("anthropic") or {}).get("tiers") or ("fable", "opus", "sonnet", "haiku"):
        if re.search(rf"(?<![a-z]){re.escape(name)}(?![a-z])", lowered):
            return name
    return "claude" if is_anthropic(model, table) else None


def pool_for_signal(value, table: dict) -> str | None:
    """The pool a config word names (accountClass, channel, pool, accessPath, provider)."""
    if not isinstance(value, str):
        return None
    for name, pool in _pools(table).items():
        if value == name or value in (pool.get("signals") or ()):
            return name
    return None


ASSIGNMENT = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", re.S)
MODEL_FLAG = re.compile(r"^(?:--model|-m)(?:=(.*))?$", re.S)
MODEL_CONFIG = re.compile(r"^(?:(?:-c|--config)=)?model=(.*)$", re.S)
_PYTHON = re.compile(r"python[\d.]*")


def _program(cmd) -> tuple[list[str], int]:
    """The arguments and the index of the program: past `env`, NAME=VALUE prefixes and a Python interpreter."""
    args = [str(arg) for arg in cmd or ()]
    index = 0
    while index < len(args) and (args[index] == "env" or ASSIGNMENT.match(args[index])
                                 or _PYTHON.fullmatch(args[index].rsplit("/", 1)[-1])):
        index += 1
    index += bool(index and args[index:index + 1] == ["-m"] and _PYTHON.fullmatch(args[index - 1].rsplit("/", 1)[-1]))
    return args, index


def executor(cmd) -> str | None:
    """The program a command runs: the first argument that is not `env`, an assignment or a Python interpreter."""
    args, index = _program(cmd)
    return args[index].rsplit("/", 1)[-1] if index < len(args) else None


def pool_for_command(cmd, table: dict) -> str | None:
    name = executor(cmd)
    for pool_name, pool in _pools(table).items():
        if name and name in (pool.get("executors") or ()):
            return pool_name
    return None


def command_models(cmd, env=None, names=(), agent: bool = True) -> list[str | None]:
    """Every model an agent command selects: `-m X`, `-m=X`, `--model X`, `--model=X`, a `model=X` config
    override and the env variables in `names` (inline or in `env`). No value is None: unresolvable. For a
    non-agent command (`git commit -m ...`, a gate) only a long `--model` with a value is read."""
    args, start = _program(cmd)
    found: list[str | None] = []
    if agent:
        found = [match.group(2) for match in map(ASSIGNMENT.match, args[:start]) if match and match.group(1) in names]
        found += [value for name in names if (value := (env or {}).get(name)) and f"{name}=" not in "\0".join(args[:start])]
    for index in range(start + 1, len(args)):
        flag, config = MODEL_FLAG.match(args[index]), MODEL_CONFIG.match(args[index])
        if flag and (agent or args[index].startswith("--")):
            value = flag.group(1) if flag.group(1) is not None else (args[index + 1] if index + 1 < len(args) else None)
            found += [value or None] if agent or value else []
        elif agent and config and (args[index].startswith("-") or args[index - 1] in ("-c", "--config")):
            found.append(config.group(1).strip("\"'") or None)
    return found


def is_agent(cmd, table: dict) -> bool:
    """An agent entry point: a declared executor of any pool, a listed agent CLI, or a raw Anthropic CLI."""
    known = [name for pool in _pools(table).values() for name in pool.get("executors") or ()] + list(table.get("agentRunners") or ())
    return executor(cmd) in [*known, *((table.get("anthropic") or {}).get("runners") or ("claude",))]


def verdict(model, pool: str | None, table: dict | None = None) -> str | None:
    """None when the route may run; otherwise the reason it may not. Non-Anthropic models always pass."""
    table = load() if table is None else table
    if not is_anthropic(model, table):
        return None
    if not table:
        return "model-pools table unreadable; Anthropic routes are refused until it loads"
    allowed = sorted(name for name, row in _pools(table).items() if row.get("anthropic") == "allowed")
    row = _pools(table).get(pool or "")
    if row is None:
        return (f"Anthropic model {model} on undeclared pool {pool or 'unknown'}; "
                f"allowed pools: {', '.join(allowed)}")
    if row.get("anthropic") != "allowed":
        return (f"Anthropic model {model} may not run on {row.get('label') or pool}. "
                f"{row.get('fix') or 'Allowed pools: ' + ', '.join(allowed)}")
    return None


def _state_dir(state_dir=None) -> Path:
    return Path(state_dir or os.environ.get("LANES_STATE") or Path.home() / ".local/state/jovie-lanes")


def record_refusal(row: dict, state_dir=None) -> dict:
    """Append one refusal. A write failure never turns a refusal into a run."""
    full = {"schema": REFUSAL_SCHEMA, "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), **row}
    try:
        target = _state_dir(state_dir) / "runs" / REFUSALS_FILE
        target.parent.mkdir(parents=True, exist_ok=True)
        with open(target, "a") as out:
            out.write(json.dumps(full, sort_keys=True) + "\n")
    except OSError as error:
        print(f"model-pools: refusal not recorded ({type(error).__name__})", file=sys.stderr)
    return full


def refusal(model, pool: str | None, *, site: str, table: dict | None = None, state_dir=None) -> dict | None:
    """Verdict for one API call site. Returns the recorded refusal row, or None when the call may go."""
    table = load() if table is None else table
    reason = verdict(model, pool, table)
    return reason and record_refusal({"model": str(model), "pool": pool, "site": site, "reason": reason}, state_dir)


def command_refusal(cmd, env=None, table: dict | None = None, agent: bool | None = None) -> dict | None:
    """Why a command may not run, as {model, pool, site, reason}; None when it may. Fails closed: a raw
    Anthropic CLI (its default model is Anthropic, and it skips the lane's credential scrub) and a model
    selection with no value are refused outside an allowed pool, since the model cannot be resolved."""
    table = load() if table is None else table
    name, pool = executor(cmd), pool_for_command(cmd, table)
    row = _pools(table).get(pool or "") or {}
    models = command_models(cmd, env, tuple(row.get("modelEnv") or ()), is_agent(cmd, table) if agent is None else agent)
    wanted = [model for model in models if model and is_anthropic(model, table)]
    reasons = [verdict(model, pool, table) for model in wanted]
    if row.get("anthropic") != "allowed":
        if name in ((table.get("anthropic") or {}).get("runners") or ("claude",)):
            reasons.insert(0, f"{name} is an Anthropic CLI and not the declared executor of an allowed pool; "
                              "run the Claude lane (claude_lane.py) or Hyperagent")
        elif None in models:
            reasons.insert(0, f"the model {name} would run cannot be resolved (a model flag with no value)")
    reason = next((item for item in reasons if item), None)
    return reason and {"model": (wanted or ["unresolved"])[0], "pool": pool, "site": f"command:{name}", "reason": reason}


def command_guard(cmd, *, env=None, agent: bool | None = None, table: dict | None = None, state_dir=None) -> str | None:
    """Refuse an agent command that would, or could, run an Anthropic model outside an allowed pool.
    Returns the pool for an Anthropic command that may run, else None. Only a declared executor of an allowed pool passes."""
    table = load() if table is None else table
    refused = command_refusal(cmd, env, table, agent)
    if refused:
        raise ModelPoolRefused(record_refusal(refused, state_dir))
    pool = pool_for_command(cmd, table)
    return pool if any(model and is_anthropic(model, table) for model in command_models(
        cmd, env, tuple((_pools(table).get(pool or "") or {}).get("modelEnv") or ()))) else None


def pool_for_lane(spec: dict, table: dict | None = None) -> str | None:
    """A lane's pool: its accountClass when the table knows it, else its command's executor."""
    table = load() if table is None else table
    spec = spec if isinstance(spec, dict) else {}
    return pool_for_signal(spec.get("accountClass"), table) or pool_for_command(spec.get("cmd"), table)


def receipt(spec: dict, balance: dict | None = None, table: dict | None = None) -> dict:
    """What a run receipt says about its pool, so the choice can be shown later."""
    table = load() if table is None else table
    model = (spec or {}).get("model")
    row = {"schema": "jovie.model-pool-receipt/v1", "pool": pool_for_lane(spec, table),
           "anthropic": is_anthropic(model, table)}
    if balance:
        row["balance"] = balance
    return row


# ---------------------------------------------------------------- balancing

def _epoch(value) -> float | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def _iso(when: float | None) -> str | None:
    return None if when is None else datetime.fromtimestamp(when, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def pool_expiry(pool: str | None, now: float, *, claude_state: dict | None = None, window_s: int = 5 * 3600,
                registry: dict | None = None, live: dict | None = None, spec: dict | None = None,
                table: dict | None = None) -> dict:
    """When a pool's unused allowance is next lost, from data the repo already has. Nothing is invented:
    a pool with no usable reading returns expiresAt None and says why."""
    table = load() if table is None else table
    row = _pools(table).get(pool or "") or {}
    source = (row.get("expiry") or {}).get("source")
    provider = next((item for item in (registry or {}).get("providers") or ()
                     if isinstance(item, dict) and item.get("id") == row.get("registryProvider")), {})
    accounts = [item for item in provider.get("accounts") or () if isinstance(item, dict)]
    if source == "claude-lane-window":
        runs = [item["at"] for item in (claude_state or {}).get("runs") or ()
                if isinstance(item, dict) and isinstance(item.get("at"), (int, float)) and 0 <= now - item["at"] < window_s]
        if not runs:  # an idle lane has no open window: nothing is about to be lost, so no expiry is made up
            return {"pool": pool, "expiresAt": None, "basis": "claude-lane-window-not-open"}
        return {"pool": pool, "expiresAt": _iso(min(runs) + window_s), "basis": "claude-lane-window-open"}
    if source == "hyperagent-daily-cap-and-credits":
        day = datetime.fromtimestamp(now, timezone.utc)
        midnight = datetime(day.year, day.month, day.day, tzinfo=timezone.utc).timestamp() + 86400
        credits = [_epoch((account.get("credits") or {}).get("expiresAt")) for account in accounts]
        credits = [value for value in credits if value is not None and value > now]
        basis = "hyperagent-daily-cap-utc-day" + ("+credit-expiry" if credits else "")
        return {"pool": pool, "expiresAt": _iso(min([midnight, *credits])), "basis": basis,
                **({"creditsExpireAt": _iso(min(credits))} if credits else {})}
    if source == "registry-quota-reset":
        overlay = (live or {}).get("accounts") if isinstance((live or {}).get("accounts"), dict) else {}
        resets = []
        for account in accounts:
            if account.get("status", "active") != "active":
                continue
            quota = (overlay.get(f"{provider.get('id')}/{account.get('id')}") or {}).get("quota") or account.get("quota") or {}
            when = _epoch(quota.get("resetsAt")) if quota.get("resetsAt") else None
            if when is not None and when > now:
                resets.append(when)
        if resets:
            return {"pool": pool, "expiresAt": _iso(min(resets)), "basis": "registry-quota-reset"}
        return {"pool": pool, "expiresAt": None, "basis": "no-fresh-reset-reading"}
    if source == "lane-free-window":
        stop = ((spec or {}).get("freeOnly") or {}).get("stopBefore")
        when = _epoch(stop) if stop else None
        if when is not None and when > now:
            return {"pool": pool, "expiresAt": _iso(when), "basis": "lane-free-window"}
        return {"pool": pool, "expiresAt": None, "basis": "free-window-ended" if when else "no-expiry-data"}
    return {"pool": pool, "expiresAt": None, "basis": "no-expiry-data"}


def choose(candidates: list[dict]) -> tuple[dict | None, dict]:
    """Earliest expiry first (use it or lose it). Each candidate: {lane, model, pool, expiry}. A pool with
    no expiry data sorts last; ties keep the given order (the router's cost order)."""
    def key(pair):
        index, row = pair
        when = _epoch((row.get("expiry") or {}).get("expiresAt")) if (row.get("expiry") or {}).get("expiresAt") else None
        return (when is None, when or 0.0, index)
    ranked = [row for _, row in sorted(enumerate(candidates), key=key)]
    chosen = ranked[0] if ranked else None
    return chosen, {"rule": "earliest-expiry", "chosenPool": chosen and chosen.get("pool"),
                    "considered": [{"lane": row.get("lane"), "model": row.get("model"), "pool": row.get("pool"),
                                    **{k: v for k, v in (row.get("expiry") or {}).items() if k != "pool"}}
                                   for row in ranked]}


def guarded(availability, providers: dict, table: dict | None = None):
    """Wrap the router's availability: an Anthropic route on a pool the table does not allow is never
    available, so the router cannot choose it."""
    table = load() if table is None else table

    def check(lane: str, route: dict) -> dict:
        if verdict((route or {}).get("model"), pool_for_lane(providers.get(lane) or {}, table), table):
            return {"ok": False, "why": "model-pool-refused", "pressure": 0}
        return availability(lane, route)
    return check


def balanced(decision: dict, providers: dict, expiry_of, table: dict | None = None) -> dict:
    """Selector hook, applied to a routing decision. Among the available candidates of the chosen route's
    capability class that still have soft allowance left (pressure below 1), the pool whose unused
    allowance is lost first takes the run; a pool with no expiry reading sorts last and ties keep the
    router's cost order. The decision gains `pool` (what was chosen and what was considered). When no
    candidate has an expiry reading the router's own choice stands, and a non-Anthropic decision with
    nothing to compare is returned unchanged. An Anthropic route on a forbidden pool is never a peer."""
    table = load() if table is None else table
    chosen = decision.get("chosen")
    if not chosen:
        return decision

    def pool_of(row):
        return pool_for_lane(providers.get(row["lane"]) or {}, table)

    def same(row):
        return row["lane"] == chosen["lane"] and row["model"] == chosen["model"]
    peers = [row for row in decision.get("candidates") or ()
             if row.get("available") and row.get("capability") == chosen.get("capability")
             and (same(row) or float(row.get("pressure") or 0) < 1)
             and verdict(row.get("model"), pool_of(row), table) is None]
    peers = peers if any(same(row) for row in peers) else [chosen, *peers]
    rows = [{"lane": row["lane"], "model": row["model"], "pool": pool_of(row),
             "expiry": expiry_of(row["lane"]) if pool_of(row) else {"expiresAt": None, "basis": "undeclared-pool"}}
            for row in peers]
    known = [row for row in rows if row["expiry"].get("expiresAt")]
    if not known and not is_anthropic(chosen.get("model"), table):
        return decision
    if len({row["pool"] for row in rows}) < 2 or not known:
        own = next(row for row in rows if same(row))
        return {**decision, "pool": {**choose([own])[1], "rule": "single-pool"}}
    picked, record = choose(rows)
    if same(picked):
        return {**decision, "pool": record}
    winner = next(row for row in peers if row["lane"] == picked["lane"] and row["model"] == picked["model"])
    route = next((item for item in (providers.get(winner["lane"]) or {}).get("routes") or ()
                  if isinstance(item, dict) and item.get("model") == winner["model"]), {})
    moved = {**chosen, **{key: winner[key] for key in chosen if key in winner},
             "alias": route.get("alias"), "costClass": route.get("costClass")}
    return {**decision, "chosen": moved, "pool": record,
            "rationale": f"{decision.get('rationale', '')}; pool {record['chosenPool']} expires first "
                         f"(was {chosen['lane']}/{chosen['model']})"}


# ---------------------------------------------------------------- utilization

UTILIZATION_SCHEMA = "jovie.model-pool-utilization/v1"


def utilization(receipts, providers: dict, now: float, *, window_s: float = 86400, expiry_of=None,
                table: dict | None = None) -> dict:
    """Per pool over the window: runs and agent busy time against capacity, for a board to read.
    Capacity is what the config declares: slots x window for busy time, and the lane's soft run cap
    scaled to the window. Receipts are jovie-lane-run rows (provider, startedAt, agentSeconds)."""
    table = load() if table is None else table
    pools: dict[str, dict] = {}
    lane_pool = {}
    for name, spec in providers.items():
        if not isinstance(spec, dict):
            continue
        key = pool_for_lane(spec, table) or f"undeclared:{name}"
        lane_pool[name] = key
        row = pools.setdefault(key, {"pool": key, "label": (_pools(table).get(key) or {}).get("label"), "lanes": [],
                                     "runs": 0, "busySeconds": 0, "slots": 0, "softRuns": None})
        row["lanes"].append(name)
        if spec.get("enabled", True):
            row["slots"] += int(spec.get("slots", 1) or 0)
            quota = spec.get("quota") or {}
            if quota.get("softRuns") and quota.get("windowS"):
                row["softRuns"] = round((row["softRuns"] or 0) + float(quota["softRuns"]) * window_s / float(quota["windowS"]), 1)
        if expiry_of and key in _pools(table) and "expiry" not in row:
            row["expiry"] = {k: v for k, v in (expiry_of(name) or {}).items() if k != "pool"}
    for item in receipts or ():
        started = _epoch(item.get("startedAt")) if isinstance(item, dict) and item.get("startedAt") else None
        key = lane_pool.get(item.get("provider")) if isinstance(item, dict) else None
        if key is None or started is None or not 0 <= now - started < window_s:
            continue
        pools[key]["runs"] += 1
        seconds = item.get("agentSeconds")
        pools[key]["busySeconds"] += int(seconds) if isinstance(seconds, (int, float)) and seconds > 0 else 0
    for row in pools.values():
        capacity = row["slots"] * window_s
        row["capacityBusySeconds"] = int(capacity)
        row["busyShare"] = round(row["busySeconds"] / capacity, 3) if capacity else None
        row["runShare"] = round(row["runs"] / row["softRuns"], 3) if row["softRuns"] else None
    return {"schema": UTILIZATION_SCHEMA, "at": _iso(now), "windowS": int(window_s),
            "pools": sorted(pools.values(), key=lambda row: row["pool"])}


def _ledger_tail(state: Path, tail_bytes: int = 8_000_000) -> list[dict]:
    try:
        with open(state / "runs" / "ledger.jsonl", "rb") as handle:
            handle.seek(0, os.SEEK_END)
            handle.seek(max(0, handle.tell() - tail_bytes))
            lines = handle.read().decode(errors="replace").splitlines()
    except OSError:
        return []
    rows = []
    for line in lines:
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if isinstance(row, dict):
            rows.append(row)
    return rows


def utilization_report(state_dir=None, *, window_s: float = 86400, now: float | None = None,
                       providers: dict | None = None, registry: dict | None = None) -> dict:
    """The summary for this host's ledger, with each pool's current expiry reading."""
    import capacity_registry  # noqa: PLC0415  (sibling module; keeps the guard import-light)
    state = _state_dir(state_dir)
    now = time.time() if now is None else now
    registry = capacity_registry.load() if registry is None else registry
    if providers is None:
        providers = capacity_registry.apply_limits(json.loads((HERE / "providers.json").read_text()), registry)
    live = capacity_registry.read_live(state)
    try:
        claude_state = json.loads((state / "claude-quota.json").read_text())
    except (OSError, ValueError):
        claude_state = {}
    table = load()
    return utilization(_ledger_tail(state), providers, now, window_s=window_s, table=table,
                       expiry_of=lambda lane: pool_expiry(pool_for_lane(providers.get(lane) or {}, table), now,
                                                          claude_state=claude_state, registry=registry, live=live,
                                                          spec=providers.get(lane), table=table))


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    check = sub.add_parser("check")
    check.add_argument("--root", default=None)
    explain = sub.add_parser("explain")
    explain.add_argument("model")
    explain.add_argument("pool")
    used = sub.add_parser("utilization")
    used.add_argument("--state", default=None)
    used.add_argument("--window-hours", type=float, default=24)
    used.add_argument("--write", action="store_true", help="also write model-pool-utilization.json in the state dir")
    args = parser.parse_args(argv)
    if args.command == "utilization":
        report = utilization_report(args.state, window_s=args.window_hours * 3600)
        text = json.dumps(report, indent=2, sort_keys=True)
        if args.write:
            from atomic_state import atomic_write_text  # noqa: PLC0415
            atomic_write_text(_state_dir(args.state) / "model-pool-utilization.json", text + "\n")
        print(text)
        return 0
    if args.command == "explain":
        reason = verdict(args.model, args.pool)
        print(reason or f"allowed: {args.model} on {args.pool}")
        return 1 if reason else 0
    # The checkout under review is the working directory; when it does not carry the table (a partial
    # tree, or a base that predates it) it is scanned with the table next to this script.
    root = Path(args.root) if args.root else Path.cwd()
    import model_pool_guard  # noqa: PLC0415
    violations = model_pool_guard.scan(root, None if (root / "scripts/lanes/model-pools.json").is_file() else load())
    if not violations:
        print("model-pools: every Anthropic route is on an allowed pool (Claude subscription or Hyperagent)")
        return 0
    print(f"model-pools: {len(violations)} violation(s). Anthropic models run only on the Claude subscription "
          "or Hyperagent, never the Vercel AI Gateway or a metered API key (scripts/lanes/model-pools.json).",
          file=sys.stderr)
    for row in violations:
        print(f"  FAIL {row['path']} [{row['rule']}] {row['detail']}\n       fix: {row['fix']}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
