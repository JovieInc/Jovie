"""Collectors for the predictive capacity loop: one function per resource type.

Each collector returns {"value", "limit", "burnPerHour"?, "observedAt"?} or None; the registry
(ops/registry/capacity-resources.json) picks one by `collector.type`. Split out of forecast.py
(2026-11, size-500 guard): forecast.py owns the store/forecast/delivery loop and re-exports the
names its CLI and tests use; collector tests patch THIS module's bindings.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(os.environ.get("CAPACITY_REPO") or Path(__file__).resolve().parents[2])
SPEND = REPO / "ops/registry/spend.json"

# Why a collector last returned no reading, keyed "<collector-type>:<metric>": surfaces the
# exact cause (missing variable, HTTP status) into GAP rows so the doctor card names the fix
# instead of a bare "collector is blind".
COLLECTOR_ERRORS: dict[str, str] = {}
LAST_HTTP_ERROR = ""


def iso(t: float) -> str:
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(s: str) -> float:
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()


def state_dir() -> Path:
    return Path(os.environ.get("CAPACITY_STATE") or Path.home() / ".local/state/capacity")


def run(cmd: list[str], timeout: int = 25) -> str | None:
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return out.stdout if out.returncode == 0 else None


# ---- collectors: each returns {"value", "limit", "burnPerHour"?, "observedAt"?} or None ----


def c_disk(spec: dict, now: float) -> dict | None:
    path = os.path.expanduser(spec.get("path", "/"))
    if not os.path.exists(path):
        return None
    u = shutil.disk_usage(path)
    return {"value": u.used, "limit": u.total * spec.get("limitFrac", 0.9)}


def c_inodes(spec: dict, now: float) -> dict | None:
    path = os.path.expanduser(spec.get("path", "/"))
    if not os.path.exists(path):
        return None
    s = os.statvfs(path)
    if not s.f_files:
        return None
    return {"value": s.f_files - s.f_ffree, "limit": s.f_files * spec.get("limitFrac", 0.9)}


def c_gh_rate(spec: dict, now: float) -> dict | None:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    try:
        from apiclient.gh import run_gh
        result = run_gh(["api", "rate_limit", "--jq", f".resources.{spec.get('bucket', 'core')}"], priority="report")
    except (ImportError, OSError):
        return None
    raw = result["stdout"] if result.get("code") == 0 else None
    try:
        row = json.loads(raw or "")
    except ValueError:
        return None
    return {"value": row["used"], "limit": row["limit"]}


def c_doppler(spec: dict, now: float) -> dict | None:
    raw = run(["doppler", "secrets", "-p", spec["project"], "-c", spec["config"], "--only-names", "--json"])
    try:
        return {"value": len(json.loads(raw or "")), "limit": spec["cap"]}
    except (ValueError, TypeError):
        return None


def c_spend(spec: dict, now: float) -> dict | None:
    """Prepaid balance projected forward from the registry snapshot and its observed burn."""
    try:
        provider = next(p for p in json.loads(SPEND.read_text())["providers"] if p["id"] == spec["providerId"])
        snap = provider["snapshot"]
        burn = provider["burnPerDayUsd"]["value"]
        observed = parse_iso(snap["observedAt"])
        balance = snap["balanceUsd"]
    except (OSError, ValueError, KeyError, StopIteration, TypeError):
        return None
    age_d = max(0.0, (now - observed) / 86400)
    projected = balance - burn * age_d
    start = spec.get("fundedUsd", balance)
    return {"value": start - projected, "limit": start - spec.get("floorUsd", 0),
            "burnPerHour": burn / 24, "observedAt": iso(observed)}


def _http_json(url: str, token: str, method: str = "GET") -> dict | None:
    global LAST_HTTP_ERROR
    import urllib.error
    import urllib.request
    LAST_HTTP_ERROR = ""
    try:
        req = urllib.request.Request(url, method=method, headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        LAST_HTTP_ERROR = f"HTTP {e.code}"
        return None
    except (OSError, ValueError):
        LAST_HTTP_ERROR = "unreachable"
        return None


def neon_token() -> str | None:
    """NEON_API_KEY from the environment, then the Doppler lanes store (agent-mesh/prd, the same
    store c_resend reads RESEND_READ_KEY from), then the neonctl OAuth token on this host
    (read in memory, never printed)."""
    if os.environ.get("NEON_API_KEY"):
        return os.environ["NEON_API_KEY"].strip()
    token = run(["doppler", "secrets", "get", "NEON_API_KEY", "-p", "agent-mesh", "-c", "prd", "--plain"])
    if token and token.strip():
        return token.strip()
    try:
        return json.loads((Path.home() / ".config/neonctl/credentials.json").read_text())["access_token"]
    except (OSError, ValueError, KeyError):
        return None


def c_neon(spec: dict, now: float) -> dict | None:
    """Month-to-date Neon usage against the plan's included allowance (Launch plan limits live in the registry).

    metric: compute-hours | egress-gb | branches | spend-usd. Alarms at warnFrac of the allowance, before
    Neon's own 80% / spend-notification email.
    """
    token = neon_token()
    if not token:
        COLLECTOR_ERRORS[f"neon:{spec.get('metric', '')}"] = (
            "no NEON_API_KEY on this host — add it to Doppler agent-mesh/prd (the lanes store the "
            "collector already reads) or the collector's environment; provisioning is Tim-only")
        return None
    base = "https://console.neon.tech/api/v2"
    org = spec["orgId"]
    if spec["metric"] == "branches":
        proj = _http_json(f"{base}/projects/{spec['projectId']}/branches?limit=500", token)
        if not proj:
            COLLECTOR_ERRORS[f"neon:{spec.get('metric', '')}"] = f"Neon API {LAST_HTTP_ERROR or 'unreachable'}"
            return None
        return {"value": len(proj["branches"]), "limit": spec["limit"]}
    start = datetime.fromtimestamp(now, timezone.utc).replace(day=1, hour=0, minute=0, second=0)
    stamp = lambda d: d.strftime("%Y-%m-%dT%H:%M:%SZ")
    url = (f"{base}/consumption_history/v2/projects?org_id={org}&granularity=daily&from={stamp(start)}"
           f"&to={iso(now)}&limit=100&metrics=compute_unit_seconds,public_network_transfer_bytes,extra_branches_month")
    data = _http_json(url, token)
    if not data:
        COLLECTOR_ERRORS[f"neon:{spec.get('metric', '')}"] = f"Neon API {LAST_HTTP_ERROR or 'unreachable'}"
        return None
    totals: dict[str, float] = {}
    for proj in data.get("projects", []):
        for period in proj.get("periods", []):
            for row in period.get("consumption", []):
                for m in row.get("metrics", []):
                    totals[m["metric_name"]] = totals.get(m["metric_name"], 0) + m["value"]
    cu_h = totals.get("compute_unit_seconds", 0) / 3600
    gb = totals.get("public_network_transfer_bytes", 0) / 1e9
    branch_h = totals.get("extra_branches_month", 0)
    m = spec["metric"]
    if m == "compute-hours":
        return {"value": cu_h, "limit": spec["limit"]}
    if m == "egress-gb":
        return {"value": gb, "limit": spec["limit"]}
    if m == "spend-usd":  # overage estimate at published Launch rates; the real notification is the org spend alert
        rates = spec["rates"]
        usd = (max(0.0, cu_h - rates["includedCuHours"]) * rates["cuHourUsd"]
               + max(0.0, gb - rates["includedEgressGb"]) * rates["egressGbUsd"]
               + branch_h * rates["extraBranchHourUsd"])
        return {"value": usd, "limit": spec["limit"]}
    return None


def _resend_count(value: object) -> bool:
    # Counts cross a JSON/float-based forecast boundary; booleans are not counts.
    return type(value) is int and 0 <= value <= 2 ** 53 - 1


def _resend_reset_at(value: object, now: float) -> float | None:
    if not isinstance(value, str) or "T" not in value:
        return None
    try:
        reset = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if reset.tzinfo is None:
            return None
        timestamp = reset.timestamp()
    except (ValueError, OverflowError, OSError):
        return None
    return timestamp if timestamp > now else None


def c_resend(spec: dict, now: float) -> dict | None:
    """Read authoritative account quota, including sent AND received email.

    Adopt Resend GET /usage through the shared HTTP wrapper. Sent listings
    cannot establish total quota. Keep GAP for unavailable evidence, unlimited
    or changed limits the current registry cannot represent, and expired resets.
    Reset boundaries come from the provider, never a locally derived calendar.
    RESEND_READ_KEY is existing read authority; absence does not create a key.
    """
    window_name = spec.get("window")
    window = {"day": "daily", "month": "monthly"}.get(window_name) if isinstance(window_name, str) else None
    configured_limit = spec.get("limit")
    if not window or not _resend_count(configured_limit) or configured_limit == 0:
        return None
    token = os.environ.get("RESEND_READ_KEY") or run(
        ["doppler", "secrets", "get", "RESEND_READ_KEY", "-p", "agent-mesh", "-c", "prd", "--plain"])
    if not token or not token.strip():
        return None
    payload = _http_json("https://api.resend.com/usage", token.strip())
    if not isinstance(payload, dict) or payload.get("object") != "usage" \
            or not isinstance(payload.get("emails"), dict):
        return None
    usage = payload["emails"].get(window)
    if not isinstance(usage, dict) or any(not _resend_count(usage.get(key))
                                          for key in ("used", "limit", "sent", "received")):
        return None
    if usage["limit"] != configured_limit or usage["used"] != usage["sent"] + usage["received"] \
            or _resend_reset_at(usage.get("resets_at"), now) is None:
        return None
    return {"value": usage["used"], "limit": usage["limit"], "resetsAt": usage["resets_at"]}


def c_manual(spec: dict, now: float) -> dict | None:
    if "value" not in spec:
        return None
    return {"value": spec["value"], "limit": spec["limit"], "observedAt": spec.get("observedAt")}


def c_gh_env_secrets(spec: dict, now: float) -> dict | None:
    """Secret count in one GitHub Actions environment (or the repo when `environment` is absent).

    GitHub caps each environment and repo at 100 secrets; the Doppler sync writes into these, so this
    is the binding cap (2026-10-31: Production and Preview were both at 100/100). Names only.
    """
    import urllib.parse
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    env = spec.get("environment")
    path = (f"repos/{spec['repo']}/environments/{urllib.parse.quote(env, safe='')}/secrets" if env
            else f"repos/{spec['repo']}/actions/secrets")
    try:
        from apiclient.gh import run_gh
        result = run_gh(["api", f"{path}?per_page=1", "--jq", ".total_count"], priority="report")
    except (ImportError, OSError):
        return None
    try:
        return {"value": int((result.get("stdout") or "").strip()), "limit": spec.get("cap", 100)} \
            if result.get("code") == 0 else None
    except ValueError:
        return None


def c_deadline(spec: dict, now: float) -> dict | None:
    """A dated obligation (application, renewal, provider deadline) as a resource that runs out.

    value/limit are hours since the epoch, burn is 1 hour per hour, so time-to-limit is the time left
    and the resource's lead time is how early someone must act. `doneAt` closes it (stays OK).
    """
    due = parse_iso(spec["dueAt"])
    if spec.get("doneAt"):
        return {"value": 0.0, "limit": 1.0, "burnPerHour": 0.0, "detail": f"done {spec['doneAt']}"}
    return {"value": now / 3600, "limit": due / 3600, "burnPerHour": 1.0,
            "detail": f"due {spec['dueAt']}. Done when: {spec.get('doneWhen', 'the owner records doneAt')}"}


def c_stuck_procs(spec: dict, now: float) -> dict | None:
    """Agent processes alive for hours with almost no CPU: blocked on stdin, a prompt or a dead pipe.

    2026-10-31: three non-interactive Codex jobs sat ~9h waiting on an open stdin and nothing
    noticed. A process counts when it matches `match`, is older than `maxHours` and used less than
    `maxCpuFrac` of its wall time. Report only; killing agent work is the owner's call.
    """
    import re
    raw = run(["ps", "-axo", "pid=,etime=,time=,command="], 15) if sys.platform == "darwin" \
        else run(["ps", "-eo", "pid=,etimes=,times=,args="], 15)
    if raw is None:
        return None
    pattern, stuck = re.compile(spec["match"]), []
    for line in raw.splitlines():
        parts = line.split(None, 3)
        if len(parts) < 4 or not pattern.search(parts[3]):
            continue
        wall, cpu = _seconds(parts[1]), _seconds(parts[2])
        if wall is None or cpu is None:
            continue
        if wall > spec.get("maxHours", 3) * 3600 and cpu < spec.get("maxCpuFrac", 0.01) * wall:
            stuck.append(f"pid {parts[0]} {wall / 3600:.1f}h cpu {cpu:.0f}s: {parts[3][:80]}")
    return {"value": len(stuck), "limit": spec.get("limit", 1), "detail": "; ".join(stuck[:5])}


def _seconds(text: str) -> float | None:
    """ps elapsed/cpu time: plain seconds, or [[dd-]hh:]mm:ss[.ff]."""
    try:
        if ":" not in text:
            return float(text)
        days, _, rest = text.rpartition("-")
        total = 0.0
        for part in rest.split(":"):
            total = total * 60 + float(part)
        return total + (float(days) * 86400 if days else 0)
    except ValueError:
        return None


ACCESS_DENIED = (
    r"Doppler Error: [^\"\\\n]{0,100}", r"HTTP 40[13][^\"\\\n]{0,80}", r"\b40[13] (?:Unauthorized|Forbidden)[^\"\\\n]{0,60}",
    r"Resource not accessible by (?:integration|personal access token)", r"[Pp]ermission denied \(publickey[^)]{0,40}\)",
    r"(?:insufficient|missing required) (?:scope|permission)s?[^\"\\\n]{0,60}", r"not authori[sz]ed to [^\"\\\n]{0,60}",
    r"(?:could ?n[o']t|cannot|unable to) (?:read|access) [^\"\\\n]{0,60}(?:denied|permission|access|credential)[^\"\\\n]{0,20}",
)


NOT_ACCESS = ("rate limit", "=>", "[^", "|", "Object.assign", "', ", "`", "$", "toISOString", "statusCode")


def access_signature(text: str) -> str | None:
    """Normalize one denial: keep HTTP status codes, drop ids, long numbers and tokens; None for noise
    (rate limits are capacity, not access; quoted source code and regexes are not denials)."""
    import re
    if any(token in text for token in NOT_ACCESS):
        return None
    sig = re.sub(r"[A-Za-z0-9_-]{24,}|[0-9a-f]{8,}|\d{4,}|\d+ms", "#", text)[:90].strip(" .,:;)({")
    return sig if len(sig) >= 12 else None


def c_access_gaps(spec: dict, now: float) -> dict | None:
    """Denied reads repeated by agents: the same normalized denial seen `minRepeats`+ times in the window.

    Scans agent transcripts and logs (`globs`) incrementally (byte offsets in the state dir), so an
    agent that hits the same 401/403/Doppler denial twice becomes an access-gap card for its owner
    instead of a shrug. Snippets are normalized (ids, numbers and long tokens removed) and capped.
    """
    import glob, hashlib, math, re
    pattern = re.compile("|".join(ACCESS_DENIED))
    hint = re.compile(rb"Doppler Error|HTTP 40[13]|40[13] (?:Unauth|Forbid)|not accessible by|ermission denied|"
                      rb"scope|not authori|n't read|not read|t access", re.I)
    offsets_path = state_dir() / "access-gap-offsets.json"
    seen_path = state_dir() / "access-gap-seen.jsonl"
    COLLECTOR_ERRORS.pop("access-gaps:", None)
    # Recovery requires complete history. The generic sample reader tolerates
    # corrupt/unreadable rows; using that result here would falsely clear issues
    # after transcript offsets have advanced. Preserve both files on failure.
    try:
        try:
            history = [json.loads(line) for line in seen_path.read_text().splitlines()]
        except FileNotFoundError:
            if offsets_path.exists():
                raise ValueError("history missing after scan")
            history = []
        if any(not isinstance(row, dict) or not isinstance(row.get("sig"), str)
               or not isinstance(row.get("src"), str) or type(row.get("t")) not in (int, float)
               or not math.isfinite(row["t"]) for row in history):
            raise ValueError("invalid history")
    except (OSError, ValueError):
        COLLECTOR_ERRORS["access-gaps:"] = "access-gap history unavailable or invalid"
        return None
    try:
        offsets = json.loads(offsets_path.read_text())
    except (OSError, ValueError):
        offsets = {}
    window = spec.get("windowHours", 72) * 3600
    hits = []
    for g in spec["globs"]:
        for path in glob.glob(os.path.expanduser(g), recursive=True):
            if Path(path).resolve().is_relative_to(state_dir().resolve()):
                continue  # never read our own seen-log back as evidence
            try:
                st = os.stat(path)
            except OSError:
                COLLECTOR_ERRORS["access-gaps:"] = "access-gap transcript metadata unavailable"
                return None
            if st.st_mtime < now - window:
                continue
            start = offsets.get(path, max(0, st.st_size - spec.get("firstReadBytes", 2_000_000)))
            if start > st.st_size:
                start = 0
            with open(path, "rb") as fh:
                fh.seek(start)
                for line in fh:
                    if not hint.search(line):
                        continue
                    for m in pattern.finditer(line.decode("utf-8", "ignore")):
                        sig = access_signature(m.group(0))
                        if sig:
                            hits.append({"t": now, "sig": sig, "src": Path(path).parent.name[:40]})
                offsets[path] = fh.tell()
    state_dir().mkdir(parents=True, exist_ok=True)
    offsets_path.write_text(json.dumps(offsets))
    rows = [row for row in history if row["t"] >= now - window] + hits
    with open(seen_path, "w") as fh:
        for row in rows:
            fh.write(json.dumps(row) + "\n")
    counts: dict[str, set] = {}
    total: dict[str, int] = {}
    for row in rows:
        counts.setdefault(row["sig"], set()).add(row["src"])
        total[row["sig"]] = total.get(row["sig"], 0) + 1
    repeated = sorted((s for s, n in total.items() if n >= spec.get("minRepeats", 2)), key=lambda s: -total[s])
    active_keys = [hashlib.sha256(s.encode()).hexdigest()[:12] for s in repeated]
    repeated = repeated[:spec.get("maxCards", 8)]  # limit cards, not evidence of still-active gaps
    gaps = [{"sig": s, "count": total[s], "sources": len(counts[s]),
             "key": hashlib.sha256(s.encode()).hexdigest()[:12]} for s in repeated]
    return {"value": len(gaps), "limit": spec.get("limit", 1000), "gaps": gaps, "activeGapKeys": active_keys,
            "detail": "; ".join(f"{g['sig']} x{g['count']} in {g['sources']} sessions" for g in gaps[:5])}


COLLECTORS = {"disk": c_disk, "inodes": c_inodes, "gh-rate": c_gh_rate, "doppler": c_doppler,
              "spend": c_spend, "manual": c_manual, "neon": c_neon, "resend": c_resend,
              "gh-env-secrets": c_gh_env_secrets, "deadline": c_deadline, "stuck-procs": c_stuck_procs,
              "access-gaps": c_access_gaps}
