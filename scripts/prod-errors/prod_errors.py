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

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from apiclient import LINEAR_API_URL, ApiClient, LinearClient, LinearGraphQLError, run_gh  # noqa: E402
from apiclient.contract import provider_spec  # noqa: E402

SCHEMA = "jovie-prod-errors/v1"
OWNER = "Jovie Owner (798b223e)"


class MissingConfig(RuntimeError):
    """A watcher lacks required env vars. Fail fast, record ONE clear
    'missing config: <VARS>' heartbeat/status -- never crash-loop or file duplicates."""


class LinearIssueMissing(RuntimeError):
    """The Linear issue id the ledger holds is deleted, or not visible to this API key (moved
    team/project, rotated key). The loop relinks -- files a fresh issue -- instead of crashing."""


class GhDeferred(RuntimeError):
    """apiclient deferred the gh call (exit 75, budget-reserve: 'retry later, not a verdict').
    A deferral is a visible skip-this-tick status, never a watcher failure."""
STATE = Path(os.environ.get("PROD_ERRORS_STATE", Path.home() / ".local/state/jovie-prod-errors"))
# Hosts come from the shared provider contract; every call goes through scripts/apiclient.
SENTRY_API = os.environ.get("SENTRY_API", f"https://{provider_spec('sentry')['hosts'][0]}/api/0")
LINEAR_API = LINEAR_API_URL
REPO = os.environ.get("PROD_ERRORS_REPO", "JovieInc/Jovie")
USER_THRESHOLD = int(os.environ.get("PROD_ERRORS_USER_THRESHOLD", "1"))
EVENT_THRESHOLD = int(os.environ.get("PROD_ERRORS_EVENT_THRESHOLD", "3"))
# Only production counts. Preview/staging/dev errors are recorded as ignored with this reason, never silenced silently.
ENVIRONMENT = os.environ.get("PROD_ERRORS_ENVIRONMENT", "production")
CLAIM_S = int(os.environ.get("PROD_ERRORS_CLAIM_S", str(4 * 3600)))
QUIET_S = 24 * 3600
# A main run still in progress past this is a hang, even if nothing cancelled it.
RUN_TIMEOUT_S = int(os.environ.get("PROD_ERRORS_RUN_TIMEOUT_S", str(2 * 3600)))
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
# gh --json field sets, pinned against gh 2.96.0 (gem's CLI) source: run list supports exactly
# pkg/cmd/run/shared.RunFields -- 'startedAt', NOT the REST wire name 'runStartedAt' -- and pr
# list supports api.PullRequestFields. Requesting an unsupported field kills the whole call
# ('Unknown JSON field: ...'), blinding the watcher; tests assert every requested field is here.
GH_RUN_LIST_FIELDS = frozenset(
    "attempt conclusion createdAt databaseId displayTitle event headBranch headSha name number "
    "startedAt status updatedAt url workflowDatabaseId workflowName".split())
GH_PR_LIST_FIELDS = frozenset(
    "additions assignees author autoMergeRequest baseRefName baseRefOid body changedFiles closed "
    "closedAt closingIssuesReferences comments commits createdAt deletions files fullDatabaseId "
    "headRefName headRefOid headRepository headRepositoryOwner id isCrossRepository isDraft labels "
    "latestReviews maintainerCanModify mergeCommit mergeStateStatus mergeable mergedAt mergedBy "
    "milestone number potentialMergeCommit projectCards projectItems reactionGroups reviewDecision "
    "reviewRequests reviews state statusCheckRollup title updatedAt url".split())
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
    return (is_synthetic(issue) or golden_flow(issue) is not None
            or int(issue.get("userCount") or 0) >= USER_THRESHOLD
            or int(issue.get("count") or 0) >= EVENT_THRESHOLD
            or issue.get("substatus") in ("regressed", "escalating"))


def linked_linear(issue: dict) -> str | None:
    """A Linear issue already attached by Sentry's Linear integration (annotations); adopt, never duplicate."""
    for a in issue.get("annotations") or []:
        m = re.search(r"/issue/(JOV-\d+)", str(a.get("url") if isinstance(a, dict) else a))
        if m:
            return m.group(1)
    return None


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
        token = os.environ["SENTRY_AUTH_TOKEN"]
        self.client = ApiClient("sentry", token,
                                authorize=lambda h: h.update({"Authorization": f"Bearer {token}"}))

    def _call(self, method: str, url: str, body=None):
        res = self.client.request(url, method=method,
                                  headers={"Content-Type": "application/json"}, body=body)
        if res.status >= 400:
            raise RuntimeError(f"sentry: HTTP {res.status} for {method} {urllib.parse.urlsplit(url).path}")
        return res.json() if res.text else {}

    def top_issues(self) -> list[dict]:
        q = urllib.parse.urlencode({"query": f"is:unresolved environment:{ENVIRONMENT}", "statsPeriod": "24h", "sort": "user",
                                    "limit": 100, "project": -1}, doseq=True)
        return self._call("GET", f"{SENTRY_API}/organizations/{self.org}/issues/?{q}")

    def issue(self, iid: str) -> dict:
        return self._call("GET", f"{SENTRY_API}/organizations/{self.org}/issues/{iid}/")

    def latest_trace(self, iid: str) -> str:
        try:
            ev = self._call("GET", f"{SENTRY_API}/organizations/{self.org}/issues/{iid}/events/latest/")
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
        self._call("PUT", f"{SENTRY_API}/organizations/{self.org}/issues/{iid}/", {"status": "resolved"})


class Linear:
    def __init__(self, http: Http):
        self.http = http
        key = os.environ.get("LINEAR_API_KEY", "")
        if not key:
            raise MissingConfig("missing config: LINEAR_API_KEY")
        self.client = LinearClient(key, lambda rejected=None: key)
        self.team = os.environ.get("PROD_ERRORS_LINEAR_TEAM", "JOV")
        self._labels: dict[str, str] = {}

    def gql(self, query: str, variables: dict) -> dict:
        try:
            return self.client.graphql(query, variables)
        except LinearGraphQLError as e:
            msg = str((e.errors or [{}])[0].get("message") or "")
            if "not found" in msg.lower():  # deleted/invisible issue id: relinkable, not fatal
                raise LinearIssueMissing(f"linear: {msg}") from e
            raise RuntimeError(f"linear: {msg}") from e

    def team_id(self) -> str:
        d = self.gql("query($k:String!){teams(filter:{key:{eq:$k}}){nodes{id}}}", {"k": self.team})
        return d["teams"]["nodes"][0]["id"]

    def label(self, team_id: str, name: str) -> str:
        if name not in self._labels:
            d = self.gql("query($n:String!,$t:ID){issueLabels(filter:{name:{eq:$n},or:[{team:{id:{eq:$t}}},"
                         "{team:{null:true}}]}){nodes{id}}}", {"n": name, "t": team_id})
            nodes = d["issueLabels"]["nodes"]
            self._labels[name] = nodes[0]["id"] if nodes else self.gql(
                "mutation($t:String!,$n:String!){issueLabelCreate(input:{teamId:$t,name:$n}){issueLabel{id}}}",
                {"t": team_id, "n": name})["issueLabelCreate"]["issueLabel"]["id"]
        return self._labels[name]

    def find_by_label(self, name: str, open_only: bool = False) -> str | None:
        """open_only: an episode that was completed/canceled must not swallow a NEW identical episode (JOV-9007)."""
        flt = "labels:{name:{eq:$n}}" + (",state:{type:{nin:[\"completed\",\"canceled\"]}}" if open_only else "")
        d = self.gql("query($n:String!){issues(filter:{" + flt + "},first:1){nodes{identifier}}}", {"n": name})
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
    res = run_gh(args)
    if res["code"] != 0:
        if res.get("deferred"):  # budget-reserve: retry later, not a verdict on this change
            raise GhDeferred(f"gh {' '.join(args[:2])} failed (deferred): {res['stderr'][:300]}")
        raise RuntimeError(f"gh {' '.join(args[:2])} failed (exit {res['code']}): {res['stderr'][:300]}")
    return json.loads(res["stdout"] or "null")


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
            if not linear.find_by_label(key, open_only=True):
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


def refile_missing(sid: str, entry: dict, linear: Linear, title: str, body: str, labels: list[str],
                   priority: int, why: str) -> str | None:
    """A ledger-held Linear id turned out deleted or invisible to this key: drop it, file a FRESH
    issue, relink the entry, and log on stderr so the event stays visible in unit output. Synthetic
    entries never file an issue; they just drop the dead link. Only raises if filing the fresh
    issue itself fails (fatal by design -- never silently swallowed)."""
    old = entry.get("linear")
    if entry.get("synthetic"):
        entry.update(linear=None, adopted=False, relinkedFrom=old)
        print(f"prod-errors: sentry {sid}: stale Linear link {old} ({why}); dropped (synthetic)", file=sys.stderr)
        return None
    ident = linear.create(f"[Sentry {sid}] {title}", body, labels, priority)
    entry.update(linear=ident, adopted=False, relinkedFrom=old)
    print(f"prod-errors: sentry {sid}: stale Linear link {old} ({why}); filed fresh {ident}", file=sys.stderr)
    return ident


def handle_issue(issue: dict, ledger: dict, sentry: Sentry, linear: Linear, merges: list[dict],
                 at: float, state: Path = STATE, rollup: str | None = None, group_qualifies: bool = False) -> str:
    sid = str(issue["id"])
    if not (group_qualifies or qualifies(issue)):
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
        ident = linear.find_by_label(f"sentry:{sid}") or rollup or linked_linear(issue)
        adopted = bool(ident) and not synthetic
        body = issue_body(issue, flow, trace, suspects, gate)
        if not ident and not synthetic:
            ident = linear.create(f"[Sentry {sid}] {issue.get('title')}", body, labels, 1 if flow else 2)
        entry = ledger[sid] = {"sentryId": sid, "linear": ident, "flow": flow, "gate": gate, "synthetic": synthetic,
                               "status": "deployed" if synthetic else "claimed", "openedAt": at,
                               "claimExpiresAt": at + CLAIM_S, "title": issue.get("title"),
                               "users": issue.get("userCount"), "lastSeen": last_seen,
                               "firstSeen": first, "project": (issue.get("project") or {}).get("slug"),
                               "adopted": adopted}
        relink = False
        if adopted and ident:
            try:
                linear.comment(ident, f"Tracked by the prod-errors loop (Sentry {sid}, {issue.get('userCount')} users, "
                               f"{issue.get('count')} events). Closing is done only by the post-deploy verifier after 24h "
                               "with zero events; a later event reopens this issue and escalates.")
            except LinearIssueMissing as exc:
                # Adopted/rolled-up id is gone or invisible to this key: file fresh and relink.
                ident = refile_missing(sid, entry, linear, issue.get("title"), body, labels,
                                       1 if flow else 2, str(exc))
                relink = True
        if synthetic:
            entry["deployedAt"] = at
        elif gate:
            siren = gate == "stripe-config" or flow == "checkout"
            alert("human-gate", f"{gate} on {flow or 'prod'}: {issue.get('title')} ({ident}). "
                  "Root-cause is in the Linear issue; apply the exact config change there.", siren, linear, state)
        elif flow == "checkout":
            alert("checkout", f"Checkout error {issue.get('title')} ({ident}), lane dispatched.", True, linear, state)
        return "relinked" if relink else "opened"
    entry.update(users=issue.get("userCount"), lastSeen=last_seen)
    if entry["status"] in ("closed", "deployed") and last_seen > (entry.get("closedAt") or entry.get("deployedAt") or at):
        entry.update(status="claimed", reopenedAt=at, claimExpiresAt=at + CLAIM_S, reopens=entry.get("reopens", 0) + 1)
        relink = False
        if entry.get("linear"):
            try:
                linear.set_state(entry["linear"], "unstarted")
                linear.comment(entry["linear"], f"Reopened by gem verifier: new event at {iso(last_seen)} after deploy/close. Escalating.")
            except LinearIssueMissing as exc:
                refile_missing(sid, entry, linear, issue.get("title") or entry.get("title") or "prod error",
                               f"Reopened episode (Sentry {sid}): a new event arrived after deploy/close, and the "
                               f"previous Linear issue went away ({exc}). This fresh issue carries the escalation.",
                               [f"sentry:{sid}", "prod-error"] + (["golden-path"] if flow else [])
                               + (["human-gate", "hold"] if entry.get("gate") else ["agent-ready"]),
                               1 if flow else 2, str(exc))
                relink = True
        alert("reopened", f"Sentry {sid} regressed after fix ({entry.get('linear')}).", flow == "checkout", linear, state)
        return "relinked" if relink else "reopened"
    return "tracked"


def advance(ledger: dict, linear: Linear, sentry: Sentry, prs: list[dict], at: float, state: Path = STATE) -> int:
    """claim expiry -> escalate; merged PR -> deployed; 24h quiet after deploy -> close (only closer).
    Returns how many stale ledger links were hit this pass (deleted/invisible Linear ids are
    relinked or logged, never fatal)."""
    stale = 0
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
                try:
                    linear.comment(e["linear"], "Claim expired with no PR. Escalated to Jovie Owner; re-arming claim.")
                except LinearIssueMissing as exc:
                    refile_missing(sid, e, linear, e.get("title") or "prod error",
                                   f"Claim expired with no PR (Sentry {sid}); the previous Linear issue went away "
                                   f"({exc}). The claim is re-armed on this fresh issue.",
                                   [f"sentry:{sid}", "prod-error"] + (["golden-path"] if e.get("flow") else [])
                                   + (["human-gate", "hold"] if e.get("gate") else ["agent-ready"]),
                                   1 if e.get("flow") else 2, str(exc))
                    stale += 1
                alert("claim-expired", f"No PR for Sentry {sid} ({e['linear']}) within claim window.",
                      e.get("flow") == "checkout", linear, state)
        if e["status"] == "deployed" and at - e["deployedAt"] >= QUIET_S and e.get("lastSeen", 0) <= e["deployedAt"]:
            e.update(status="closed", closedAt=at)
            try:
                sentry.resolve(sid)
            except Exception:
                pass
            shared = any(o is not e and o.get("linear") == e.get("linear") and o["status"] != "closed"
                         for o in ledger.values())
            if e.get("linear") and not shared:
                try:
                    linear.set_state(e["linear"], "completed")
                    linear.comment(e["linear"], "Closed by gem post-deploy verifier: zero events for 24h after deploy "
                                   f"(Sentry {sid} resolved; receipt: deployed {iso(e['deployedAt'])}, closed {iso(at)}).")
                except LinearIssueMissing as exc:
                    # The Linear side is already gone; there is nothing to close there. Stay closed
                    # and keep the event visible -- no fresh issue just to close it.
                    print(f"prod-errors: sentry {sid}: stale Linear link {e['linear']} at close ({exc}); "
                          "Linear issue already gone", file=sys.stderr)
                    stale += 1
    return stale


def golden_path_sentry(ledger: dict) -> dict:
    open_golden = [e for e in ledger.values() if e.get("flow") and e["status"] != "closed" and not e.get("synthetic")]
    users = sum(int(e.get("users") or 0) for e in open_golden)
    score = max(0, 100 - sum(min(int(e.get("users") or 0), 40) + 10 for e in open_golden))
    return {"score": score, "openGolden": len(open_golden), "usersAffected": users,
            "checkoutOpen": sum(e["flow"] == "checkout" for e in open_golden),
            "top": sorted(({"sentryId": e["sentryId"], "flow": e["flow"], "users": e.get("users"),
                            "linear": e.get("linear"), "status": e["status"]} for e in open_golden),
                          key=lambda x: -int(x["users"] or 0))[:5]}


def pct(xs: list[float], q: float) -> float | None:
    xs = sorted(xs)
    return round(xs[min(len(xs) - 1, int(q * len(xs)))], 1) if xs else None


def loop_metrics(ledger: dict, issues: list[dict], at: float) -> dict:
    """unresolved-by-impact, first-seen -> closed (hours, p50/p95), regression rate; fed to Ovie Fleet."""
    real = [e for e in ledger.values() if not e.get("synthetic")]
    closed = [e for e in real if e.get("closedAt") and e.get("firstSeen")]
    ttf = [(e["closedAt"] - e["firstSeen"]) / 3600 for e in closed]
    return {"at": iso(at), "environment": ENVIRONMENT, "unresolvedProd": len(issues),
            "usersAffected24h": sum(int(i.get("userCount") or 0) for i in issues),
            "events24h": sum(int(i.get("count") or 0) for i in issues),
            "tracked": len(real), "closed": len(closed),
            "withLinear": sum(bool(e.get("linear")) for e in real),
            "firstSeenToFixHours": {"p50": pct(ttf, 0.5), "p95": pct(ttf, 0.95)},
            "regressionRate": round(sum(bool(e.get("reopens")) for e in real) / len(real), 3) if real else None,
            "top": [{"id": i.get("shortId") or i["id"], "users": int(i.get("userCount") or 0),
                     "events": int(i.get("count") or 0), "title": str(i.get("title"))[:80]}
                    for i in sorted(issues, key=lambda i: -int(i.get("userCount") or 0))[:10]]}


def record_metrics(ledger: dict, issues: list[dict], at: float, state: Path = STATE) -> dict:
    m = loop_metrics(ledger, issues, at)
    write_json(state / "sentry-loop-metrics.json", m)
    with open(state / "sentry-loop-metrics.jsonl", "a") as f:  # trend: one line per sweep
        f.write(json.dumps({k: m[k] for k in ("at", "unresolvedProd", "usersAffected24h", "events24h",
                                              "firstSeenToFixHours", "regressionRate")}) + "\n")
    return m


def write_bottleneck(ledger: dict, state: Path = STATE) -> dict:
    frag = {"schema": "pipeline-bottleneck/v1", "fragment": "prod-errors", "producer": "gem:jovie-prod-errors",
            "updatedAt": iso(now()), "golden_path_sentry": golden_path_sentry(ledger),
            "sentry_loop": read_json(state / "sentry-loop-metrics.json", {}),
            "watcher_health": watcher_health(state)}
    write_json(state / "bottleneck-fragment.json", frag)
    return frag


THREAD_REPOS = [r for r in os.environ.get("PROD_ERRORS_THREAD_REPOS", "JovieInc/summer-config").split(",") if r]
BOT_AUTHORS = {"sentry", "sentry[bot]", "cursor", "cursor[bot]", "coderabbitai", "coderabbitai[bot]"}
THREADS_Q = ("query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){"
             "reviewThreads(first:50){nodes{id isResolved isOutdated path line comments(first:1){nodes{author{login} body}}}}}}}")


def bot_threads(linear: Linear, state: Path = STATE) -> dict:
    """Unresolved bot review threads block repos with required conversation resolution (summer-config) even when
    every check is green. File ONE agent-ready Linear issue per blocked PR (fix the real bug, reply, resolve)."""
    seen = read_json(state / "threads.json", {})
    filed = 0
    for repo in THREAD_REPOS:
        owner, name = repo.split("/")
        for pr in gh_json(["pr", "list", "-R", repo, "--state", "open", "--json", "number,title,mergeStateStatus",
                           "--limit", "30"]) or []:
            if pr.get("mergeStateStatus") != "BLOCKED":
                continue
            d = gh_json(["api", "graphql", "-f", f"query={THREADS_Q}", "-F", f"o={owner}", "-F", f"r={name}",
                         "-F", f"n={pr['number']}"]) or {}
            nodes = (((d.get("data") or {}).get("repository") or {}).get("pullRequest") or {}).get(
                "reviewThreads", {}).get("nodes", [])
            open_t = [t for t in nodes if not t["isResolved"] and t["comments"]["nodes"]
                      and ((t["comments"]["nodes"][0].get("author") or {}).get("login") or "").lower() in BOT_AUTHORS]
            key = f"threads:{repo}#{pr['number']}"
            sig = hashlib.sha1("".join(sorted(t["id"] for t in open_t)).encode()).hexdigest()[:10]
            if not open_t or seen.get(key, {}).get("sig") == sig:
                continue
            body = [f"**Owner:** {OWNER}. {repo}#{pr['number']} is BLOCKED by unresolved bot review threads "
                    "(required conversation resolution), not by a missing approval.", ""]
            for t in open_t:
                body.append(f"- `{t['path']}:{t['line']}` thread `{t['id']}`: "
                            f"{t['comments']['nodes'][0]['body'][:400]}")
            body += ["", "Do: fix each real bug on the PR branch, reply with the commit, then resolve the thread "
                     "(GraphQL `resolveReviewThread`). If a finding is wrong, reply with the evidence and resolve."]
            ident = seen.get(key, {}).get("linear") if seen.get(key, {}).get("open", True) else None
            ident = ident or linear.find_by_label(key, open_only=True)
            if ident:
                try:
                    linear.comment(ident, "\n".join(body))
                except LinearIssueMissing:
                    print(f"prod-errors: threads {key}: stale Linear link {ident}; filing a fresh issue",
                          file=sys.stderr)
                    ident = None
            if not ident:
                ident = linear.create(f"[review threads] {repo}#{pr['number']} {pr['title']}"[:200],
                                      "\n".join(body), [key, "prod-error", "agent-ready"], 2)
            seen[key] = {"sig": sig, "linear": ident, "at": iso(now())}
            filed += 1
    write_json(state / "threads.json", seen)
    return {"threads-filed": filed}


def sweep(sentry: Sentry, linear: Linear, state: Path = STATE) -> dict:
    at = now()
    ledger = read_json(state / "ledger.json", {})
    inbox = sorted((state / "inbox").glob("*.json")) if (state / "inbox").exists() else []
    issues = {str(i["id"]): i for i in sentry.top_issues()}
    for f in inbox:
        sid = str(read_json(f, {}).get("issueId") or "")
        if sid and sid not in issues:
            issues[sid] = sentry.issue(sid)
    merges: list[dict] = []
    prs: list[dict] = []
    deferred = ""
    try:
        merges = gh_json(["pr", "list", "-R", REPO, "--state", "merged", "--limit", "60",
                          "--json", "number,mergedAt,title"]) or []
        prs = gh_json(["pr", "list", "-R", REPO, "--state", "all", "--search", "Sentry in:body", "--limit", "100",
                       "--json", "number,title,body,headRefName,mergedAt"]) or []
    except GhDeferred as exc:
        # Budget deferral (exit 75: 'retry later, not a verdict'): the Sentry sweep still runs, but
        # PR matching, claim expiry and the thread watch are SKIPPED -- with no PR list, 'no PR'
        # cannot be told from 'did not check', so advancing claims would file false escalations.
        deferred = str(exc)[:200]
        print(f"prod-errors: sweep deferred gh lists this tick ({deferred}); PR matching, claim expiry "
              "and thread watch skipped", file=sys.stderr)
    counts: dict[str, int] = {}
    groups: dict[tuple, str] = {}  # same project+title, no Linear link yet -> ONE rolled-up Linear issue
    totals: dict[tuple, int] = {}
    for i in issues.values():
        k = ((i.get("project") or {}).get("slug"), i.get("title"))
        totals[k] = totals.get(k, 0) + int(i.get("count") or 0)
    for issue in sorted(issues.values(), key=lambda i: -int(i.get("userCount") or 0)):
        key = ((issue.get("project") or {}).get("slug"), issue.get("title"))
        sid = str(issue["id"])
        roll = None if linked_linear(issue) else (ledger.get(sid) or {}).get("linear") or groups.get(key)
        r = handle_issue(issue, ledger, sentry, linear, merges, at, state, rollup=roll,
                         group_qualifies=totals[key] >= EVENT_THRESHOLD)
        if ledger.get(sid, {}).get("linear") and not linked_linear(issue):
            groups.setdefault(key, ledger[sid]["linear"])
        counts[r] = counts.get(r, 0) + 1
    if deferred:
        counts["deferred"] = deferred  # visible in the sweep result + heartbeat, never a failure exit
    else:
        stale = advance(ledger, linear, sentry, prs, at, state)
        if stale:
            counts["stale-link"] = stale  # visible in the sweep result + heartbeat, never silent
    write_json(state / "ledger.json", ledger)
    record_metrics(ledger, list(issues.values()), at, state)
    if not deferred:
        try:
            counts.update(bot_threads(linear, state))
        except Exception as e:  # never let the thread watcher break the Sentry sweep
            counts["threads-error"] = str(e)[:80]
    for f in inbox:
        f.unlink(missing_ok=True)
    return counts


def ci_main(linear: Linear, state: Path = STATE) -> dict:
    latest: dict[str, dict] = {}
    runs_by_wf: dict[str, list[dict]] = {}
    for wf in WORKFLOWS:
        try:
            runs = gh_json(["run", "list", "-R", REPO, "--branch", "main", "--workflow", wf, "--limit", "5",
                            "--json", "databaseId,workflowName,conclusion,status,event,createdAt,startedAt,headSha,url"]) or []
        except GhDeferred as exc:  # budget deferral: skip this tick visibly, never crash the watcher
            print(f"prod-errors: ci-main deferred this tick ({exc}); run watching skipped", file=sys.stderr)
            return {"deferred": str(exc)[:200]}
        runs_by_wf[wf] = runs
        done = [r for r in runs if r.get("status") == "completed"]
        if done:
            latest[wf] = done[0]
    seen = read_json(state / "ci-ledger.json", {})
    opened = 0
    for wf, runs in runs_by_wf.items():  # hang check: the newest run never finished in time
        key = f"ci:{hashlib.sha1(wf.encode()).hexdigest()[:10]}"
        entry = seen.setdefault(key, {"workflow": wf})
        newest = runs[0] if runs else None
        if newest and newest.get("status") != "completed":
            started = parse_ts(newest.get("startedAt") or newest.get("createdAt"))
            if (started and now() - started > RUN_TIMEOUT_S
                    and entry.get("hangRunId") != newest.get("databaseId")):
                entry["hangRunId"] = newest.get("databaseId")  # one hang alert per run, not per sweep
                alert("ci-hang", f"{wf}'s newest main run never finished within its timeout "
                      f"({RUN_TIMEOUT_S}s): {newest.get('url')}", False, linear, state)
    for wf, r in latest.items():
        key = f"ci:{hashlib.sha1(wf.encode()).hexdigest()[:10]}"
        entry = seen.setdefault(key, {"workflow": wf})
        if r["conclusion"] in ("failure", "timed_out", "startup_failure"):
            if entry.get("state") != "red":
                ident = linear.find_by_label(key, open_only=True) or linear.create(
                    f"[main red] {wf}", f"**Owner:** {OWNER}\nLatest main run failed: {r['url']}\n"
                    "Fix the real failure; do not loosen the gate. Closes when the next main run is green.",
                    [key, "prod-error", "ci-main", "agent-ready"], 2)
                entry.update(state="red", linear=ident, since=r["createdAt"])
                opened += 1
        elif r["conclusion"] == "success" and entry.get("state") == "red":
            if entry.get("linear"):
                try:
                    linear.set_state(entry["linear"], "completed")
                except LinearIssueMissing as exc:
                    print(f"prod-errors: ci {wf}: stale Linear link {entry['linear']} at green recovery ({exc}); "
                          "dropping the dead link", file=sys.stderr)
                    entry["linear"] = None  # the next red episode files a fresh issue
            entry.update(state="green")
        elif r["conclusion"] == "cancelled":
            # Concurrency supersession is normal: a newer main push started a newer run for a
            # different SHA, cancelling this one. Only a cancel with NO newer run (same newest
            # SHA) is a real hang -- and each distinct run counts once, not once per sweep.
            superseded = any(x is not r and x.get("headSha") and x.get("headSha") != r.get("headSha")
                             and str(x.get("createdAt") or "") > str(r.get("createdAt") or "")
                             for x in runs_by_wf[wf])
            if not superseded and entry.get("lastCancelId") != r.get("databaseId"):
                entry["lastCancelId"] = r.get("databaseId")
                entry["cancelStreak"] = entry.get("cancelStreak", 0) + 1
                if entry["cancelStreak"] == 3:
                    alert("ci-cancelled", f"{wf} cancelled 3x in a row on main with no newer run "
                          "superseding them; it never finishes.", False, linear, state)
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
    if "synthetic-loop" not in health:
        seen_alerts.pop("synthetic-loop", None)  # episode over: a NEW stuck synthetic must re-alert
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
        elif name == "synthetic-loop" and h.get("sentryId"):
            text += f" (Sentry {h['sentryId']})"  # per-episode fingerprint: each stuck synthetic re-alerts
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
