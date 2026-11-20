"""No-abandonment adapters: the thin I/O halves of the PR-4b spec, DRY-RUN by default.

The WORKFLOW halves (Lane Fix Relay push-to-main step, main-CI workflow_run-completed verify step,
Remediation Sweep addition) are deliberately NOT wired here: scripts never edit .github/workflows, and
the wiring spec is posted on the PR for Eve Runtime Owner (Mac/gh). What lives here is what those
steps call — each bounded, each printing one JSON receipt line.

Linear I/O goes through the shared apiclient LinearClient (`ql.graphql(query, variables)`), using the
SAME LINEAR_API_KEY secret linear-sync-on-merge.yml already consumes: no new secret, and the
external-api guard keeps provider hosts inside scripts/apiclient. Writes stay off unless an owning
agent has read one dry-run receipt: NOABANDON_LINEAR_WRITES=true (or --write) turns them on; the
default prints the would-be mutation and mutates nothing.

Capacity math always counts against the VERIFIED 60 standard hosted jobs (2026-09-08 Team-plan
readback), never the HOSTED_RUNNER_CAPACITY=120 planning variable.
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from noabandon import invariant as I  # noqa: E402
from noabandon import ledger as L  # noqa: E402
from noabandon import route as R  # noqa: E402

# api-budget: github-user-core 10/hr - per event-driven wake (relay push-to-main or main-CI verify): one issue search, at most five lease-comment reads, one commits-pulls read
# api-budget: github-search 6/hr - one leased-PR search per relay wake plus one per shared-red pass, coalesced on the exact head
# api-budget: linear-requests 10/hr - fingerprint upsert, receipt comment and state move per item, write-mode only

VERIFIED_HOSTED_CAPACITY = 60
ABANDON_LABEL = "remediation:abandoned"
TEAM_KEY = "JOV"

FIND_TEAM = ("query($key:String!,$label:String!){team(key:$key){id "
             "labels(first:1,filter:{name:{eq:$label}}){nodes{id}}}}")
FIND_ISSUE = ("query($team:String!,$title:String!){issues(first:1,"
              "filter:{team:{key:{eq:$team}},title:{eq:$title}}){nodes{id identifier title}}}")
ISSUE_BY_ID = "query($id:String!){issue(id:$id){id identifier state{name}}}"
CREATE_ISSUE = ("mutation($team:String!,$title:String!,$desc:String!,$labels:[String!]){issueCreate("
                "input:{teamId:$team,title:$title,description:$desc,labelIds:$labels})"
                "{issue{id identifier title}}}")
COMMENT = "mutation($id:String!,$body:String!){commentCreate(input:{issueId:$id,body:$body}){success}}"
TEAM_STATES = "query($key:String!){team(key:$key){states(first:50){nodes{id name type}}}}"
UPDATE_ISSUE_STATE = ("mutation($id:String!,$state:String!){issueUpdate("
                         "input:{id:$id,stateId:$state}){issue{id identifier}}}")
UPDATE_ISSUE_CLEAR = ("mutation($id:String!,$state:String!){issueUpdate("
                        "input:{id:$id,stateId:$state,assigneeId:null}){issue{id identifier}}}")


def writes_enabled() -> bool:
    """Dry-run is the default; an owning agent flips this only after reading one dry-run receipt."""
    return os.environ.get("NOABANDON_LINEAR_WRITES") == "true"


def _receipt(kind: str, **fields) -> dict:
    out = {"schema": "noabandon.adapter-receipt/v1", "kind": kind,
           "dry_run": not writes_enabled(), **fields}
    print(json.dumps(out, sort_keys=True))
    return out


def upsert_fingerprint(ql, title: str, body: str, *, label: str = ABANDON_LABEL, dry_run: bool | None = None,
                       team_key: str = TEAM_KEY) -> dict:
    """One fingerprinted issue: find-or-create by exact title, then append the body as a comment."""
    if dry_run is None:
        dry_run = not writes_enabled()
    if dry_run:
        return _receipt("upsert", title=title, action="dry-run", dry_run=True)
    team = ql.graphql(FIND_TEAM, {"key": team_key, "label": label}) or {}
    team_id = (team.get("team") or {}).get("id")
    if not team_id:
        return _receipt("upsert", title=title, action="error:no-team", dry_run=dry_run)
    label_ids = [n["id"] for n in (((team.get("team") or {}).get("labels") or {}).get("nodes") or [])]
    found = ql.graphql(FIND_ISSUE, {"team": team_key, "title": title}) or {}
    nodes = ((found.get("issues") or {}).get("nodes")) or []
    if nodes:
        issue = nodes[0]
        action = "commented"
    else:
        issue = ((ql.graphql(CREATE_ISSUE, {"team": team_id, "title": title, "desc": body,
                                            "labels": label_ids}) or {}).get("issueCreate") or {}).get("issue")
        if not issue:
            return _receipt("upsert", title=title, action="error:not-created", dry_run=dry_run)
        action = "created"
    ok = ((ql.graphql(COMMENT, {"id": issue["id"], "body": body[:12000]}) or {}).get("commentCreate") or {})
    return _receipt("upsert", title=title, action=action if ok.get("success") else "error:comment-failed",
                    issue=issue.get("identifier"), dry_run=dry_run)


def _leased_prs(gh, repo: str, per_page: int) -> list[dict]:
    q = f"repo:{repo}+is:pr+is:open+label:{R.LEASE_LABEL}"
    found = R._json(gh, ["api", f"search/issues?q={q}&per_page={per_page}&sort=created&order=asc"], {})
    return list((found.get("items") or []))[:per_page]


def check_leased(gh, ql, repo: str, now: float | None = None, limit: int = 5,
                 dry_run: bool | None = None) -> list[dict]:
    """Relay push-to-main step (PR-4b item 1): the `limit` oldest leased open PRs -> abandon upserts."""
    now = time.time() if now is None else now
    findings = []
    for entry in _leased_prs(gh, repo, limit):
        pr = entry.get("number")
        _, lease = R.find_lease(gh, repo, pr)
        if not lease:
            continue
        item = lease.get("item") if R.ITEM_KEY.fullmatch(lease.get("item") or "") else R.item_key(entry.get("title", ""))
        if not item:
            continue
        finding = I.check_item({"item": item, "pr": pr, "state": "open", "lease": lease, "labels": ()}, now)
        if finding:
            findings.append(finding)
    return [upsert_fingerprint(ql, f["fingerprint"], json.dumps(f, indent=1, sort_keys=True), dry_run=dry_run)
            for f in findings]


def shared_red_check(gh, ql, repo: str, per_page: int = 30, dry_run: bool | None = None) -> list[dict]:
    """Relay push-to-main step (PR-4b item 1b): >=3 leased PRs sharing a red signature -> one fixer."""
    red_by_pr: dict[int, list] = {}
    for entry in _leased_prs(gh, repo, per_page):
        pr = entry.get("number")
        _, lease = R.find_lease(gh, repo, pr)
        if not lease:
            continue
        sigs = {r.get("sig") for r in lease.get("attempts") or [] if r.get("outcome") == "red"}
        sigs |= {f.get("sig") for f in (lease.get("handoff") or {}).get("failing") or [] if f.get("sig")}
        if sigs:
            red_by_pr[pr] = sorted(sigs)
    out = []
    for sig, prs in L.shared_red(red_by_pr).items():
        body = json.dumps({"schema": "noabandon.shared-red/v1", "sig": sig, "prs": prs,
                           "lease_to": "main-red lane", "capacity": VERIFIED_HOSTED_CAPACITY}, sort_keys=True)
        out.append(upsert_fingerprint(ql, f"shared-red:{sig}", body, dry_run=dry_run))
    return out


def verify_from_merge(gh, ql, repo: str, sha: str, main_ci: str, dry_run: bool | None = None) -> dict:
    """Main-CI workflow_run step (PR-4b item 2): the only way an item leaves Validating."""
    if dry_run is None:
        dry_run = not writes_enabled()
    prs = R._json(gh, ["api", f"repos/{repo}/commits/{sha}/pulls"], [])
    pr = prs[0] if prs else None
    if not pr:
        return _receipt("verify", merge_sha=sha, main_ci=main_ci, action="no-pr", dry_run=dry_run)
    item = R.item_key(pr.get("title", ""))
    receipt = I.verify(sha, main_ci, pr.get("number"), item)
    if dry_run:
        return _receipt("verify", merge_sha=sha, main_ci=main_ci, action="dry-run", dry_run=True,
                         verify=receipt)
    if not item:
        return _receipt("verify", merge_sha=sha, main_ci=main_ci, action="no-item", dry_run=False,
                         verify=receipt)
    upsert_fingerprint(ql, f"verify:{item}:{sha}", json.dumps(receipt, sort_keys=True), dry_run=False)
    return _receipt("verify", merge_sha=sha, main_ci=main_ci, action="receipt-posted", dry_run=False,
                    to=receipt["next"], verify=receipt)


def sweep_reconcile(ql, rows: list[dict], now: float | None = None, dry_run: bool | None = None) -> list[dict]:
    """Remediation Sweep step (PR-4b item 3): reconcile Validating / Merging / In Progress.

    `rows` are assembled by the sweep step from Linear + the PR attachments:
    [{issue: {id, state, progress_at, labels}, pr: {state, merge_sha, main_ci} | None}].
    progress_at MUST be the last PR push / merge / receipt, never updatedAt.
    """
    now = time.time() if now is None else now
    if dry_run is None:
        dry_run = not writes_enabled()
    out = []
    for row in rows:
        plan = I.reconcile_linear(row.get("issue") or {}, row.get("pr"), now)
        if not plan:
            continue
        if dry_run:
            out.append(_receipt("sweep", item=(row.get("issue") or {}).get("id"), to=plan.get("to"),
                                why=plan.get("why"), action="dry-run", dry_run=True))
            continue
        issue = ql.graphql(ISSUE_BY_ID, {"id": row["issue"]["id"]}) or {}
        uuid = (issue.get("issue") or {}).get("id")
        if not uuid:
            out.append(_receipt("sweep", item=row["issue"]["id"], to=plan.get("to"), action="error:no-issue",
                                dry_run=False))
            continue
        states = ql.graphql(TEAM_STATES, {"key": TEAM_KEY}) or {}
        state_id = next((n["id"] for n in (((states.get("team") or {}).get("states") or {}).get("nodes") or [])
                         if n.get("name") == plan.get("to")), None)
        if state_id:
            mutation = UPDATE_ISSUE_CLEAR if plan.get("clear_assignee") else UPDATE_ISSUE_STATE
            ql.graphql(mutation, {"id": uuid, "state": state_id})
        ql.graphql(COMMENT, {"id": uuid, "body": f"noabandon reconcile: {plan.get('to')} — {plan.get('why')}"})
        out.append(_receipt("sweep", item=row["issue"]["id"], to=plan.get("to"), why=plan.get("why"),
                            action="moved", dry_run=False, clear_assignee=bool(plan.get("clear_assignee"))))
    return out


def _linear_client():  # pragma: no cover - transport only, exercised by the runtime owner
    from apiclient import LinearClient
    key = os.environ.get("LINEAR_API_KEY")
    if not key:
        raise SystemExit("noabandon: LINEAR_API_KEY not set (existing linear-sync-on-merge secret)")
    return LinearClient(key, lambda rejected=None: key)


def main() -> int:
    """CLI for the future workflow steps (they pass --repo/--sha/--main-ci from the event)."""
    if os.environ.get("NOABANDON_ENABLED") != "true":
        print("noabandon: disabled (NOABANDON_ENABLED != true)")
        return 0
    args = sys.argv[1:]
    write = "--write" in args
    if write:
        os.environ["NOABANDON_LINEAR_WRITES"] = "true"
    repo = os.environ.get("GITHUB_REPOSITORY", "JovieInc/Jovie")
    ql = _linear_client()
    dry_run = None if write else True
    if "--check-leased" in args:
        check_leased(R.budgeted_gh, ql, repo, dry_run=dry_run)
    if "--shared-red" in args:
        shared_red_check(R.budgeted_gh, ql, repo, dry_run=dry_run)
    if "--verify" in args:
        sha = os.environ.get("MERGE_SHA", "")
        main_ci = os.environ.get("MAIN_CI", "")
        if sha and main_ci:
            verify_from_merge(R.budgeted_gh, ql, repo, sha, main_ci, dry_run=dry_run)
    if "--sweep" in args:
        rows = json.loads(os.environ.get("NOABANDON_SWEEP_ROWS", "[]"))
        sweep_reconcile(ql, rows, dry_run=dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
