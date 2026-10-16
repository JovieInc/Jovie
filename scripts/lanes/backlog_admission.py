"""Canonical installed read adapters and non-authorizing Backlog evidence projection."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime
import hashlib
import base64
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import sys
import subprocess
import time
from types import SimpleNamespace
import zlib

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import execution_attempt

SCHEMA = "jovie.backlog-admission-observation/v1"
MAX_AGE_S = 60
ISSUE_OWNER = "Summer backlog governor / JOV-7073"
RUNTIME_OWNER = "Symphony admission owner / JOV-8022"
ATTEMPT_OWNER = "Symphony execution reentry owner / JOV-7089"
RESOURCE_OWNER = "Symphony capacity-before-lease owner / JOV-6030"
IDENTITY_FIELDS = ("id", "identifier", "state", "updatedAt", "priority")
RUNTIME_FIELDS = ("installedPath", "sourceHash", "policyHash", "releaseTree")
MAX_PAGES = 100
CONNECTIONS = {
    "labels": "id name",
    "comments": "id body createdAt user{id name}",
    "attachments": "id title url",
    "children": "id identifier state{name type}",
    "relations": "id type relatedIssue{id identifier}",
    "inverseRelations": "id type issue{id identifier}",
}
CORE = ("id identifier title description createdAt updatedAt priority archivedAt "
        "state{name type} assignee{id name} delegate{id name} parent{id identifier}")


class Unavailable(RuntimeError):
    """A named read boundary failed; never include transport secrets in its text."""


def _json_file(path, schema=None):
    value = json.loads(path.read_text())
    if not isinstance(value, dict) or schema and value.get("schema") != schema:
        raise Unavailable("canonical-file-schema:" + path.name)
    return value


def _fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _paged(fetch, *, limit=100, maximum=MAX_PAGES, recheck=True):
    """Read bounded REST pages, then detect insertions or edits of the first page.

    The caller retains the START timestamp. A later completion never freshens an
    earlier page. A full final page requires another page proving termination.
    """
    pages = []
    for number in range(1, maximum + 1):
        page = fetch(number)
        if not isinstance(page, list) or len(page) > limit:
            raise Unavailable("malformed-page")
        pages.append(page)
        if len(page) < limit:
            if recheck and _fingerprint(fetch(1)) != _fingerprint(pages[0]):
                raise Unavailable("paged-history-changed")
            return pages
    raise Unavailable("pagination-bound-exhausted")


def _dependency_ids(issue):
    # Linear stores prerequisite `blocks` edges on inverseRelations. Outgoing
    # blocked_by variants remain supported; an outgoing blocks edge is a child.
    outgoing = [r.get("relatedIssue", {}).get("id") for r in issue["relations"]["nodes"]
                if r.get("type") in {"blocked_by", "blockedBy"}]
    incoming = [r.get("issue", {}).get("id") for r in issue["inverseRelations"]["nodes"]
                if r.get("type") == "blocks"]
    if any(not isinstance(value, str) or not value for value in outgoing + incoming):
        raise Unavailable("dependency-identity-unreadable")
    return sorted(set(outgoing + incoming))


def _issue_digest(issue):
    value = dict(issue)
    for name in CONNECTIONS:
        connection = issue.get(name) or {}
        nodes = connection.get("nodes")
        if not isinstance(nodes, list) or (connection.get("pageInfo") or {}).get("hasNextPage") is not False:
            raise Unavailable("prepared-issue-connection-incomplete")
        value[name] = {"nodes": sorted(nodes, key=lambda row: row["id"])}
    return _fingerprint(value)


def _metadata_projection(issue):
    value = {key: issue.get(key) for key in ("id", "identifier", "title", "description", "createdAt", "updatedAt", "priority", "archivedAt", "state", "assignee", "delegate", "parent")}
    connection = issue.get("labels") or {}
    if not isinstance(connection.get("nodes"), list) or (connection.get("pageInfo") or {}).get("hasNextPage") is not False:
        raise Unavailable("global-cohort-labels-incomplete")
    value["labels"] = sorted(connection["nodes"], key=lambda row: row["id"])
    return value


def _metadata_digest(issue):
    return _fingerprint(_metadata_projection(issue))


def _as_native(lane, row):
    return lane.Issue(row["id"], row["identifier"], row.get("title") or "", row.get("description") or "",
                      row["priority"], row["createdAt"], [label["name"] for label in row["labels"]["nodes"]])


def _pr_digest(rows, *, raw=False):
    if raw:
        rows = [{"number": row["number"], "title": row.get("title"), "body": row.get("body"),
                 "headRefName": (row.get("head") or {}).get("ref"), "headRefOid": (row.get("head") or {}).get("sha"),
                 "baseRefName": (row.get("base") or {}).get("ref"), "baseRefOid": (row.get("base") or {}).get("sha"),
                 "labels": row.get("labels"), "isDraft": row.get("draft")} for row in rows]
    keys = ("number", "title", "body", "headRefName", "headRefOid", "baseRefName", "baseRefOid", "isDraft")
    return _fingerprint(sorted(({**{key: row.get(key) for key in keys},
                                "labels": sorted(label["name"] for label in row.get("labels") or [])}
                               for row in rows), key=lambda row: row["number"]))


class _NativeReads:
    """Existing authenticated transports, with GET/query-only bounded entrypoints.

    Native Linear quota accounting and token refresh remain its transport's
    responsibility. Neither claim.lock nor a provider seat is taken here.
    """
    def __init__(self, current, state):
        import lane_runner as lane
        if Path(lane.__file__).resolve() != current / "lane_runner.py":
            raise Unavailable("native-module-not-installed")
        self.lane, self.current, self.state = lane, current, state
        self.validate_runtime()
        self.host = lane.Host(state=state)
        self.linear = lane.Linear(self.host.linear_env)
        lane.load_github_env()
        self.canonical_main()

    def validate_runtime(self):
        manifest = _json_file(self.current / ".release.json", "jovie-lane-release-bundle/v1")
        if manifest.get("bundleDigest") != self.current.parent.parent.name:
            raise Unavailable("installed-release-bundle-mismatch")
        self.lane.lifecycle.validate_release(self.current.parent.parent, manifest)
        if getattr(self, "_main_sha", None) is not None:
            if not 0 <= time.time() - self._main_observed_at <= MAX_AGE_S:
                raise Unavailable("canonical-main-observation-stale")

    def canonical_main(self, *, revalidate=False):
        previous = getattr(self, "_main_sha", None)
        if previous is not None and not 0 <= time.time() - self._main_observed_at <= MAX_AGE_S:
            raise Unavailable("canonical-main-observation-stale")
        if previous is None or revalidate:
            started = time.time()
            value = self.gh("repos/JovieInc/Jovie/git/ref/heads/main")
            obj = value.get("object") if isinstance(value, dict) else None
            if (not isinstance(value, dict) or value.get("ref") != "refs/heads/main" or not isinstance(obj, dict) or obj.get("type") != "commit"
                    or not isinstance(obj.get("sha"), str) or not re.fullmatch(r"[a-f0-9]{40}", obj["sha"])):
                raise Unavailable("canonical-main-read-unavailable")
            if previous is not None and obj["sha"] != previous:
                raise Unavailable("canonical-main-changed")
            if previous is None:
                self._main_sha, self._main_observed_at = obj["sha"], started
        if not 0 <= time.time() - self._main_observed_at <= MAX_AGE_S:
            raise Unavailable("canonical-main-observation-stale")
        return self._main_sha

    def query(self, query, variables):
        if not self.linear.admit(1):
            raise Unavailable("linear-native-budget-held")
        value = self.linear.gql(query, variables)
        if not isinstance(value, dict) or value.get("errors"):
            raise Unavailable("linear-query-unreadable")
        return value.get("data", value)

    def issue(self, identity, *, full=True):
        nested = " ".join(name + "(first:50){pageInfo{hasNextPage endCursor} nodes{" + fields + "}}"
                          for name, fields in CONNECTIONS.items()) if full else ""
        row = self.query("query($id:String!){issue(id:$id){" + CORE + " " + nested + "}}", {"id": identity}).get("issue")
        if not isinstance(row, dict) or not row.get("id"):
            raise Unavailable("linear-issue-unreadable")
        if full:
            for name, fields in CONNECTIONS.items():
                nodes, cursor, seen = [], None, set()
                connection = row.get(name) or {}
                for _ in range(MAX_PAGES):
                    page, info = connection.get("nodes"), connection.get("pageInfo") or {}
                    if not isinstance(page, list) or len(page) > 50 or type(info.get("hasNextPage")) is not bool:
                        raise Unavailable("linear-connection-unreadable:" + name)
                    for node in page:
                        if not isinstance(node, dict) or not node.get("id") or node["id"] in seen:
                            raise Unavailable("linear-connection-duplicate-or-unreadable:" + name)
                        seen.add(node["id"])
                    nodes.extend(page)
                    if not info["hasNextPage"]:
                        row[name] = {"nodes": nodes, "pageInfo": {"hasNextPage": False}}
                        break
                    next_cursor = info.get("endCursor")
                    if not isinstance(next_cursor, str) or not next_cursor or next_cursor == cursor:
                        raise Unavailable("linear-cursor-unreadable:" + name)
                    cursor = next_cursor
                    if _ == MAX_PAGES - 1:
                        raise Unavailable("linear-pagination-bound:" + name)
                    value = self.query("query($id:String!,$after:String){issue(id:$id){updatedAt " + name
                                       + "(first:50,after:$after){pageInfo{hasNextPage endCursor} nodes{"
                                       + fields + "}}}}", {"id": row["id"], "after": cursor}).get("issue")
                    if not isinstance(value, dict) or value.get("updatedAt") != row.get("updatedAt"):
                        raise Unavailable("linear-issue-changed-during-pagination")
                    connection = value.get(name) or {}
                else:
                    raise Unavailable("linear-pagination-bound:" + name)
        return row

    def cohort(self):
        """Complete current urgent/P0 and ready High pool; never reclassify priority.

        High admission uses the existing agent-ready + dispatch-next designation,
        preserving the authorized compounding scope without a topical classifier.
        """
        filters = {"team": {"key": {"eq": "JOV"}}, "state": {"name": {"in": ["Backlog", "Todo"]}},
                   "or": [{"priority": {"eq": 1}},
                          {"and": [{"priority": {"eq": 2}}, {"labels": {"some": {"name": {"eq": "agent-ready"}}}},
                                   {"labels": {"some": {"name": {"eq": "dispatch-next"}}}}]},
                          {"labels": {"some": {"name": {"eq": "P0"}}}},
                          {"title": {"startsWith": "P0"}}, {"title": {"startsWith": "[P0]"}}]}
        nested = "labels(first:50){pageInfo{hasNextPage endCursor} nodes{id name}}"
        query = ("query($filter:IssueFilter!,$after:String){issues(first:50,after:$after,includeArchived:false,filter:$filter)"
                 "{pageInfo{hasNextPage endCursor} nodes{" + CORE + " " + nested + "}}}")
        rows, cursor, cursors, identities = [], None, set(), set()
        for _ in range(MAX_PAGES):
            value = self.query(query, {"filter": filters, "after": cursor}).get("issues") or {}
            page, info = value.get("nodes"), value.get("pageInfo") or {}
            if not isinstance(page, list) or len(page) > 50 or type(info.get("hasNextPage")) is not bool:
                raise Unavailable("global-cohort-page-unreadable")
            for row in page:
                if not isinstance(row, dict) or not row.get("id") or row["id"] in identities:
                    raise Unavailable("global-cohort-identity-unreadable")
                identities.add(row["id"])
                incomplete = False
                for name in ("labels",):
                    connection = row.get(name) or {}
                    if not isinstance(connection.get("nodes"), list) or type((connection.get("pageInfo") or {}).get("hasNextPage")) is not bool:
                        raise Unavailable("global-cohort-connection-unreadable")
                    incomplete |= connection["pageInfo"]["hasNextPage"]
                complete = self.issue(row["id"]) if incomplete else row
                _metadata_digest(complete)
                labels = {label["name"] for label in complete["labels"]["nodes"]}
                priority, title = complete.get("priority"), complete.get("title") or ""
                if not (priority == 1 or priority == 2 and {"agent-ready", "dispatch-next"} <= labels
                        or "P0" in labels or title.startswith(("P0", "[P0]"))):
                    raise Unavailable("global-cohort-scope-filter-unproven")
                rows.append(complete)
            if not info["hasNextPage"]:
                return sorted(rows, key=lambda row: row["id"])
            cursor = info.get("endCursor")
            if not isinstance(cursor, str) or not cursor or cursor in cursors:
                raise Unavailable("global-cohort-cursor-unreadable")
            cursors.add(cursor)
        raise Unavailable("global-cohort-pagination-bound")

    def pr_metadata(self):
        return _paged(lambda page: self.gh(f"repos/JovieInc/Jovie/pulls?state=open&per_page=100&page={page}"))

    def gh(self, endpoint):
        result = subprocess.run(["gh", "api", "-X", "GET", endpoint], capture_output=True, text=True, timeout=30)
        if result.returncode:
            raise Unavailable("github-read-unavailable")
        return json.loads(result.stdout)

    def _read_gh_command(self, command, *, timeout=30):
        if command[:3] != ["gh", "api", "graphql"]:
            # A legacy REST/file-cache fallback is not an inline scope witness.
            return SimpleNamespace(returncode=1, stdout="", stderr="scope-read-unavailable")
        return subprocess.run(command, capture_output=True, text=True, timeout=min(timeout, 30))

    def open_prs(self):
        proxy = SimpleNamespace(REPO_SLUG="JovieInc/Jovie", sh=self._read_gh_command)
        report = {}
        original_cache = self.lane.pr_events.pr_files_cache
        self.lane.pr_events.pr_files_cache = lambda node: None
        try:
            prs = self.lane.pr_events.open_prs_state(proxy, report)
        finally:
            self.lane.pr_events.pr_files_cache = original_cache
        if not isinstance(prs, list) or report.get("complete") is not True:
            raise Unavailable("native-open-pr-inventory-incomplete")
        for pr in prs:
            if pr.get("labelsComplete") is not True or pr.get("filesComplete") is not True:
                raise Unavailable("native-open-pr-scope-incomplete")
            # Inline exact head/base files are maintained scope evidence. A
            # legacy cached or REST fallback must never certify a negative.
            evidence = pr.get("inlineFilesEvidence")
            if pr.get("files") and not self.lane.pr_events._valid_target_file_evidence(evidence, "JovieInc/Jovie", time.time()):
                raise Unavailable("native-open-pr-inline-scope-unavailable:" + str(pr.get("number")))
        final = [row for page in self.pr_metadata() for row in page]
        if _pr_digest(final, raw=True) != _pr_digest(prs):
            raise Unavailable("github-open-pr-set-changed")
        return prs

    def history(self):
        endpoint = "repos/JovieInc/Jovie/commits/" + execution_attempt.GITHUB_LEDGER_ANCHOR + "/statuses?per_page=100"
        pages = execution_attempt._gh({}, "GET", endpoint)
        if (not isinstance(pages, list) or not 1 <= len(pages) <= MAX_PAGES
                or any(not isinstance(page, list) or len(page) > 100 for page in pages)):
            raise Unavailable("canonical-attempt-history-unbounded-or-unreadable")
        if _fingerprint(self.gh(endpoint + "&page=1")) != _fingerprint(pages[0]):
            raise Unavailable("paged-history-changed")
        return pages

    def ownership(self, issue):
        base = self.current.parent / "backlog-orchestrator"
        paths = [base / name for name in ("admission-disposition.mjs", "admission-policy.mjs",
                                         "ownership-inventory.mjs", "ownership-inventory.json")]
        if any(not path.is_file() or not path.resolve().is_relative_to(self.current.parent.parent) for path in paths):
            raise Unavailable("installed-custody-interpreter-unavailable")
        program = ("import {classifyAdmissionDisposition} from " + json.dumps(paths[0].as_uri()) + ";"
                   "import {isFounderSteeringAssignee} from " + json.dumps(paths[1].as_uri()) + ";"
                   "let input='';for await(const c of process.stdin)input+=c;const i=JSON.parse(input);"
                   "console.log(JSON.stringify({ownership:classifyAdmissionDisposition(i).ownership,"
                   "founder:isFounderSteeringAssignee(i),founderComments:(i.comments?.nodes||[])"
                   ".filter(c=>isFounderSteeringAssignee({assignee:c.user})).map(c=>c.id)}));")
        result = subprocess.run(["node", "--input-type=module", "-e", program], input=json.dumps(issue),
                                capture_output=True, text=True, timeout=15)
        if result.returncode:
            raise Unavailable("installed-custody-interpreter-failed")
        value = json.loads(result.stdout)
        if not isinstance(value.get("ownership"), dict) or type(value.get("founder")) is not bool:
            raise Unavailable("installed-custody-result-unreadable")
        return value

    def fleet_max_age(self):
        path = self.current.parent / "fleet-gate/scoped_admission.py"
        spec = importlib.util.spec_from_file_location("backlog_fleet_scoped_policy", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.MAX_AGE.total_seconds()

    def acceptance(self, issue):
        """Use an existing owner source-binding receipt; verify its actual merge.

        This proves only an implementation prerequisite, never deployment,
        dogfood or founder product acceptance. A generic Done/docs link cannot
        produce this evidence. Unknown contracts stay with their current owner.
        """
        ownership = self.ownership(issue)
        for comment in reversed(issue["comments"]["nodes"]):
            body = comment.get("body") or ""
            if comment["id"] not in ownership["founderComments"] or "source binding correction" not in body.lower():
                continue
            shas = set(re.findall(r"\b[a-f0-9]{40}\b", body))
            numbers = re.findall(r"https://github\.com/JovieInc/Jovie/pull/(\d+)\b", body)
            for number in dict.fromkeys(numbers):
                pr = self.gh(f"repos/JovieInc/Jovie/pulls/{number}")
                merge, head = pr.get("merge_commit_sha"), (pr.get("head") or {}).get("sha")
                if not pr.get("merged") or merge not in shas or head not in shas:
                    continue
                files = _paged(lambda page: self.gh(f"repos/JovieInc/Jovie/pulls/{number}/files?per_page=100&page={page}"), recheck=False)
                paths = [entry["filename"] for page in files for entry in page
                         if entry.get("filename") in body and Path(entry["filename"]).suffix in {".py", ".ts", ".tsx", ".mjs", ".swift"}]
                if not paths or all("/tests/" in path or path.endswith(".test.ts") for path in paths):
                    continue
                repo = self.host.repo
                source = subprocess.run(["git", "-C", str(repo), "rev-parse", "origin/main"], capture_output=True, text=True, timeout=10)
                source_sha = source.stdout.strip()
                ancestor = subprocess.run(["git", "-C", str(repo), "merge-base", "--is-ancestor", merge, source_sha], capture_output=True, timeout=10)
                if source.returncode or ancestor.returncode or not re.fullmatch(r"[a-f0-9]{40}", source_sha):
                    continue
                if source_sha != self.canonical_main():
                    raise Unavailable("local-origin-main-not-current-canonical")
                accepted_source = None
                for revision in sorted(shas - {merge, head}):
                    equal = True
                    for path in paths:
                        blobs = subprocess.run(["git", "-C", str(repo), "rev-parse", revision + ":" + path, source_sha + ":" + path],
                                               capture_output=True, text=True, timeout=10)
                        values = blobs.stdout.splitlines()
                        if blobs.returncode or len(values) != 2 or values[0] != values[1]:
                            equal = False
                            break
                    if equal:
                        accepted_source = revision
                        break
                if accepted_source is None:
                    continue
                return {"kind": "implemented-source", "mergeSha": merge, "sourceSha": source_sha, "paths": paths,
                        "receipt": "https://linear.app/jovie/issue/" + issue["identifier"] + "#comment-" + comment["id"]}
        return None


def _epoch(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value) if math.isfinite(value) else None
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed.timestamp() if parsed.tzinfo is not None else None
        except ValueError:
            pass
    return None


def _observation(identifier, holds, evidence=None):
    return {"schema": SCHEMA, "issue": identifier, "allowed": not holds,
            "authorizesTransition": False, "authorizesDispatch": False,
            "holds": holds, "evidence": evidence or {}}


def _hold(code, owner, evidence, next_action):
    return {"code": code, "owner": owner, "evidence": evidence,
            "nextAction": next_action}


def _bounded_attempt_receipt(value):
    # Same canonical URL-safe zlib/JSON representation, bounded before parsing.
    packed = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    inflater = zlib.decompressobj()
    raw = inflater.decompress(packed, 65537)
    if len(raw) > 65536 or inflater.unconsumed_tail or not inflater.eof or inflater.unused_data:
        raise ValueError("attempt-receipt-decoded-bound-or-incomplete")
    return json.loads(raw)


def _attempt_receipts(pages):
    receipts = {}
    for status in (status for page in pages for status in page):
        if not isinstance(status, dict): raise ValueError("malformed-status")
        context = status.get("context")
        if not isinstance(context, str): raise ValueError("malformed-context")
        if not context.startswith("jovie-execution/"): continue
        if not execution_attempt._trusted_creator(status.get("creator")): raise ValueError("untrusted-creator")
        target = status.get("target_url") or ""
        if not isinstance(target, str) or len(target) > 32768 or "#jovie-execution=" not in target: raise ValueError("missing-receipt")
        row = _bounded_attempt_receipt(target.split("#jovie-execution=", 1)[1])
        if (not isinstance(row, dict) or row.get("schema") != execution_attempt.SCHEMA
                or not isinstance(row.get("workKey"), str)
                or not re.fullmatch(r"[a-z][a-z0-9-]*:[a-f0-9]{64}", row["workKey"])
                or not isinstance(row.get("executionGeneration"), str)
                or not re.fullmatch(r"[a-f0-9]{64}", row["executionGeneration"])
                or row.get("identityDigest") != execution_attempt.digest({"workKey": row["workKey"], "generation": row["executionGeneration"]})
                or context != "jovie-execution/" + str(row.get("identityDigest"))):
            raise ValueError("receipt-context-mismatch")
        receipts.setdefault(row["workKey"], []).append({"statusId": status.get("id"), "identityDigest": row.get("identityDigest"),
                           "generation": row.get("executionGeneration"), "event": row.get("event"), "terminalState": row.get("terminalState")})
    return receipts


def project_backlog_admission(packet, *, now, canonical_state_path, _ordering_only=False):
    """Pure projection of a trusted collector's bound reads, including all attempts.

    ``allowed`` only means no hold was found in this observation. It is never a
    grant. The maintained writer still owns provenance validation, its exclusive
    fence and a fresh prewrite check. Caller-provided ``allowed``/reentry flags
    have no effect. Missing or malformed evidence cannot become runnable work.
    """
    holds = []
    packet = packet if isinstance(packet, dict) else {}
    issue = packet.get("issue")
    issue = issue if isinstance(issue, dict) else {}
    identifier = issue.get("identifier")
    def hold(code, owner, evidence, action):
        holds.append(_hold(code, owner, evidence, action))
    clock = _epoch(now)
    if clock is None:
        hold("clock-unavailable", RUNTIME_OWNER, "A finite current time is required.",
             "Re-observe the canonical host clock.")
        return _observation(identifier, holds)
    now = clock
    def fresh(row, name, owner):
        seen = _epoch(row.get("observedAt")) if isinstance(row, dict) else None
        if seen is None or not 0 <= now - seen <= MAX_AGE_S:
            hold(name + "-stale-or-unreadable", owner, {"observedAt": row.get("observedAt") if isinstance(row, dict) else None},
                 "Refresh this complete canonical read; do not extend its timestamp.")
            return False
        return True
    expected = packet.get("expected")
    if (not isinstance(expected, dict) or not all(issue.get(key) is not None and issue.get(key) == expected.get(key)
                                               for key in IDENTITY_FIELDS)):
        hold("issue-preimage-changed", ISSUE_OWNER, {key: issue.get(key) for key in IDENTITY_FIELDS},
             "Reassess the current issue identity, version and explicit priority.")
    fresh(issue, "issue", ISSUE_OWNER)
    allowed_states = {"Backlog": "backlog"}
    if _ordering_only:
        allowed_states["Todo"] = "unstarted"
    if (not isinstance(issue.get("id"), str) or not issue["id"] or not isinstance(identifier, str)
            or not re.fullmatch(r"JOV-\d+", identifier)
            or not isinstance(issue.get("state"), str) or issue["state"] not in allowed_states
            or allowed_states[issue["state"]] != issue.get("stateType") or not isinstance(issue.get("updatedAt"), str)
            or _epoch(issue.get("updatedAt")) is None or type(issue.get("priority")) is not int
            or issue["priority"] not in (1, 2, 3, 4) or issue.get("labelsComplete") is not True):
        hold("issue-not-a-complete-backlog-candidate", ISSUE_OWNER, "Identity/state/version/priority/labels must be complete.",
             "Refresh authoritative Linear data; retain the existing priority tier.")
    dependency_ids = issue.get("dependencyIds")
    deps = packet.get("dependencies")
    deps = deps if isinstance(deps, dict) else {}
    fresh(deps, "dependencies", ISSUE_OWNER)
    rows = deps.get("rows")
    if (not isinstance(dependency_ids, list) or any(not isinstance(value, str) for value in dependency_ids)
            or len(set(dependency_ids)) != len(dependency_ids) or deps.get("complete") is not True
            or deps.get("issueId") != issue.get("id") or deps.get("issueUpdatedAt") != issue.get("updatedAt")
            or not isinstance(rows, list) or any(not isinstance(row, dict) or not isinstance(row.get("id"), str) for row in rows)
            or sorted(row.get("id", "") for row in rows if isinstance(row, dict)) != sorted(dependency_ids)):
        hold("dependency-set-unproven", ISSUE_OWNER, "The complete fresh dependency set must match this issue version.",
             "Read every linked prerequisite and its acceptance through the existing owner.")
    else:
        for row in rows:
            fresh(row, "dependency:" + row["id"], ISSUE_OWNER)
            acceptance = row.get("sourceAcceptance")
            if row.get("state") != "Done" or row.get("stateType") != "completed":
                hold("dependency-not-fulfilled", row.get("owner") or ISSUE_OWNER, row["id"],
                     "The prerequisite owner must finish its actual acceptance contract.")
            elif (not isinstance(acceptance, dict) or acceptance.get("kind") != "implemented-source"
                    or not all(isinstance(acceptance.get(key), str) and re.fullmatch(r"[a-f0-9]{40}", acceptance[key])
                               for key in ("mergeSha", "sourceSha"))
                    or not isinstance(acceptance.get("paths"), list) or not acceptance["paths"]
                    or any(not isinstance(path, str) or not path for path in acceptance["paths"])
                    or not isinstance(acceptance.get("receipt"), str) or not acceptance["receipt"]):
                hold("dependency-acceptance-unproven", row.get("owner") or ISSUE_OWNER, row["id"],
                     "Bind the actual implementing merge and current source; Done or a docs merge alone is insufficient.")
    custody = packet.get("custody")
    custody = custody if isinstance(custody, dict) else {}
    fresh(custody, "custody", RUNTIME_OWNER)
    required_sources = {"linear-comments", "native-claims", "open-prs"}
    if (custody.get("complete") is not True or custody.get("issueId") != issue.get("id")
            or custody.get("issueUpdatedAt") != issue.get("updatedAt")
            or not isinstance(custody.get("sources"), list) or any(not isinstance(item, str) for item in custody["sources"])
            or set(custody["sources"]) != required_sources
            or not isinstance(custody.get("holders"), list) or not isinstance(custody.get("unknown"), list)):
        hold("accepted-custody-unproven", RUNTIME_OWNER, "Complete current and legacy custody is required.",
             "Use the incumbent ownership interpreter; never infer clearance from assignment or labels.")
    elif custody["holders"] or custody["unknown"]:
        hold("accepted-custody-held", RUNTIME_OWNER, {"holders": custody["holders"], "unknown": custody["unknown"]},
             "Preserve the incumbent owner and obtain its existing handoff/reentry evidence.")
    runtime = packet.get("runtime")
    runtime = runtime if isinstance(runtime, dict) else {}
    fresh(runtime, "runtime", RUNTIME_OWNER)
    expected_runtime = packet.get("expectedRuntime")
    canonical = str(canonical_state_path)
    installed = runtime.get("installedPath")
    if (not Path(canonical).is_absolute() or runtime.get("statePath") != canonical
            or not isinstance(installed, str) or not Path(installed).is_absolute() or ".." in Path(installed).parts
            or not Path(installed).is_relative_to(Path(canonical) / "releases")
            or len(Path(installed).relative_to(Path(canonical) / "releases").parts) != 3
            or Path(installed).parts[-2:] != ("scripts", "lanes")
            or not re.fullmatch(r"[a-f0-9]{64}", Path(installed).parts[-3])
            or not isinstance(expected_runtime, dict)
            or any(runtime.get(key) is None or runtime.get(key) != expected_runtime.get(key) for key in RUNTIME_FIELDS)
            or not all(isinstance(runtime.get(key), str) and re.fullmatch(rf"[a-f0-9]{{{length}}}", runtime[key])
                       for key, length in (("sourceHash", 64), ("policyHash", 64), ("releaseTree", 40)))
            or runtime.get("issueId") != issue.get("id") or runtime.get("issueUpdatedAt") != issue.get("updatedAt")):
        hold("installed-runtime-preimage-unproven", RUNTIME_OWNER, {"statePath": runtime.get("statePath"), "installedPath": installed},
             "Read actual canonical host state and installed source/policy; scratch LANES_STATE is not admission truth.")
    worker = runtime.get("worker")
    worker = worker if isinstance(worker, dict) else {}
    source_functions = worker.get("sourceFunctions")
    required_functions = {"admission_rejection", "pool_rejections", "held_back_issues", "in_flight_issues"}
    if (not isinstance(source_functions, list) or any(not isinstance(item, str) for item in source_functions)
            or set(source_functions) != required_functions
            or worker.get("sourceHash") != runtime.get("sourceHash") or not isinstance(worker.get("provider"), str)
            or any(key not in worker for key in ("rejection", "poolRejection", "heldBack", "inFlight", "claims"))
            or type(worker.get("heldBack")) is not bool or type(worker.get("inFlight")) is not bool
            or not isinstance(worker.get("claims"), list)
            or any(worker.get(key) is not None and not isinstance(worker.get(key), str) for key in ("rejection", "poolRejection"))):
        hold("native-worker-predicates-unavailable", RUNTIME_OWNER, "Installed predicate output and source binding are required.",
             "Run the existing installed predicates with complete fresh inputs; do not copy sensitivity/routing rules.")
    elif worker["rejection"] or worker["poolRejection"] or worker["heldBack"] or worker["inFlight"] or worker["claims"]:
        hold("native-worker-held", RUNTIME_OWNER, worker,
             "The named native hold owner must resolve the existing predicate; preserve its worker/PR/repair.")
    overlap = runtime.get("fileOverlap")
    if not isinstance(overlap, dict) or overlap.get("allowed") is not True or not isinstance(overlap.get("decisions"), list):
        hold("native-file-overlap-held-or-unknown", RUNTIME_OWNER, overlap,
             "Read and preserve the installed file_overlap.admission_policy decision; never turn an unknown preview into approval.")
    resources = runtime.get("resources")
    resources = resources if isinstance(resources, dict) else {}
    fresh(resources, "resources", RESOURCE_OWNER)
    if (resources.get("workAdmission") != "allowed" or resources.get("newIssueLease") != "allowed"
            or resources.get("budget") != "within-budget" or resources.get("disk") != "admitted"
            or resources.get("quota") != "available" or type(resources.get("intakeSlots")) is not int
            or type(resources.get("freeSlots")) is not int or resources["intakeSlots"] <= 0 or resources["freeSlots"] <= 0):
        hold("native-resource-held-or-unknown", RESOURCE_OWNER, resources,
             "Wait for existing event-driven capacity and re-observe typed work/resource gates; never raise capacity or budgets.")
    history = packet.get("attemptHistory")
    history = history if isinstance(history, dict) else {}
    fresh(history, "attempt-history", ATTEMPT_OWNER)
    pages = history.get("pages")
    if (history.get("repository") != "JovieInc/Jovie" or history.get("anchor") != execution_attempt.GITHUB_LEDGER_ANCHOR
            or history.get("complete") is not True or history.get("hasNextPage") is not False
            or not isinstance(pages, list) or not 1 <= len(pages) <= 100
            or any(not isinstance(page, list) or len(page) > 100 for page in pages)):
        hold("canonical-attempt-history-unavailable", ATTEMPT_OWNER, "Complete canonical anchor pagination is required.",
             "Read the canonical GitHub attempt anchor across every workKey generation; missing history is a hold.")
    else:
        work_key = execution_attempt.identity("linear-work", {"issue": identifier, "outcome": "draft-pr"}, {})["workKey"]
        prior = []
        try:
            prior = _attempt_receipts(pages).get(work_key, [])
            if prior:
                hold("existing-attempt-reentry-owner-hold", ATTEMPT_OWNER, prior,
                     "Use the existing certified reentry protocol. No new generation or caller flag grants reentry here.")
        except (ValueError, TypeError, KeyError, RuntimeError, zlib.error) as exc:
            hold("canonical-attempt-history-unreadable", ATTEMPT_OWNER, type(exc).__name__,
                 "Repair/read the authentic history; never treat a malformed or untrusted receipt as absent.")
    return _observation(identifier, holds, {"issueUpdatedAt": issue.get("updatedAt"),
                        "priority": issue.get("priority"), "installedPath": installed,
                        "sourceHash": runtime.get("sourceHash"), "policyHash": runtime.get("policyHash")})


