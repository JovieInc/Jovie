#!/usr/bin/env python3
"""Model radar: detect new, changed and deprecated models, screen them against every AI task,
and log adopt / reject / re-evaluate decisions.

Tim, 2026-10-20: every new model is a chance to rerun a loop, but only where it is better for
that task at a controlled cost. One run:

1. Lists models from the Vercel AI Gateway (public /v1/models), Cloudflare Workers AI
   (`wrangler ai models --json`), the Anthropic Models API (`ant models list`), Hyperagent
   (`hyperagent models --json`) and ElevenLabs (/v1/models, only when ELEVENLABS_API_KEY is set).
   A source that fails is reported and keeps its last snapshot; it never reads as "all removed".
2. Diffs the catalog against the last snapshot: new, changed (price/context) and deprecated or
   removed models become events. Each event is a gbrain page under models/events/<day>/, and the
   day's digest (with AI-lab news from the signal watcher's `signals/` pages) is models/radar/<day>.
3. Screens every model against ops/models/task-registry.json: same-family successors of the
   model a task runs today, and capability classes (Workers AI decision/extraction models).
   The channel policy is applied before anything else: the Gateway allowlist (JOV-8109), the
   openai/anthropic metered ban (JOV-7119) and Summer's monthly budget ceilings.
4. A new model triggers `jovie-research decision trigger --kind model` when that CLI is present.

Adoption itself is `verdict()`: adopt when success improves beyond noise at an acceptable cost
per successful outcome, or when cost per success drops at equal success; reject when success is
worse beyond noise; otherwise re-evaluate. Spend above CAMPAIGN_APPROVAL_USD needs Tim.

Writes: gbrain pages, the local state file. No routing, config or provider change is made here;
adoption ships as a normal PR through CI and the merge queue.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import yc_corpus  # noqa: E402  (gbrain put + read-back contract, self-test refusal, state writes)

STATE_SCHEMA = "jovie.model-radar/v1"
REGISTRY_SCHEMA = "jovie-model-task-registry/v1"
REGISTRY_PATH = ROOT / "ops/models/task-registry.json"
GATEWAY_POLICY_PATH = ROOT / "apps/web/lib/constants/ai-models.ts"
DEFAULT_STATE = Path.home() / ".local/state/jovie-model-radar/state.json"
REFRESH_INTERVAL_S = 24 * 60 * 60
CAMPAIGN_APPROVAL_USD = 25.0
GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/models"
ELEVENLABS_URL = "https://api.elevenlabs.io/v1/models"
TASK_FIELDS = ("id", "taskType", "currentModel", "channel", "source", "costPerRun", "qualityMetric", "evalSet", "screens")
SCREENS = {"same-family-successor", "gateway-allowlisted", "hyperagent-listed", "workers-ai-decision", "workers-ai-extraction"}
VARIANT_TOKENS = {"batch", "fast", "beta", "highspeed", "decisions", "thinking", "non", "reasoning", "exp", "preview",
                  "vision", "latest", "instruct", "it", "fp8", "multi", "agent"}
PROVIDER_ALIASES = {"z-ai": "zai", "zai-org": "zai", "spacexai": "xai", "deepseek-ai": "deepseek"}


# --- registry ---------------------------------------------------------------------------------

def load_registry(path: Path = REGISTRY_PATH) -> dict:
    return json.loads(path.read_text())


def validate_registry(registry: dict, root: Path = ROOT) -> list[str]:
    """Structure plus drift: each task's declared model must still appear in its source file.
    A task whose source has not landed yet declares `source.pending` and is checked once it lands."""
    errors = []
    if registry.get("schema") != REGISTRY_SCHEMA:
        errors.append(f"schema must be {REGISTRY_SCHEMA}")
    channels = registry.get("channels") or {}
    seen = set()
    for task in registry.get("tasks") or []:
        at = task.get("id", "?")
        for field in TASK_FIELDS:
            if field not in task:
                errors.append(f"{at}: {field} is required")
        if at in seen:
            errors.append(f"{at}: duplicate id")
        seen.add(at)
        if task.get("channel") not in channels:
            errors.append(f"{at}: unknown channel {task.get('channel')}")
        for screen in task.get("screens") or []:
            if screen not in SCREENS:
                errors.append(f"{at}: unknown screen {screen}")
        ev = task.get("evalSet") or {}
        if ev.get("status") not in {"ready", "partial", "missing", "live-ab"}:
            errors.append(f"{at}: evalSet.status must be ready|partial|missing|live-ab")
        if ev.get("status") == "missing" and not ev.get("gap"):
            pass  # a missing set is allowed; the screen reports it as the first thing to build
        source = task.get("source") or {}
        file = root / str(source.get("path", ""))
        if not file.is_file():
            if not source.get("pending"):
                errors.append(f"{at}: source {source.get('path')} does not exist")
            continue
        if source.get("match") and source["match"] not in file.read_text(errors="replace"):
            errors.append(f"{at}: {source.get('path')} no longer contains {source['match']!r} "
                          f"(update currentModel and source.match when the model changes)")
    return errors


def gateway_allowlist(path: Path = GATEWAY_POLICY_PATH) -> set[str]:
    text = path.read_text() if path.is_file() else ""
    block = re.search(r"GATEWAY_ALLOWED_MODELS[^=]*=\s*\[(.*?)\]", text, re.S)
    return set(re.findall(r"'([^']+)'", block.group(1))) if block else set()


# --- catalog sources ---------------------------------------------------------------------------

def _per_million(value) -> float | None:
    try:
        return round(float(value) * 1e6, 6)
    except (TypeError, ValueError):
        return None


def normalize_gateway(doc: dict) -> dict:
    out = {}
    for m in doc.get("data") or []:
        pricing = m.get("pricing") or {}
        out[f"gateway:{m['id']}"] = {
            "source": "gateway", "id": m["id"], "kind": m.get("type"), "released": m.get("released") or m.get("created"),
            "priceIn": _per_million(pricing.get("input")), "priceOut": _per_million(pricing.get("output")),
            "context": m.get("context_window"), "description": (m.get("description") or "")[:300]}
    return out


def normalize_workers(rows: list) -> dict:
    out = {}
    for m in rows or []:
        props = {p.get("property_id"): p.get("value") for p in m.get("properties") or []}
        price_in = price_out = None
        for p in props.get("price") or []:
            unit = str(p.get("unit", ""))
            if unit.startswith("per M input"):
                price_in = p.get("price")
            elif unit.startswith("per M output"):
                price_out = p.get("price")
        out[f"workers:{m['name']}"] = {
            "source": "workers", "id": m["name"], "kind": (m.get("task") or {}).get("name"),
            "released": _epoch(m.get("created_at")), "priceIn": price_in, "priceOut": price_out,
            "context": int(props["context_window"]) if str(props.get("context_window", "")).isdigit() else None,
            "description": (m.get("description") or "")[:300]}
    return out


def normalize_anthropic(rows: list) -> dict:
    return {f"anthropic:{m['id']}": {
        "source": "anthropic", "id": m["id"], "kind": "language", "released": _epoch(m.get("created_at")),
        "priceIn": None, "priceOut": None, "context": m.get("max_input_tokens"),
        "lifecycle": m.get("lifecycle"), "description": m.get("display_name", "")} for m in rows or [] if m.get("id")}


def normalize_hyperagent(doc: dict) -> dict:
    return {f"hyperagent:{mid}": {"source": "hyperagent", "id": mid, "kind": "language", "released": None,
                                  "priceIn": None, "priceOut": None, "context": None, "description": ""}
            for mid in (doc.get("models") or {})}


def normalize_elevenlabs(rows: list) -> dict:
    return {f"elevenlabs:{m['model_id']}": {"source": "elevenlabs", "id": m["model_id"], "kind": "speech", "released": None,
                                            "priceIn": None, "priceOut": None, "context": None,
                                            "description": (m.get("description") or "")[:300]}
            for m in rows or [] if m.get("model_id")}


def _epoch(value) -> int | None:
    if not value:
        return None
    try:
        return int(datetime.fromisoformat(str(value).replace("Z", "+00:00").replace(" ", "T")).replace(
            tzinfo=timezone.utc).timestamp()) if "+" not in str(value) and "Z" not in str(value) else int(
            datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp())
    except ValueError:
        return None


def parse_json_stream(text: str) -> list:
    """`ant models list` prints one JSON object per model; tolerate arrays and pages too."""
    decoder, i, out, text = json.JSONDecoder(), 0, [], text.strip()
    while i < len(text):
        while i < len(text) and text[i] in " \r\n\t,[]":
            i += 1
        if i >= len(text):
            break
        obj, i = decoder.raw_decode(text, i)
        out.extend(obj.get("data", [obj]) if isinstance(obj, dict) else obj)
    return out


def default_run(args, **kwargs):
    yc_corpus.refuse_in_selftest(f"command: {' '.join(args[:2])}")
    return subprocess.run(args, capture_output=True, text=True, timeout=kwargs.pop("timeout", 120), **kwargs)


def default_fetch(url: str, headers: dict | None = None) -> dict | list:
    yc_corpus.refuse_in_selftest(f"network fetch: {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "JovieModelRadar/1.0", **(headers or {})})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())


def fetch_catalog(run=default_run, fetch=default_fetch, env=os.environ) -> tuple[dict, dict]:
    """Returns (models by key, per-source status). A failed source is absent from the models."""
    models, status = {}, {}
    sources = [
        ("gateway", lambda: normalize_gateway(fetch(GATEWAY_URL))),
        ("workers", lambda: normalize_workers(json.loads(_ok(run(["wrangler", "ai", "models", "--json"])).stdout))),
        ("anthropic", lambda: normalize_anthropic(parse_json_stream(_ok(run(["ant", "models", "list", "--limit", "1000"])).stdout))),
        ("hyperagent", lambda: normalize_hyperagent(json.loads(_ok(run(["hyperagent", "models", "--json"])).stdout))),
    ]
    if env.get("ELEVENLABS_API_KEY"):
        sources.append(("elevenlabs", lambda: normalize_elevenlabs(fetch(ELEVENLABS_URL, {"xi-api-key": env["ELEVENLABS_API_KEY"]}))))
    else:
        status["elevenlabs"] = "skipped: ELEVENLABS_API_KEY not set"
    for name, load in sources:
        try:
            found = load()
            if not found:
                raise ValueError("empty catalog")
            models.update(found)
            status[name] = f"ok: {len(found)} models"
        except Exception as error:  # one dead source must not hide the others
            status[name] = f"failed: {type(error).__name__}: {ANSI.sub('', str(error))[:160]}"
    return models, status


def _ok(proc):
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or "")[:200])
    return proc


# --- diff and screens -------------------------------------------------------------------------

RECENT_S = 30 * 24 * 60 * 60
ANSI = re.compile(r"\x1b\[[0-9;]*m")


def diff_catalog(previous: dict, current: dict, failed_sources: set[str], now: float | None = None) -> list[dict]:
    """On a source's first sight only models released in the last 30 days are new (the rest are
    the baseline), so the first run still reports what shipped recently."""
    events = []
    known_sources = {m.get("source") for m in previous.values()}
    for key, model in sorted(current.items()):
        old = previous.get(key)
        if old is None:
            if model.get("source") not in known_sources:
                released = model.get("released")
                if now is None or not released or now - float(released) > RECENT_S:
                    continue  # first sight of a source is its baseline, not N "new" models
            events.append({"type": "new", "key": key, "model": model})
            continue
        changes = {f: [old.get(f), model.get(f)] for f in ("priceIn", "priceOut", "context") if old.get(f) != model.get(f)}
        if model.get("lifecycle") in {"deprecated", "retired"} and old.get("lifecycle") != model.get("lifecycle"):
            events.append({"type": "deprecated", "key": key, "model": model})
        elif changes:
            events.append({"type": "changed", "key": key, "model": model, "changes": changes})
    for key, model in sorted(previous.items()):
        if key not in current and model.get("source") not in failed_sources:
            events.append({"type": "removed", "key": key, "model": model})
    return events


def model_identity(model_id: str) -> tuple[str, tuple]:
    """('provider/family', version). Variant and date suffixes are dropped so successors line up
    across catalogs: claude-sonnet-5-5 and anthropic/claude-sonnet-5.5 are both (claude-sonnet, (5, 5))."""
    raw = model_id.lstrip("@").lower()
    parts = raw.split("/")
    provider = PROVIDER_ALIASES.get(parts[-2], parts[-2]) if len(parts) >= 2 else ""
    name = parts[-1]
    tokens = re.split(r"[-_.:]", name)
    version, words = [], []
    for tok in tokens:
        if re.fullmatch(r"\d{4,8}", tok):  # date / snapshot suffix
            continue
        if re.fullmatch(r"v?\d+(\.\d+)?", tok):
            version.extend(int(x) for x in tok.lstrip("v").split("."))
        elif re.fullmatch(r"[a-z]\d+", tok):  # k3, m3: family letter + version
            words.append(tok[0]); version.append(int(tok[1:]))
        elif tok and tok not in VARIANT_TOKENS:
            words.append(tok)
    if provider in {"", "anthropic"} and words and words[0] == "claude":
        provider = "anthropic"
    return f"{provider}/{'-'.join(words)}", tuple(version)


def is_variant(model_id: str) -> bool:
    name = model_id.lower().split("/")[-1]
    return any(t in VARIANT_TOKENS for t in re.split(r"[-_.:]", name)) or bool(re.search(r"-\d{4,8}($|-)", name))


def successors(current_model: str, catalog: dict) -> list[dict]:
    family, version = model_identity(current_model)
    if not version:
        return []
    found = {}
    for key, model in catalog.items():
        if model.get("kind") not in {None, "language", "Text Generation", "image", "speech"}:
            continue
        fam, ver = model_identity(model["id"])
        fam_no_provider, base_no_provider = fam.split("/", 1)[1], family.split("/", 1)[1]
        if fam_no_provider != base_no_provider or not ver or ver <= version:
            continue
        if is_variant(model["id"]) and not model["id"].startswith("@cf/"):
            continue
        found.setdefault(ver, []).append({"key": key, **model})
    return [m for ver in sorted(found, reverse=True) for m in found[ver]]


def capability_class(model: dict) -> set[str]:
    classes = set()
    desc = (model.get("description") or "").lower()
    if model.get("source") == "workers":
        if "decision model" in desc:
            classes.add("workers-ai-decision")
        if "extract" in desc:
            classes.add("workers-ai-extraction")
    return classes


CHANNEL_SOURCES = {"gateway-allowlist": {"gateway"}, "gateway-image": {"gateway"}, "subscription-claude": {"anthropic"},
                   "workers-ai": {"workers"}, "hyperagent-credits": {"hyperagent"}}


def channel_policy(task: dict, model: dict, allowlist: set[str]) -> str | None:
    """None when the task's channel may buy this model; otherwise the blocking rule."""
    channel, source, mid = task["channel"], model["source"], model["id"]
    metered = channel.startswith("gateway") or channel in {"vendor-api", "workers-ai"}
    if metered and (source == "anthropic" or mid.startswith(("openai/", "anthropic/"))):
        return "JOV-7119: no metered openai/anthropic billing (subscriptions only)"
    if channel.startswith("gateway"):
        if source != "gateway":
            return f"task buys through {channel}; model is on {source} (needs a channel change)"
        if mid.startswith(("openai/", "anthropic/")):
            return "JOV-7119: no metered openai/anthropic billing on the Gateway"
        if channel == "gateway-allowlist" and mid not in allowlist:
            return "JOV-8109: not on the Gateway allowlist (team rule enforces it)"
        return None
    if channel == "subscription-claude":
        return None if source == "anthropic" else f"subscription-claude channel; model is on {source}"
    if channel == "workers-ai":
        return None if source == "workers" else f"workers-ai channel; model is on {source}"
    if channel == "hyperagent-credits":
        return None if source == "hyperagent" else f"hyperagent channel; model is on {source}"
    return None


def screen(registry: dict, catalog: dict, allowlist: set[str]) -> list[dict]:
    rows = []
    for task in registry["tasks"]:
        candidates = []
        compatible = CHANNEL_SOURCES.get(task["channel"])
        if "same-family-successor" in task["screens"]:
            for route in [task["currentModel"], *task.get("alsoRoutes", [])]:
                found = successors(route, catalog)
                fits = [m for m in found if not compatible or m["source"] in compatible]
                candidates += [(m, f"successor of {route}") for m in (fits or found)]
        for wanted_id in task.get("candidates", []):  # explicitly named peers (e.g. Tim's list for Summer)
            candidates += [({"key": k, **m}, "named candidate") for k, m in catalog.items() if m["id"] == wanted_id]
        wanted = set(task["screens"]) & {"workers-ai-decision", "workers-ai-extraction"}
        for key, model in catalog.items():
            hit = capability_class(model) & wanted
            if hit and model["id"] != task["currentModel"]:
                candidates.append(({"key": key, **model}, ", ".join(sorted(hit))))
        seen = set()
        for model, why in candidates:
            if model["key"] in seen:
                continue
            seen.add(model["key"])
            blocked = channel_policy(task, model, allowlist)
            rows.append({"task": task["id"], "current": task["currentModel"], "candidate": model["id"], "source": model["source"],
                         "why": why, "priceIn": model.get("priceIn"), "priceOut": model.get("priceOut"),
                         "policy": blocked or "eligible", "evalSet": task["evalSet"]["status"]})
    return rows


# --- adoption ---------------------------------------------------------------------------------

def verdict(base: dict, cand: dict, *, z: float = 1.96, cost_ratio_cap: float = 1.25, cost_drop: float = 0.8) -> dict:
    """base/cand: {"success": k, "n": n, "usd": total spend incl. retries and failures}.
    Cost per successful outcome = usd / successes (a cheap model that fails more is not cheaper)."""
    p1, n1, p2, n2 = base["success"] / base["n"], base["n"], cand["success"] / cand["n"], cand["n"]
    pooled = (base["success"] + cand["success"]) / (n1 + n2)
    se = math.sqrt(max(pooled * (1 - pooled), 1e-9) * (1 / n1 + 1 / n2))
    delta = p2 - p1
    cps = lambda r: r["usd"] / r["success"] if r["success"] else math.inf
    ratio = cps(cand) / cps(base) if cps(base) not in (0, math.inf) else (0 if cps(cand) == 0 else math.inf)
    if delta < -z * se:
        decision, why = "reject", "success is worse beyond noise"
    elif delta > z * se and ratio <= cost_ratio_cap:
        decision, why = "adopt", "success is better beyond noise at acceptable cost per success"
    elif abs(delta) <= z * se and ratio <= cost_drop:
        decision, why = "adopt", "equal success within noise and cost per success drops"
    elif delta > z * se:
        decision, why = "re-evaluate", "better beyond noise but cost per success is above the cap"
    else:
        decision, why = "re-evaluate", "difference is within noise and cost does not drop enough"
    return {"decision": decision, "why": why, "successDelta": round(delta, 3), "noise": round(z * se, 3),
            "costPerSuccessRatio": None if math.isinf(ratio) else round(ratio, 3)}


def needs_approval(estimated_usd: float) -> bool:
    return estimated_usd > CAMPAIGN_APPROVAL_USD


def decision_page(d: dict, today: str) -> str:
    """Same page shape as packages/research decisions.ts (type: decision, Ship now / Re-evaluate
    when / Then) so `jovie-research decision find` and review triggers read radar decisions."""
    q = json.dumps
    options = "\n".join(f"- **{o['name']}**{' (chosen)' if o['name'] == d['chosen'] else ''}: {o['summary']}" for o in d["options"])
    evidence = "\n".join(f"- {e}" for e in d["evidence"]) or "- none recorded"
    return "\n".join([
        "---", "type: decision", f"title: {q(d['title'])}", f"area: {q(d.get('area', 'models'))}",
        f"status: {d.get('status', 'active')}", f"decided_at: {d.get('date', today)}", f"chosen: {q(d['chosen'])}",
        f"reevaluate_when: [{', '.join(q(x) for x in d['reevaluateWhen'])}]", "tags: [decision, model-radar]", "---", "",
        f"# {d['title']}", "", "## Context", "", d["context"].strip(), "", "## Options", "", options, "", "## Decision", "",
        f"**Ship now:** {d['shipNow']}", "", f"**Re-evaluate when:** {'; '.join(d['reevaluateWhen'])}", "",
        f"**Then:** {d['then']}", "", "## Evidence", "", evidence, ""])


def record_decision(d: dict, *, run=default_run, put=yc_corpus.gbrain_put, today: str | None = None) -> tuple[bool, str]:
    today = today or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if not d.get("reevaluateWhen"):
        raise ValueError("a decision needs at least one Re-evaluate when trigger")
    if d["chosen"] not in {o["name"] for o in d["options"]}:
        raise ValueError("chosen option is not among the options")
    slug = d.get("slug") or f"decisions/models/{re.sub(r'[^a-z0-9]+', '-', d['title'].lower()).strip('-')[:60]}"
    if shutil.which("jovie-research"):
        tmp = DEFAULT_STATE.parent / "decision.json"
        tmp.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_text(json.dumps({**d, "area": d.get("area", "models"), "slug": slug}))
        proc = run(["jovie-research", "decision", "record", "--file", str(tmp)])
        if proc.returncode == 0:
            return True, slug
    ok, error = put(slug, d["title"], decision_page(d, today))
    return ok, slug if ok else f"{slug}: {error}"


# --- detection run ----------------------------------------------------------------------------

def event_page(event: dict, observed: str) -> str:
    m = event["model"]
    lines = ["---", "type: model-event", f"event: {event['type']}", f"source: {m['source']}", f"model: {json.dumps(m['id'])}",
             f"observed: {observed}", "tags: [model-radar, model-event]", "---", "",
             f"# {event['type'].title()} model: {m['id']} ({m['source']})", "",
             f"- price per 1M tokens: in {m.get('priceIn')} / out {m.get('priceOut')}",
             f"- context: {m.get('context')}", f"- kind: {m.get('kind')}"]
    if event.get("changes"):
        lines.append(f"- changes: {json.dumps(event['changes'])}")
    if m.get("description"):
        lines += ["", m["description"]]
    lines += ["", f"Recorded by scripts/lanes/model_radar.py at {observed}. Catalog data is evidence, not a quality claim."]
    return "\n".join(lines)


def digest_page(day: str, status: dict, events: list, rows: list, news: list) -> str:
    lines = ["---", "type: model-radar-digest", f"day: {day}", "tags: [model-radar]", "---", "", f"# Model radar {day}", "",
             "## Sources", "", *[f"- {k}: {v}" for k, v in sorted(status.items())], "",
             f"## Events ({len(events)})", ""]
    lines += [f"- {e['type']}: {e['model']['id']} ({e['model']['source']})" for e in events[:200]] or ["- none"]
    lines += ["", "## Candidates for tasks in use", "", "| task | current | candidate | why | policy |", "|---|---|---|---|---|"]
    lines += [f"| {r['task']} | {r['current']} | {r['candidate']} | {r['why']} | {r['policy']} |" for r in rows] or ["| - | - | - | - | - |"]
    lines += ["", "## AI-lab news (signal watcher)", ""] + ([f"- [[{n}]]" for n in news] or ["- none recorded"])
    return "\n".join(lines) + "\n"


def lab_news(run=default_run, since: str | None = None) -> list[str]:
    args = ["gbrain", "list", "--tag", "ai-lab", "--limit", "50"] + (["--updated-after", since] if since else [])
    try:
        proc = run(args)
    except Exception:
        return []
    return [line.split()[0] for line in (proc.stdout or "").splitlines() if line.startswith("signals/")]


def read_state(path: Path) -> dict:
    try:
        state = json.loads(path.read_text())
        return state if state.get("schema") == STATE_SCHEMA else {"schema": STATE_SCHEMA}
    except (OSError, ValueError):
        return {"schema": STATE_SCHEMA}


def detect(state_path: Path = DEFAULT_STATE, *, run=default_run, fetch=default_fetch, put=yc_corpus.gbrain_put,
           dry_run: bool = False, now: float | None = None, registry: dict | None = None) -> dict:
    now = now or time.time()
    observed = yc_corpus.now_iso(now)
    day = observed[:10]
    state = read_state(state_path)
    catalog, status = fetch_catalog(run=run, fetch=fetch)
    failed = {name for name, s in status.items() if not s.startswith("ok")}
    previous = state.get("catalog") or {}
    baseline = not previous
    events = diff_catalog(previous, catalog, failed, now)
    registry = registry or load_registry()
    rows = screen(registry, catalog, gateway_allowlist())
    news = lab_news(run, (state.get("lastRun") or {}).get("at", "")[:10] or None)
    failures = []
    if not dry_run:
        for event in events[:100]:
            slug = f"models/events/{day}/{event['model']['source']}-{re.sub(r'[^a-z0-9]+', '-', event['model']['id'].lower()).strip('-')}"
            ok, error = put(slug, f"{event['type']} model {event['model']['id']}", event_page(event, observed))
            if not ok:
                failures.append(f"{slug}: {error}")
        ok, error = put(f"models/radar/{day}", f"Model radar {day}", digest_page(day, status, events, rows, news))
        if not ok:
            failures.append(f"digest: {error}")
        if shutil.which("jovie-research"):
            for event in [e for e in events if e["type"] == "new"][:10]:
                run(["jovie-research", "decision", "trigger", "--kind", "model", "--trigger",
                     f"new model {event['model']['id']} on {event['model']['source']}", "--topic", "model"])
    merged = {**{k: v for k, v in previous.items() if v.get("source") in failed}, **catalog}
    result = {"status": "failed" if failures or len(failed) == len(status) else "ok", "at": observed, "baseline": baseline,
              "sources": status, "events": {t: sum(e["type"] == t for e in events) for t in ("new", "changed", "deprecated", "removed")},
              "candidates": len(rows), "eligible": sum(r["policy"] == "eligible" for r in rows), "failures": failures[:20]}
    if not dry_run:
        state.update(catalog=merged, lastRun=result, nextAttemptAt=now + REFRESH_INTERVAL_S)
        yc_corpus.write_state(state_path, state)
    return {**result, "rows": rows, "eventList": events}


def tick(state_dir: Path, spawn=None, now: float | None = None) -> dict:
    """Lanes-tick entry point (same contract as yc_corpus.tick): at most one detached run a day."""
    if spawn is None:
        if yc_corpus.selftest():
            return {"status": "selftest-skipped"}
        spawn = subprocess.Popen
    now = now or time.time()
    path = Path(state_dir) / "model-radar.json"
    state = read_state(path)
    if now < float(state.get("nextAttemptAt", 0)):
        return {"status": "current", "lastRun": state.get("lastRun")}
    state["nextAttemptAt"] = now + 3600
    yc_corpus.write_state(path, state)
    spawn([sys.executable, str(Path(__file__)), "detect", "--state", str(path)], stdin=subprocess.DEVNULL,
          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    return {"status": "scheduled", "lastRun": state.get("lastRun")}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    d = sub.add_parser("detect", help="list catalogs, diff, screen, write gbrain events + digest")
    d.add_argument("--state", type=Path, default=DEFAULT_STATE)
    d.add_argument("--dry-run", action="store_true")
    d.add_argument("--json", action="store_true")
    sub.add_parser("validate", help="check ops/models/task-registry.json structure and drift")
    r = sub.add_parser("record-decision", help="write one decision (JSON file) to the decision log")
    r.add_argument("--file", type=Path, required=True)
    args = parser.parse_args(argv)
    if args.command == "validate":
        errors = validate_registry(load_registry())
        print("\n".join(errors) or "task registry ok")
        return 1 if errors else 0
    if args.command == "record-decision":
        ok, slug = record_decision(json.loads(args.file.read_text()))
        print(slug)
        return 0 if ok else 1
    result = detect(args.state, dry_run=args.dry_run)
    if args.json:
        print(json.dumps(result, indent=1, default=str))
    else:
        print(json.dumps({k: v for k, v in result.items() if k not in {"rows", "eventList"}}, indent=1))
        for row in result["rows"]:
            print(f"{row['task']:32} {row['current']:30} -> {row['candidate']:45} {row['policy']}")
    return 0 if result["status"] == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
