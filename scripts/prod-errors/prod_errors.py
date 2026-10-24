#!/usr/bin/env python3
"""Jovie closed-loop production-error watcher (deterministic; no model calls).

Signal (Sentry webhook inbox + 30-min API sweep, CI/canary on main) -> ledger keyed by
Sentry issue ID -> one Linear issue per ID (Symphony lanes execute the fix) -> claim
expiry escalates -> post-deploy verifier is the ONLY closer (24h of zero events).
Owner: Jovie Owner. Human gates (money/Stripe/config/env/secrets/destructive data/gate
weakening) are root-caused, held from lanes and alerted to Tim. Secrets come from the
env file only and are never logged.
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

SCHEMA = "jovie-prod-errors/v1"
OWNER = "Jovie Owner (798b223e)"


class MissingConfig(RuntimeError):
    """A watcher lacks required env vars. Fail fast, record ONE clear
    'missing config: <VARS>' heartbeat/status -- never crash-loop or file duplicates."""
STATE = Path(os.environ.get("PROD_ERRORS_STATE", Path.home() / ".local/state/jovie-prod-errors"))
SENTRY_API = os.environ.get("SENTRY_API", "https://sentry.io/api/0")
LINEAR_API = "https://api.linear.app/graphql"
REPO = os.environ.get("PROD_ERRORS_REPO", "JovieInc/Jovie")
USER_THRESHOLD = int(os.environ.get("PROD_ERRORS_USER_THRESHOLD", "25"))
CLAIM_S = int(os.environ.get("PROD_ERRORS_CLAIM_S", str(4 * 3600)))
QUIET_S = 24 * 3600
SUSPECT_WINDOW_S = 6 * 3600
# Watcher -> expected heartbeat interval in seconds (dead-man alerts at 2x, or N straight errors).
# Each watcher is judged on its OWN cadence: the receiver only heartbeats when the dead-man pokes
# its /health (a 15-min timer), so its interval is 900, not the webhook latency; the synthetic is
# weekly.
WATCHERS = {"sentry-sweep": 1800, "ci-main": 900, "deadman": 900, "receiver": 900, "synthetic": 7 * 86400}
ERROR_STREAK = 3
GOLDEN = [
    ("checkout", r"checkout|stripe|billing|upgrade|subscription|price|payment"),
    ("auth", r"sign[-_ ]?in|sign[-_ ]?up|clerk|better[-_]?auth|/auth|session|oauth|login"),
    ("onboarding", r"onboarding|/start\b|claim"),
    ("public-profile", r"\[username\]|public[-_ ]?profile|/r/|smart[-_ ]?link|/listen|track|release|alias|handle"),
    ("navigation", r"navigation|middleware|not[-_ ]?found|layout|router"),
]
HUMAN_GATE = re.compile(
    r"no such price|stripe_[a-z_]*(price|key|secret)|missing (env|environment)|env var|"
    r"secret|api key|invalid api key|webhook secret|drop table|truncate|delete from|price_[A-Za-z0-9]{6,}",
    re.I)
WORKFLOWS = json.loads(os.environ.get("PROD_ERRORS_WORKFLOWS", "null")) or [
    "CI", "Production Synthetic Monitoring", "Canary Health Gate", "E2E Full Browser Matrix", "Visual & A11y Tests",
    "Golden Path Nightly", "M2 Revenue-Path Canary", "Nightly Testing Agent"]
# Scheduled watchers: a missed run (no completed main run within 2x schedule) alerts.
EXPECTED_RUNS = {"Production Synthetic Monitoring": 6 * 3600, "Golden Path Nightly": 86400,
                 "M2 Revenue-Path Canary": 86400}


now = time.time


def iso(t: float | None) -> str | None:
    return None if t is None else time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))


def parse_ts(s: str | None) -> float | None:
    if not s:
        return None
    s = s.replace("Z", "+00:00")
    from datetime import datetime
    return datetime.fromisoformat(s).timestamp()


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps(data, indent=2, sort_keys=True))
    tmp.replace(path)


def load_env(path: str | None) -> None:
    """KEY=VALUE lines into os.environ without echoing anything."""
    for p in filter(None, [path, os.environ.get("PROD_ERRORS_ENV")]):
        try:
            for line in Path(p).read_text().splitlines():
                line = line.strip().removeprefix("export ")
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip("'\""))
        except OSError:
            pass


def golden_flow(issue: dict) -> str | None:
    hay = " ".join(str(issue.get(k) or "") for k in ("title", "culprit", "transaction", "url"))
    hay += " " + " ".join(f"{t.get('key')}={t.get('value')}" for t in issue.get("tags") or [] if isinstance(t, dict))
    for flow, rx in GOLDEN:
        if re.search(rx, hay, re.I):
            return flow
    return None


def human_gate(issue: dict, trace: str = "") -> str | None:
    m = HUMAN_GATE.search(f"{issue.get('title', '')} {issue.get('culprit', '')} {trace}")
    if not m:
        return None
    text = m.group(0).lower()
    if "price" in text or "stripe" in text:
        return "stripe-config"
    if any(w in text for w in ("drop", "truncate", "delete")):
        return "destructive-data"
    return "secret-or-env"


def qualifies(issue: dict) -> bool:
    return is_synthetic(issue) or golden_flow(issue) is not None or int(issue.get("userCount") or 0) >= USER_THRESHOLD


def is_synthetic(issue: dict) -> bool:
    return "prod-errors-synthetic" in str(issue.get("title") or "")


def heartbeat(watcher: str, ok: bool, detail: str = "", state: Path = STATE) -> None:
    path = state / "heartbeats" / f"{watcher}.json"
    hb = read_json(path, {"watcher": watcher, "runs": []})
    hb["runs"] = (hb.get("runs") or [])[-9:] + [{"at": iso(now()), "ok": ok, "detail": detail[:300]}]
    hb.update(lastRunAt=now(), lastOk=ok, interval=WATCHERS.get(watcher), schema=SCHEMA)
    if ok:
        hb["lastOkAt"] = now()
    write_json(path, hb)


def install_seed(state: Path, at: float) -> float:
    """Grace anchor for the dead-man: every watcher gets one full 2x-interval window counted from
    install (written by install.sh, self-seeded on first read) before a missing heartbeat can
    alert -- a watcher that has not been due yet is not dead."""
    p = state / "installed_at"
    try:
        return float(p.read_text().strip())
    except (OSError, ValueError):
        try:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(str(int(at)))
        except OSError:
            pass
        return at


def watcher_health(state: Path = STATE, at: float | None = None, probe: dict | None = None) -> dict:
    at = at or now()
    out = {}
    seed = install_seed(state, at)
    for name, interval in WATCHERS.items():
        hb = read_json(state / "heartbeats" / f"{name}.json", None)
        if hb is None:
            # Never-run watcher: grace until 2x its interval after install, then it is missing.
            status = "pending-first-run" if at - seed < 2 * interval else "missing"
            out[name] = {"status": status, "interval": interval}
            continue
        age = at - float(hb.get("lastRunAt") or 0)
        runs = hb.get("runs") or []
        streak = len(runs) >= ERROR_STREAK and not any(r["ok"] for r in runs[-ERROR_STREAK:])
        last = runs[-1] if runs else {}
        status = "stale" if age > 2 * interval else "erroring" if streak else "ok"
        if not last.get("ok", False) and str(last.get("detail", "")).startswith("missing config:"):
            status = "missing-config"  # latest state names the exact env vars; overrides stale/erroring
        elif status == "ok" and probe is not None and probe.get(name) is False:
            status = "down"  # failed liveness probe on an otherwise-fresh heartbeat
        out[name] = {"status": status, "ageS": int(age), "interval": interval,
                     "lastDetail": (last.get("detail", "") if runs else "")}
    return out


class Http:
    def __init__(self, opener=urllib.request.urlopen):
        self.opener = opener

    def call(self, method: str, url: str, headers: dict, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method,
                                     headers={**headers, "Content-Type": "application/json"})
        with self.opener(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}


class Sentry:
    def __init__(self, http: Http):
        self.http = http
        missing = [v for v in ("SENTRY_AUTH_TOKEN", "SENTRY_ORG") if not os.environ.get(v)]
        if missing:
            raise MissingConfig("missing config: " + ", ".join(missing))
        self.org = os.environ["SENTRY_ORG"]
        self.h = {"Authorization": f"Bearer {os.environ['SENTRY_AUTH_TOKEN']}"}

    def top_issues(self) -> list[dict]:
        q = urllib.parse.urlencode({"query": "is:unresolved", "statsPeriod": "24h", "sort": "user",
                                    "limit": 100, "project": -1, "environment": []}, doseq=True)
        return self.http.call("GET", f"{SENTRY_API}/organizations/{self.org}/issues/?{q}", self.h)

    def issue(self, iid: str) -> dict:
        return self.http.call("GET", f"{SENTRY_API}/organizations/{self.org}/issues/{iid}/", self.h)

    def latest_trace(self, iid: str) -> str:
        try:
            ev = self.http.call("GET", f"{SENTRY_API}/organizations/{self.org}/issues/{iid}/events/latest/", self.h)
        except Exception:
            return ""
        lines = []
        for entry in ev.get("entries") or []:
            if entry.get("type") != "exception":
                continue
            for exc in (entry.get("data") or {}).get("values") or []:
                lines.append(f"{exc.get('type')}: {exc.get('value')}")
                for fr in ((exc.get("stacktrace") or {}).get("frames") or [])[-15:]:
                    lines.append(f"  at {fr.get('function')} ({fr.get('filename')}:{fr.get('lineNo')})")
        return "\n".join(lines)[:6000]

    def resolve(self, iid: str) -> None:
        self.http.call("PUT", f"{SENTRY_API}/organizations/{self.org}/issues/{iid}/", self.h, {"status": "resolved"})


class Linear:
    def __init__(self, http: Http):
        self.http = http
        key = os.environ.get("LINEAR_API_KEY", "")
        if not key:
            raise MissingConfig("missing config: LINEAR_API_KEY")
        self.h = {"Authorization": key}
        self.team = os.environ.get("PROD_ERRORS_LINEAR_TEAM", "JOV")
        self._labels: dict[str, str] = {}

    def gql(self, query: str, variables: dict) -> dict:
        r = self.http.call("POST", LINEAR_API, self.h, {"query": query, "variables": variables})
        if r.get("errors"):
            raise RuntimeError(f"linear: {r['errors'][0].get('message')}")
        return r["data"]

    def team_id(self) -> str:
        d = self.gql("query($k:String!){teams(filter:{key:{eq:$k}}){nodes{id}}}", {"k": self.team})
        return d["teams"]["nodes"][0]["id"]

    def label(self, team_id: str, name: str) -> str:
        if name not in self._labels:
            d = self.gql("query($n:String!){issueLabels(filter:{name:{eq:$n}}){nodes{id}}}", {"n": name})
            nodes = d["issueLabels"]["nodes"]
            self._labels[name] = nodes[0]["id"] if nodes else self.gql(
                "mutation($t:String!,$n:String!){issueLabelCreate(input:{teamId:$t,name:$n}){issueLabel{id}}}",
                {"t": team_id, "n": name})["issueLabelCreate"]["issueLabel"]["id"]
        return self._labels[name]

    def find_by_label(self, name: str) -> str | None:
        d = self.gql("query($n:String!){issues(filter:{labels:{name:{eq:$n}}},first:1){nodes{identifier}}}", {"n": name})
        nodes = d["issues"]["nodes"]
        return nodes[0]["identifier"] if nodes else None

    def create(self, title: str, body: str, labels: list[str], priority: int) -> str:
        tid = self.team_id()
        d = self.gql("mutation($i:IssueCreateInput!){issueCreate(input:$i){issue{identifier}}}",
                     {"i": {"teamId": tid, "title": title[:240], "description": body, "priority": priority,
                            "labelIds": [self.label(tid, n) for n in labels]}})
        return d["issueCreate"]["issue"]["identifier"]

    def comment(self, ident: str, body: str) -> None:
        iid = self.gql("query($i:String!){issue(id:$i){id}}", {"i": ident})["issue"]["id"]
        self.gql("mutation($i:String!,$b:String!){commentCreate(input:{issueId:$i,body:$b}){success}}",
                 {"i": iid, "b": body})

    def set_state(self, ident: str, state_type: str) -> None:
        d = self.gql("query($i:String!){issue(id:$i){id team{states{nodes{id type}}}}}", {"i": ident})
        sid = next(s["id"] for s in d["issue"]["team"]["states"]["nodes"] if s["type"] == state_type)
        self.gql("mutation($i:String!,$s:String!){issueUpdate(id:$i,input:{stateId:$s}){success}}",
                 {"i": d["issue"]["id"], "s": sid})


def gh_json(args: list[str]):
    out = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=60, check=True).stdout
    return json.loads(out or "null")


def alert(kind: str, text: str, siren: bool = False, linear: Linear | None = None, state: Path = STATE) -> None:
    """Every alert is journaled; Linear (label tim-alert) + optional webhook relay to Tim's phone."""
    msg = ("🚨 " if siren else "") + text
    with (state / "alerts.jsonl").open("a") as f:
        f.write(json.dumps({"at": iso(now()), "kind": kind, "siren": siren, "text": msg}) + "\n")
    url = os.environ.get("PROD_ERRORS_ALERT_WEBHOOK")
    if url:
        try:
            Http().call("POST", url, {}, {"text": msg, "siren": siren, "kind": kind, "owner": OWNER})
        except Exception:
            pass
    if linear is not None and kind not in ("sentry-issue",):
        try:
            key = f"alert:{hashlib.sha1((kind + text[:80]).encode()).hexdigest()[:10]}"
            if not linear.find_by_label(key):
                linear.create(f"[prod-errors] {kind}: {text[:120]}", msg, ["tim-alert", "prod-errors", key], 1)
        except Exception:
            pass


def issue_body(issue: dict, flow: str | None, trace: str, suspects: list[dict], gate: str | None) -> str:
    sid = issue["id"]
    lines = [
        f"**Owner:** {OWNER}. Symphony lanes execute the fix only.",
        f"**Sentry:** {issue.get('permalink', '')} (issue {sid}, {issue.get('userCount')} users, "
        f"{issue.get('count')} events, last seen {issue.get('lastSeen')})",
        f"**Golden path:** {flow or 'no'}",
        "", "```", f"{issue.get('title')}\n{issue.get('culprit') or ''}", trace or "(no stack trace)", "```", "",
    ]
    if suspects:
        lines.append("**Suspect merges (6h before first seen):** " + ", ".join(f"#{p['number']}" for p in suspects))
    if gate:
        lines += [f"**HUMAN GATE ({gate}).** Lanes must not change config/secrets/money. Root-cause it, "
                  "then Tim applies the exact change. This issue carries `hold`."]
    else:
        lines += ["**Definition of done (all required):**",
                  "1. Root cause in the PR body.", "2. A regression test that fails before the fix.",
                  "3. CI green.", "4. Preview smoke of the affected route on the PR's Vercel preview.",
                  "5. Auto-merge armed.",
                  "Closing is done ONLY by the gem post-deploy verifier after 24h with zero new events. "
                  "Do not mark duplicate/intentional/non-actionable to close it."]
    return "\n".join(lines)


def handle_issue(issue: dict, ledger: dict, sentry: Sentry, linear: Linear, merges: list[dict],
                 at: float, state: Path = STATE) -> str:
    sid = str(issue["id"])
    if not qualifies(issue):
        return "below-threshold"
    entry = ledger.get(sid)
    last_seen = parse_ts(issue.get("lastSeen")) or at
    flow = golden_flow(issue)
    if entry is None:
        trace = sentry.latest_trace(sid)
        gate = human_gate(issue, trace)
        first = parse_ts(issue.get("firstSeen")) or at
        suspects = [p for p in merges if 0 <= first - (parse_ts(p.get("mergedAt")) or 0) <= SUSPECT_WINDOW_S]
        labels = [f"sentry:{sid}", "prod-error"] + (["golden-path"] if flow else [])
        labels += ["human-gate", "hold"] if gate else ["agent-ready"]
        synthetic = is_synthetic(issue)
        ident = linear.find_by_label(f"sentry:{sid}")
        if not ident and not synthetic:
            ident = linear.create(f"[Sentry {sid}] {issue.get('title')}",
                                  issue_body(issue, flow, trace, suspects, gate), labels, 1 if flow else 2)
        entry = ledger[sid] = {"sentryId": sid, "linear": ident, "flow": flow, "gate": gate, "synthetic": synthetic,
                               "status": "deployed" if synthetic else "claimed", "openedAt": at,
                               "claimExpiresAt": at + CLAIM_S, "title": issue.get("title"),
                               "users": issue.get("userCount"), "lastSeen": last_seen}
        if synthetic:
            entry["deployedAt"] = at
        elif gate:
            siren = gate == "stripe-config" or flow == "checkout"
            alert("human-gate", f"{gate} on {flow or 'prod'}: {issue.get('title')} ({ident}). "
                  "Root-cause is in the Linear issue; apply the exact config change there.", siren, linear, state)
        elif flow == "checkout":
            alert("checkout", f"Checkout error {issue.get('title')} ({ident}), lane dispatched.", True, linear, state)
        return "opened"
    entry.update(users=issue.get("userCount"), lastSeen=last_seen)
    if entry["status"] in ("closed", "deployed") and last_seen > (entry.get("closedAt") or entry.get("deployedAt") or at):
        entry.update(status="claimed", reopenedAt=at, claimExpiresAt=at + CLAIM_S, reopens=entry.get("reopens", 0) + 1)
        if entry.get("linear"):
            linear.set_state(entry["linear"], "unstarted")
            linear.comment(entry["linear"], f"Reopened by gem verifier: new event at {iso(last_seen)} after deploy/close. Escalating.")
        alert("reopened", f"Sentry {sid} regressed after fix ({entry.get('linear')}).", flow == "checkout", linear, state)
        return "reopened"
    return "tracked"


def advance(ledger: dict, linear: Linear, sentry: Sentry, prs: list[dict], at: float, state: Path = STATE) -> None:
    """claim expiry -> escalate; merged PR -> deployed; 24h quiet after deploy -> close (only closer)."""
    for sid, e in ledger.items():
        if e["status"] == "claimed" and e.get("linear"):
            pr = next((p for p in prs if e["linear"] in (p.get("title", "") + p.get("body", "") + p.get("headRefName", ""))
                       or f"sentry:{sid}" in p.get("body", "")), None)
            if pr and pr.get("mergedAt"):
                e.update(status="deployed", deployedAt=parse_ts(pr["mergedAt"]), pr=pr["number"])
            elif pr:
                e.update(pr=pr["number"], prOpenedAt=e.get("prOpenedAt") or at)
            elif at > e["claimExpiresAt"] and not e.get("gate"):
                e["claimExpiresAt"] = at + CLAIM_S
                e["escalations"] = e.get("escalations", 0) + 1
                linear.comment(e["linear"], "Claim expired with no PR. Escalated to Jovie Owner; re-arming claim.")
                alert("claim-expired", f"No PR for Sentry {sid} ({e['linear']}) within claim window.",
                      e.get("flow") == "checkout", linear, state)
        if e["status"] == "deployed" and at - e["deployedAt"] >= QUIET_S and e.get("lastSeen", 0) <= e["deployedAt"]:
            e.update(status="closed", closedAt=at)
            try:
                sentry.resolve(sid)
            except Exception:
                pass
            if e.get("linear"):
                linear.set_state(e["linear"], "completed")
                linear.comment(e["linear"], "Closed by gem post-deploy verifier: zero events for 24h after deploy.")


def golden_path_sentry(ledger: dict) -> dict:
    open_golden = [e for e in ledger.values() if e.get("flow") and e["status"] != "closed" and not e.get("synthetic")]
    users = sum(int(e.get("users") or 0) for e in open_golden)
    score = max(0, 100 - sum(min(int(e.get("users") or 0), 40) + 10 for e in open_golden))
    return {"score": score, "openGolden": len(open_golden), "usersAffected": users,
            "checkoutOpen": sum(e["flow"] == "checkout" for e in open_golden),
            "top": sorted(({"sentryId": e["sentryId"], "flow": e["flow"], "users": e.get("users"),
                            "linear": e.get("linear"), "status": e["status"]} for e in open_golden),
                          key=lambda x: -int(x["users"] or 0))[:5]}


def write_bottleneck(ledger: dict, state: Path = STATE) -> dict:
    frag = {"schema": "pipeline-bottleneck/v1", "fragment": "prod-errors", "producer": "gem:jovie-prod-errors",
            "updatedAt": iso(now()), "golden_path_sentry": golden_path_sentry(ledger),
            "watcher_health": watcher_health(state)}
    write_json(state / "bottleneck-fragment.json", frag)
    return frag


def sweep(sentry: Sentry, linear: Linear, state: Path = STATE) -> dict:
    at = now()
    ledger = read_json(state / "ledger.json", {})
    inbox = sorted((state / "inbox").glob("*.json")) if (state / "inbox").exists() else []
    issues = {str(i["id"]): i for i in sentry.top_issues()}
    for f in inbox:
        sid = str(read_json(f, {}).get("issueId") or "")
        if sid and sid not in issues:
            issues[sid] = sentry.issue(sid)
    merges = gh_json(["pr", "list", "-R", REPO, "--state", "merged", "--limit", "60",
                      "--json", "number,mergedAt,title"]) or []
    prs = gh_json(["pr", "list", "-R", REPO, "--state", "all", "--search", "Sentry in:body", "--limit", "100",
                   "--json", "number,title,body,headRefName,mergedAt"]) or []
    counts: dict[str, int] = {}
    for issue in issues.values():
        r = handle_issue(issue, ledger, sentry, linear, merges, at, state)
        counts[r] = counts.get(r, 0) + 1
    advance(ledger, linear, sentry, prs, at, state)
    write_json(state / "ledger.json", ledger)
    for f in inbox:
        f.unlink(missing_ok=True)
    return counts


def ci_main(linear: Linear, state: Path = STATE) -> dict:
    latest: dict[str, dict] = {}
    for wf in WORKFLOWS:
        runs = gh_json(["run", "list", "-R", REPO, "--branch", "main", "--workflow", wf, "--limit", "5",
                        "--json", "databaseId,workflowName,conclusion,status,event,createdAt,url"]) or []
        done = [r for r in runs if r.get("status") == "completed"]
        if done:
            latest[wf] = done[0]
    seen = read_json(state / "ci-ledger.json", {})
    opened = 0
    for wf, r in latest.items():
        key = f"ci:{hashlib.sha1(wf.encode()).hexdigest()[:10]}"
        entry = seen.setdefault(key, {"workflow": wf})
        if r["conclusion"] in ("failure", "timed_out", "startup_failure"):
            if entry.get("state") != "red":
                ident = linear.find_by_label(key) or linear.create(
                    f"[main red] {wf}", f"**Owner:** {OWNER}\nLatest main run failed: {r['url']}\n"
                    "Fix the real failure; do not loosen the gate. Closes when the next main run is green.",
                    [key, "prod-error", "ci-main", "agent-ready"], 2)
                entry.update(state="red", linear=ident, since=r["createdAt"])
                opened += 1
        elif r["conclusion"] == "success" and entry.get("state") == "red":
            if entry.get("linear"):
                linear.set_state(entry["linear"], "completed")
            entry.update(state="green")
        elif r["conclusion"] == "cancelled":
            entry["cancelStreak"] = entry.get("cancelStreak", 0) + 1
            if entry["cancelStreak"] == 3:
                alert("ci-cancelled", f"{wf} cancelled 3x in a row on main; it never finishes.", False, linear, state)
        if r["conclusion"] != "cancelled":
            entry["cancelStreak"] = 0
        entry["lastRunAt"] = r["createdAt"]
    for wf, max_age in EXPECTED_RUNS.items():
        last = parse_ts(seen.get(f"ci:{hashlib.sha1(wf.encode()).hexdigest()[:10]}", {}).get("lastRunAt"))
        if last is None or now() - last > 2 * max_age:
            alert("missed-run", f"{wf} has not completed a run on main within 2x its schedule.", False, linear, state)
    write_json(state / "ci-ledger.json", seen)
    return {"watched": len(latest), "opened": opened}


def deadman(linear: Linear | None, state: Path = STATE, port: int = 8788) -> dict:
    probe_ok = True
    try:  # liveness, not interval: a failed /health GET is direct evidence the receiver is down
        urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=5).read()
    except Exception:
        probe_ok = False
    health = watcher_health(state, probe={"receiver": probe_ok})
    ledger = read_json(state / "ledger.json", {})
    for e in ledger.values():
        if e.get("synthetic") and e["status"] != "closed" and now() - e["openedAt"] > 3 * 86400:
            health["synthetic-loop"] = {"status": "stuck", "sentryId": e["sentryId"]}
    # ONE issue per watcher per unhealthy episode: recovery clears the watcher's gate, a watcher
    # that stays unhealthy is never re-filed, and newly unhealthy ones batch into ONE alert.
    seen_alerts = read_json(state / "deadman-alerts.json", {})
    newly = []
    for name, h in sorted(health.items()):
        if h["status"] in ("ok", "pending-first-run"):
            seen_alerts.pop(name, None)
            continue
        if name in seen_alerts:
            continue
        seen_alerts[name] = h["status"]
        text = f"{name} is {h['status']}"
        if h["status"] == "missing-config":
            text += f": {h.get('lastDetail', '')}. Fix the env file, then restart the unit."
        newly.append(text)
    if newly:
        alert("dead-man", "watchers unhealthy: " + ", ".join(newly), False, linear, state)
    write_json(state / "deadman-alerts.json", seen_alerts)
    write_bottleneck(ledger, state)
    return health


def synthetic(http: Http, state: Path = STATE) -> str:
    dsn = os.environ.get("SENTRY_SYNTHETIC_DSN", "")
    m = re.match(r"https://([^@]+)@([^/]+)/(\d+)", dsn)
    if not m:
        raise MissingConfig("missing config: SENTRY_SYNTHETIC_DSN")
    key, host, project = m.groups()
    tag = uuid.uuid4().hex[:8]
    http.call("POST", f"https://{host}/api/{project}/store/?sentry_key={key}&sentry_version=7", {},
              {"event_id": uuid.uuid4().hex, "level": "error", "environment": "synthetic", "platform": "python",
               "message": f"prod-errors-synthetic weekly loop test {tag}",
               "fingerprint": [f"prod-errors-synthetic-{tag}"], "tags": {"synthetic": "prod-errors-loop"}})
    return tag


def verify_signature(secret: str, body: bytes, sig: str) -> bool:
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return bool(sig) and hmac.compare_digest(expected, sig)


def receive(port: int, state: Path = STATE) -> None:
    from http.server import BaseHTTPRequestHandler, HTTPServer
    secret = os.environ.get("SENTRY_WEBHOOK_SECRET", "")
    if not secret:
        # Fail fast WITHOUT crash-looping: record the config status, exit clean. systemd's
        # Restart=on-failure stays quiet; the dead-man files the ONE missing-config issue.
        detail = "missing config: SENTRY_WEBHOOK_SECRET"
        heartbeat("receiver", False, detail, state)
        print(json.dumps({"ok": False, "cmd": "receive", "error": detail}), file=sys.stderr)
        return

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            heartbeat("receiver", True, "health", state)
            self.send_response(200)
            self.end_headers()

        def do_POST(self):
            body = self.rfile.read(min(int(self.headers.get("Content-Length") or 0), 1_000_000))
            if not verify_signature(secret, body, self.headers.get("sentry-hook-signature", "")):
                self.send_response(401)
                self.end_headers()
                return
            data = json.loads(body or b"{}").get("data") or {}
            iid = (data.get("issue") or {}).get("id") or (data.get("event") or {}).get("issue_id")
            if iid:
                write_json(state / "inbox" / f"{iid}.json", {"issueId": str(iid), "at": iso(now())})
                subprocess.run(["systemctl", "--user", "start", "--no-block", "jovie-prod-errors-sweep.service"],
                               check=False)
            self.send_response(202)
            self.end_headers()

    server = HTTPServer(("127.0.0.1", port), H)  # bind fails here if the port is taken
    heartbeat("receiver", True, "listening", state)  # startup heartbeat
    server.serve_forever()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("cmd", choices=["sweep", "ci-main", "deadman", "synthetic", "receive"])
    ap.add_argument("--env", default=str(Path.home() / ".config/jovie-prod-errors/env"))
    ap.add_argument("--port", type=int, default=8788)
    a = ap.parse_args(argv)
    load_env(a.env)
    load_env(os.environ.get("LANES_LINEAR_ENV"))
    STATE.mkdir(parents=True, exist_ok=True)
    http = Http()
    watcher = {"sweep": "sentry-sweep", "ci-main": "ci-main", "deadman": "deadman", "synthetic": "synthetic"}.get(a.cmd)
    try:
        if a.cmd == "receive":
            receive(a.port)
            return 0
        linear = Linear(http)
        if a.cmd == "sweep":
            result = sweep(Sentry(http), linear)
            write_bottleneck(read_json(STATE / "ledger.json", {}))
            dm = watcher_health(STATE)["deadman"]["status"]
            if dm not in ("ok", "pending-first-run"):  # watch the watcher-watcher
                alert("dead-man", f"deadman timer itself is not heartbeating ({dm})", False, linear)
        elif a.cmd == "ci-main":
            result = ci_main(linear)
        elif a.cmd == "deadman":
            result = deadman(linear)
        else:
            result = synthetic(http)
        heartbeat(watcher, True, json.dumps(result)[:300])
        print(json.dumps({"ok": True, "cmd": a.cmd, "result": result}))
        return 0
    except MissingConfig as exc:  # fail fast: record ONE clear config status, exit clean (no crash-loop)
        if watcher:
            heartbeat(watcher, False, str(exc))
        print(json.dumps({"ok": False, "cmd": a.cmd, "error": str(exc)}), file=sys.stderr)
        return 0
    except Exception as exc:  # heartbeat the failure; dead-man counts streaks
        detail = f"{type(exc).__name__}: {str(exc)[:200]}"
        if watcher:
            heartbeat(watcher, False, detail)
        print(json.dumps({"ok": False, "cmd": a.cmd, "error": detail}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
