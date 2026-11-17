"""Strict cloud ledger, admission limits, origin evidence and disposition summaries."""
import json
import math
import os
import re
from pathlib import Path

REPO = "JovieInc/Jovie"

HEX40 = re.compile(r"[0-9a-f]{40}")

LEDGER_DEFAULT = Path.home() / ".local/state/jovie-lanes/cloud-lane.jsonl"

OPT_IN_LABEL = "cloud-lane"

DENY_LABELS = {"auth", "billing", "infra", "security", "migration", "codex-blocked", "no-cloud",
               "hold", "ws:security-auth", "ws:release-deploy", "protected", "governance", "cloud-held"}

DENY_TEXT = re.compile(r"(doppler|\.env\b|secret|credential|api[_ -]?key|token|DATABASE_URL|"
                       r"production (db|database)|prod db|stripe live|private data|migration)", re.I)

LIMITS = {"codex": {"concurrent": 2, "per_day": 8}}

BACKOFF_S = (900, 3600, 14400)  # consecutive limit hits: 15m, 1h, 4h

LIMIT_TEXT = re.compile(r"(rate.?limit|usage limit|quota|429|overloaded|capacity)", re.I)

RETAINED_VERDICTS = frozenset({"cloud-pending", "cloud-held", "cloud-draft-created"})

ADMISSION_STAGES = frozenset({"submitted", "accepted", "held", "limit", "pr_opened"})

PROVIDER_STAGES = frozenset({"submitted", "accepted", "held", "limit"})

CLAIM_STAGES = frozenset({"cloud-pending", "cloud-held", "cloud-draft-created"})

STAGES = ADMISSION_STAGES | CLAIM_STAGES | {"intent:push", "pushed", "intent:pr"}

UNREADABLE = object()

def enabled() -> bool:
    """LANES_CLOUD_ENABLED gates every external effect; unset means fully dormant."""
    return os.environ.get("LANES_CLOUD_ENABLED", "").strip().lower() in ("1", "true", "yes", "on")

def ledger_path() -> Path:
    return Path(os.environ.get("CLOUD_LANE_LEDGER") or LEDGER_DEFAULT)

def eligible(labels, text):
    """(ok, reason). Opt-in label required; any secret/private/protected signal keeps it on Gem."""
    labels = {str(label).lower() for label in labels}
    if OPT_IN_LABEL not in labels:
        return False, "not-opted-in"
    hit = labels & DENY_LABELS
    if hit:
        return False, f"label:{sorted(hit)[0]}"
    match = DENY_TEXT.search(text or "")
    if match:
        return False, f"text:{match.group(0).lower()}"
    return True, "ok"

def _valid_at(value):
    if not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0 or value > 1e12:
        return False  # the bound also keeps isfinite safe from huge ints
    return math.isfinite(value)

_HEX_FIELDS = ("baseSha", "patchSha256", "candTree", "commitSha")

def _valid_event(event):
    if not isinstance(event, dict) or not {"issue", "stage", "at"} <= event.keys():
        return False
    if not isinstance(event["issue"], str) or not event["issue"]:
        return False
    if event["stage"] not in STAGES or not _valid_at(event["at"]):
        return False
    if event["stage"] in PROVIDER_STAGES and (not isinstance(event.get("provider"), str)
                                              or not event.get("provider")):
        return False
    for key in ("task", "remote", "branch", "repo", "env", "fencingToken", "reason"):
        if key in event and not isinstance(event[key], str):
            return False
    if event.get("repo") not in (None, REPO):
        return False
    for key in _HEX_FIELDS:
        if key in event and not (isinstance(event[key], str) and HEX40.fullmatch(event[key])):
            return False
    if "attempt" in event and event["attempt"] != 1:
        return False
    if "pr" in event and not (isinstance(event["pr"], int) and not isinstance(event["pr"], bool)
                              and event["pr"] > 0):
        return False
    if "paths" in event and not (isinstance(event["paths"], list)
                                 and all(isinstance(p, str) for p in event["paths"])):
        return False
    if event["stage"] in ("cloud-pending", "cloud-draft-created") and not (
            event.get("fencingToken") and event.get("branch")):
        return False
    if event["stage"] in ("intent:push", "intent:pr") and not event.get("fencingToken"):
        return False
    return True

def read(path=None):
    """Strict ledger read: any malformed row raises (fail closed everywhere)."""
    path = Path(path or ledger_path())
    if not path.exists():
        return []
    out = []
    for line in path.read_text().splitlines():
        event = json.loads(line)
        if not _valid_event(event):
            raise ValueError("invalid cloud ledger event")
        out.append(event)
    return out

def append(event, path=None):
    path = Path(path or ledger_path())
    path.parent.mkdir(parents=True, exist_ok=True)
    if not _valid_event(event):
        raise ValueError("invalid cloud ledger event")
    with path.open("a") as handle:
        handle.write(json.dumps(event, sort_keys=True) + "\n")

def admit(provider, now, events):
    """(ok, reason): concurrency, daily cap and limit backoff from the ledger alone."""
    cap = LIMITS.get(provider)
    if not cap:
        return False, "unknown-provider"
    mine = [e for e in events if e.get("provider") == provider]
    hits, last_hit = 0, 0.0
    for event in mine:
        if event["stage"] == "limit":
            hits, last_hit = hits + 1, event["at"]
        elif event["stage"] == "pr_opened":
            hits = 0
    if hits and now < last_hit + BACKOFF_S[min(hits, len(BACKOFF_S)) - 1]:
        return False, "backoff"
    latest = {(e.get("issue") or e.get("task")): e for e in mine}
    if sum(e["stage"] not in ("pr_opened", "limit") for e in latest.values()) >= cap["concurrent"]:
        return False, "concurrency"
    if sum(e["stage"] == "submitted" and now - e["at"] < 86400 for e in mine) >= cap["per_day"]:
        return False, "daily-cap"
    return True, "ok"

def _disposition(issue, provider, stage, reason, path, at, *, task=None, branch=None,
                 fencing_token=None, extra=None):
    event = {"issue": issue, "provider": provider, "stage": stage, "reason": reason,
             "repo": REPO, "at": at}
    if task:
        event.update(task=task)
    if branch:
        event.update(branch=branch)
    if fencing_token:
        event.update(fencingToken=fencing_token)
    if extra:
        event.update(extra)
    append(event, path)

def live_claim(issue, path=None):
    """The latest cloud claim for an issue; live claims block every ordinary lane."""
    try:
        events = read(path)
    except (ValueError, OSError):
        return {"issue": issue, "stage": "cloud-held", "reason": "ledger-unreadable"}
    claims = [e for e in events if e.get("issue") == issue and e["stage"] in CLAIM_STAGES]
    return claims[-1] if claims else None

def read_evidence(path=None):
    """One ledger read for batch origin checks; UNREADABLE means fail closed."""
    try:
        return read(path)
    except (ValueError, OSError):
        return UNREADABLE

def is_cloud_origin(pr, evidence=None):
    """Draft-only authority (R3): repository-scoped, host-independent, fail closed.

    A cloud/ branch prefix OR trusted ledger evidence for this repository's branch
    blocks adoption, repair and promotion; either alone blocks; neither is proof
    that publication is permitted.
    """
    ref = pr.get("headRefName") or ""
    if ref.startswith("cloud/"):
        return True
    if evidence is None:
        evidence = read_evidence()
    if evidence is UNREADABLE:
        return True
    return any(event.get("branch") == ref and event.get("repo", REPO) == REPO for event in evidence)

def pct(values, q):
    if not values:
        return None
    values = sorted(values)
    return values[min(len(values) - 1, int(q * len(values)))]

def stats(events):
    out = {}
    for provider in sorted({e["provider"] for e in events if e.get("provider")}):
        mine = [e for e in events if e.get("provider") == provider]
        submitted = {e["issue"]: e["at"] for e in mine if e["stage"] == "submitted"}
        done = {e["issue"]: e["at"] for e in mine if e["stage"] == "pr_opened"}
        times = [done[issue] - submitted[issue] for issue in done if issue in submitted]
        held = [e.get("reason", "") for e in mine if e["stage"] == "cloud-held"]
        out[provider] = {
            "tasks": len(submitted), "prs": len(done),
            "success_rate": len(done) / len(submitted) if submitted else None,
            "time_to_pr_p50_s": pct(times, .5), "time_to_pr_p95_s": pct(times, .95),
            "held_sensitive": sum(r.startswith("held_sensitive:") for r in held),
            "held_oversize": sum(r.startswith("held_oversize:") for r in held),
            "held_reconcile": sum(r == "reconcile" or r.startswith("reconcile") for r in held),
            "provenance_mismatch": sum(r.startswith(("provenance", "environment-", "attempt-",
                                                     "task-not-listed", "list-")) for r in held),
            "cost_usd": None, "cost_basis": "subscription; marginal spend unmeasured"}
    return out
