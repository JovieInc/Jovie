"""Pure, non-authorizing Backlog admission evidence projection."""
from __future__ import annotations
from datetime import datetime
import math
import hashlib
import json
from pathlib import Path
import re
import sys
import zlib
sys.path.insert(0,str(Path(__file__).resolve().parent))
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


class Unavailable(RuntimeError):
    """A named read boundary failed; never include transport secrets in its text."""


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


def _attempt_receipts(pages):
    receipts = {}
    for status in (status for page in pages for status in page):
        if not isinstance(status, dict): raise ValueError("malformed-status")
        context = status.get("context")
        if not isinstance(context, str): raise ValueError("malformed-context")
        if not context.startswith("jovie-execution/"): continue
        target = status.get("target_url") or ""
        if not isinstance(target, str) or len(target) > 32768 or "#jovie-execution=" not in target: raise ValueError("missing-receipt")
        row = execution_attempt._unpack(target.split("#jovie-execution=", 1)[1])
        if (not isinstance(row, dict) or row.get("schema") != execution_attempt.SCHEMA
                or not isinstance(row.get("workKey"), str)
                or not re.fullmatch(r"[a-z][a-z0-9-]*:[a-f0-9]{64}", row["workKey"])
                or not isinstance(row.get("executionGeneration"), str)
                or not re.fullmatch(r"[a-f0-9]{64}", row["executionGeneration"])
                or row.get("identityDigest") != execution_attempt.digest({"workKey": row["workKey"], "generation": row["executionGeneration"]})
                or context != "jovie-execution/" + str(row.get("identityDigest"))):
            raise ValueError("receipt-context-mismatch")
        if not execution_attempt._trusted_creator(status.get("creator")): raise ValueError("untrusted-creator")
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
    if (not isinstance(issue.get("id"), str) or not issue["id"] or not isinstance(identifier, str)
            or not re.fullmatch(r"JOV-\d+", identifier)
            or {"Backlog": "backlog", **({"Todo": "unstarted"} if _ordering_only else {})}.get(issue.get("state")) != issue.get("stateType") or not isinstance(issue.get("updatedAt"), str)
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
