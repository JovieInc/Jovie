"""Linear-side remediation intake filing (JOV-13077, Tim 2026-11-19: Linear is the single
source of truth for CI/ops failure intake).

Split from pr_events.py and remediation.py (size-500 budgets are shrink-only; extract a
module instead of raising one). One Linear issue per fingerprint — ensure_linear_intake
fences the create with a deterministic UUID — and a recurrence with new evidence updates
the same issue with one occurrence comment. No GitHub issue is ever created here: without
a Linear client the intake defers visibly and never falls back to `gh issue create`.
Legacy GitHub intake issues still convert once (pr_events.convert_intake).
"""
from __future__ import annotations

import hashlib
import os
import re
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import remediation  # noqa: E402  (event shapes, fingerprint, occurrence identity)

REPO = os.environ.get("GITHUB_REPOSITORY", "JovieInc/Jovie")

_UNSET = object()  # upsert_intake(linear=...) default: construct the client from the environment


def relay_linear_client():
    """The lane Linear client from this process's environment, or None when this context
    cannot file Linear (JOV-13077). The lane host keeps the app credential at the default
    path; the hosted relay gains one only when the workflow half exports LANES_LINEAR_APP_ENV.
    There is no GitHub-issue fallback: an unavailable client defers the intake visibly and
    the next derivation of the same fingerprint re-files it."""
    try:
        from lane_runner import Linear  # function-level: lane_runner imports this module
        return Linear()
    except Exception:  # noqa: BLE001 - no credential, no state dir or no module: defer
        return None


def upsert_intake(event: dict, sh=None, now: float | None = None, linear=_UNSET) -> str | None:
    """File the remediation intake on Linear now (JOV-13077). One Linear issue per
    fingerprint, and a recurrence with new evidence updates the same issue with one
    occurrence comment instead of filing again. Without a Linear client the intake defers
    visibly and never falls back to GitHub."""
    del sh, now  # call compatibility: the fingerprint is the only identity; no clock to race
    fingerprint = event.get("fingerprint")
    if not isinstance(fingerprint, str) or not re.fullmatch(r"[0-9a-f]+", fingerprint):
        return None
    if linear is _UNSET:
        linear = relay_linear_client()
    if linear is None:
        print(f"intake deferred: fingerprint {fingerprint} has no Linear client in this context "
              "(JOV-13077); nothing filed, no GitHub issue created", file=sys.stderr)
        return None
    try:
        team = linear_intake_team(linear)
        destination = intake_destination(team["id"], fingerprint)
        existing = linear_intake_issue(linear, team["id"], fingerprint, destination)
        if not existing:
            return ensure_linear_intake(linear, event) or None
        update_intake_recurrence(linear, existing, event)
        return existing
    except Exception as error:  # noqa: BLE001 - a cooled-down or erroring Linear defers visibly
        print(f"intake deferred: fingerprint {fingerprint} could not reach Linear "
              f"({type(error).__name__}: {error}); nothing filed, no GitHub issue created",
              file=sys.stderr)
        return None


def update_intake_recurrence(linear, issue_id: str, event: dict) -> None:
    """A repeated fingerprint updates its one Linear issue once per distinct occurrence
    (JOV-13077): identical evidence re-upserts silently, new evidence records one comment."""
    marker = f"<!-- {remediation.INTAKE_LABEL}-occurrence:{intake_occurrence(event)} -->"
    try:
        data = linear.gql('query($i:String!,$m:String!){issue(id:$i){comments(filter:{body:{contains:$m}},first:5){nodes{body}}}}',
                          {"i": issue_id, "m": marker})
        nodes = (((data or {}).get("issue") or {}).get("comments") or {}).get("nodes") or []
        if any(isinstance(note, dict) and marker in (note.get("body") or "") for note in nodes):
            return
        linear.gql('mutation($i:String!,$b:String!){commentCreate(input:{issueId:$i,body:$b}){success}}',
                   {"i": issue_id, "b": intake_recurrence_body(event)})
    except Exception as error:  # noqa: BLE001 - the issue exists; the next occurrence re-attempts
        print(f"intake recurrence deferred: issue {issue_id} could not record occurrence "
              f"({type(error).__name__}: {error})", file=sys.stderr)
        return


def intake_occurrence(event: dict) -> str:
    """Stable identity of one intake occurrence (JOV-13077): identical evidence updates the
    fingerprint's Linear issue once; new evidence (a new URL, a new failure description)
    records one more occurrence. first_seen is excluded on purpose — a re-derived incident
    (the reconcile sweep re-checks a live incident every pass) must not comment per pass."""
    evidence = event.get("evidence") or {}
    return remediation.fingerprint([event.get("source"), str(event.get("subject")), str(evidence.get("url") or ""),
                                    str(evidence.get("excerpt") or "")])


def intake_recurrence_body(event: dict) -> str:
    evidence = event.get("evidence") or {}
    return "\n".join([
        f"Symphony remediation intake recurred ({event.get('source')}).",
        f"Workstream: `ws:{event.get('ws')}`",
        f"Subject: `{event.get('subject')}`",
        f"Evidence: {evidence.get('url') or 'n/a'}",
        str(evidence.get("excerpt") or "")[:800],
        f"<!-- {remediation.INTAKE_LABEL}-occurrence:{intake_occurrence(event)} -->",
    ])


def linear_intake_team(linear) -> dict:
    """The JOV team node (id, states, labels) remediation intake files against."""
    return linear.gql('query{teams(filter:{key:{eq:"JOV"}}){nodes{id states{nodes{id name}} labels{nodes{id name}}}}}',
                      {})["teams"]["nodes"][0]


def intake_destination(team_id: str, fingerprint: str) -> str:
    """Linear accepts a client-supplied UUID v4. Its unique entity ID is the
    cross-host fence, including a committed create whose response was lost."""
    digest = hashlib.sha256(f"symphony-remediation:{REPO}:{team_id}:{fingerprint}".encode()).digest()
    return str(uuid.UUID(bytes=digest[:16], version=4))


def ensure_linear_intake(linear, event: dict) -> str | None:
    """Resolve authoritative history first; a stable destination fences racing creates."""
    fingerprint = event.get("fingerprint")
    if not isinstance(fingerprint, str) or not re.fullmatch(r"[0-9a-f]+", fingerprint):
        return None
    team = linear_intake_team(linear)
    issue_id = intake_destination(team["id"], fingerprint)
    existing = linear_intake_issue(linear, team["id"], fingerprint, issue_id)
    if existing:
        return existing
    names = {label["name"]: label["id"] for label in team["labels"]["nodes"]}
    wanted = remediation.intake_labels(str(event.get("ws") or "ci"))
    ids = []
    for name in wanted:
        if name in names:
            ids.append(names[name])
            continue
        if name != remediation.REMEDIATION_LABEL:
            continue
        created = linear.gql('mutation($n:String!,$t:String!){issueLabelCreate(input:{name:$n,teamId:$t}){issueLabel{id}}}',
                             {"n": name, "t": team["id"]})
        ids.append(created["issueLabelCreate"]["issueLabel"]["id"])
    todo = next(state["id"] for state in team["states"]["nodes"] if state["name"] == "Todo")
    plan = remediation.linear_intake_plan(event)
    try:
        data = linear.gql('mutation($i:IssueCreateInput!){issueCreate(input:$i){success issue{id}}}',
                          {"i": {"id": issue_id, "teamId": team["id"], "stateId": todo, "labelIds": ids,
                                 "title": plan["title"], "description": plan["description"] +
                                 f"\n<!-- symphony-remediation-repository:{REPO} -->"}})
        if data.get("issueCreate", {}).get("success") is True and data["issueCreate"]["issue"]["id"] == issue_id:
            return issue_id
    except Exception:
        pass  # No second mutation: a race or unknown result requires a fresh read.
    return linear_intake_issue(linear, team["id"], fingerprint, issue_id)


def linear_intake_issue(linear, team_id: str, fingerprint: str, issue_id: str) -> str | None:
    """Only a complete, bounded authoritative inventory can authorize creation."""
    marker = f"Fingerprint: `{fingerprint}`"
    query = ('query($filter:IssueFilter!,$after:String){issues(filter:$filter,includeArchived:true,first:100,after:$after)'
             '{nodes{id description createdAt} pageInfo{hasNextPage endCursor}}}')
    filters = {"team": {"id": {"eq": team_id}},
               "or": [{"id": {"eq": issue_id}}, {"description": {"contains": marker}}]}
    matches, cursors, after = [], set(), None
    for _ in range(10):
        page = linear.gql(query, {"filter": filters, "after": after})["issues"]
        nodes, info = page["nodes"], page["pageInfo"]
        if not isinstance(nodes, list) or not isinstance(info, dict):
            raise ValueError("intake-inventory-unreadable")
        for row in nodes:
            if not isinstance(row, dict) or not all(isinstance(row.get(key), str) and row[key]
                                                    for key in ("id", "description", "createdAt")):
                raise ValueError("intake-inventory-unreadable")
            stamp = remediation.iso_epoch(row["createdAt"])
            if stamp is None:
                raise ValueError("intake-inventory-unreadable")
            uuid.UUID(row["id"])
            # Intake files under its real source word (deploy, sentry, infra-incident, ...).
            # The destination fence is the fingerprint marker plus the repository marker,
            # not the source word.
            bound = re.match(r"Symphony remediation intake \([^)\n]*\)\.\n" + re.escape(marker) + r"\n",
                             row["description"]) is not None
            repository = re.search(r"<!-- symphony-remediation-repository:([^ ]+) -->", row["description"])
            bound = bound and (repository.group(1) == REPO if repository else REPO == "JovieInc/Jovie")
            if row["id"] == issue_id and not bound:
                raise ValueError("intake-destination-binding-mismatch")
            if bound:
                matches.append((stamp, row["id"]))
        if info.get("hasNextPage") is False:
            return min(matches)[1] if matches else None
        after = info.get("endCursor")
        if info.get("hasNextPage") is not True or not isinstance(after, str) or not after or after in cursors:
            raise ValueError("intake-inventory-incomplete")
        cursors.add(after)
    raise ValueError("intake-inventory-incomplete")
