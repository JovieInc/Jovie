"""Receipt-first company shipping attribution.

GitHub proves what merged.  The canonical lanes ledger proves how work started and
which later agents reviewed, repaired, or finalized it.  This module joins those
authorities by repository, PR number, and exact head SHA; branch names and PR prose
are never origin evidence.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import fcntl
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.parse import quote

ATTRIBUTION_SCHEMA = "jovie-company-shipping-attribution/v1"
ORIGIN_RECEIPT_SCHEMA = "jovie-shipping-origin/v1"
LANE_RECEIPT_SCHEMA = "jovie-lane-run/v1"
SHA = re.compile(r"^[0-9a-f]{40}$")
METHODS = frozenset({
    "dependabot",
    "founder-operated-chatgpt",
    "founder-operated-claude",
    "founder-operated-codex",
    "founder-operated-unknown-provider",
    "grokbot",
    "independent-agent",
    "independent-hyperagent",
    "other-automation",
    "symphony",
    "unknown",
})
SYMPHONY_PROVIDERS = frozenset({"claude", "codex", "devin", "hyperagent"})
PROJECTS = (
    {"channel": "Jovie", "repository": "JovieInc/Jovie", "instrumented": True},
    {"channel": "LogYourBody", "repository": "JovieInc/LogYourBody", "instrumented": True},
)
# Pull and git-ref reads lag a force-push. Run 38952636890 logged the push of
# 1d86ad82 at 19:26:58Z, failed the head check at 19:27:00Z, and the pull's
# updated_at reached that SHA at 19:27:23Z. Wait that window out, then still
# reject a head that never converges. Delays are the sleeps between reads.
ORIGIN_HEAD_READ_ATTEMPTS = 8
ORIGIN_HEAD_RETRY_DELAYS = (2, 4, 8, 8, 8, 8, 8)


def _object(value):
    return value if isinstance(value, dict) else {}


def _timestamp(value):
    if not isinstance(value, str):
        return None
    try:
        stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return stamp.timestamp() if stamp.tzinfo else None


def _iso(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_ledger(path: Path) -> dict:
    """Read the existing append-only ledger and expose corruption as evidence state."""
    rows, corrupt, latest = [], 0, None
    try:
        with Path(path).open() as handle:
            for raw in handle:
                if not raw.strip():
                    continue
                try:
                    row = json.loads(raw)
                except (TypeError, ValueError):
                    corrupt += 1
                    continue
                if not isinstance(row, dict):
                    corrupt += 1
                    continue
                rows.append(row)
                for key in ("recordedAt", "endedAt", "startedAt", "at"):
                    seen = _timestamp(row.get(key))
                    if seen is not None:
                        latest = max(latest or seen, seen)
                        break
    except OSError:
        return {"complete": False, "reason": "receipt-ledger-unreadable", "corruptRows": 0,
                "observedAt": None, "rows": []}
    return {"complete": corrupt == 0, "reason": "corrupt-receipts" if corrupt else None,
            "corruptRows": corrupt, "observedAt": _iso(latest) if latest is not None else None,
            "rows": rows}


def _repository(row: dict) -> str | None:
    repository = row.get("repository")
    if isinstance(repository, str) and re.fullmatch(r"[\w.-]+/[\w.-]+", repository):
        return repository
    # The legacy Jovie lane receipt schema predated repository bindings.  Its producer is
    # hard-bound to JovieInc/Jovie; binding receipts always carry their repository.
    if row.get("schema") == LANE_RECEIPT_SCHEMA and not row.get("binding"):
        return "JovieInc/Jovie"
    return None


def _attempt(row: dict):
    attempt = _object(row.get("execution")).get("attempt")
    return attempt if type(attempt) is int and attempt > 0 else None


def _source_origin(row: dict, repository: str, pr: dict) -> tuple[dict | None, str | None]:
    if row.get("schema") != ORIGIN_RECEIPT_SCHEMA or row.get("role") != "origin":
        return None, None
    if row.get("repository") != repository or row.get("pr") != pr["number"]:
        return None, None
    method, head = row.get("method"), row.get("headSha")
    required = (isinstance(row.get("receiptId"), str) and row["receiptId"]
                and isinstance(row.get("initiator"), str) and row["initiator"]
                and _timestamp(row.get("recordedAt")) is not None)
    if method not in METHODS - {"unknown"} or not required or not SHA.fullmatch(str(head or "")):
        return None, "malformed-origin-receipt"
    if head != pr.get("headRefOid"):
        return None, "origin-receipt-head-mismatch"
    return {
        "method": method, "provider": row.get("provider"), "model": row.get("model"),
        "initiator": row["initiator"], "executionHost": row.get("executionHost"),
        "runId": row.get("runId"), "attempt": row.get("attempt"),
        "linearIssue": row.get("linearIssue"), "headSha": head,
        "receiptSchema": ORIGIN_RECEIPT_SCHEMA, "receiptId": row["receiptId"],
        "evidenceUrl": row.get("evidenceUrl"), "confidence": "verified",
    }, None


def _lane_origin(row: dict, repository: str, pr: dict) -> tuple[dict | None, str | None]:
    if row.get("schema") != LANE_RECEIPT_SCHEMA or row.get("pr") != pr["number"]:
        return None, None
    kind = row.get("kind") or "issue"
    attribution = _object(row.get("attribution"))
    category = attribution.get("category")
    if kind not in {"issue", "binding-issue"} or not row.get("issue"):
        return None, None
    # Legacy canonical lane receipts predate the explicit attribution category. Their
    # schema/origin/issue/run/provider plus exact immutable head are still origin proof.
    if row.get("origin") != "autonomous-lane" or category not in {
        None, "autonomous-created", "cross-provider-handoff",
    }:
        return None, "malformed-lane-origin-receipt"
    provider, head = row.get("provider"), row.get("headSha")
    if (_repository(row) != repository or provider not in SYMPHONY_PROVIDERS
            or not isinstance(row.get("runId"), str) or not row["runId"]
            or not SHA.fullmatch(str(head or ""))):
        return None, "malformed-lane-origin-receipt"
    if head != pr.get("headRefOid"):
        return None, "origin-receipt-head-mismatch"
    final = attribution.get("finalProvider") or row.get("finishedBy") or provider
    return {
        "method": "symphony", "provider": provider, "model": row.get("model"),
        "initiator": "symphony", "executionHost": row.get("executionHost"),
        "runId": row["runId"], "attempt": _attempt(row), "linearIssue": row.get("issue"),
        "headSha": head, "receiptSchema": LANE_RECEIPT_SCHEMA,
        "receiptId": row["runId"], "evidenceUrl": row.get("prUrl"),
        "finalizingProvider": final if final != provider else None, "confidence": "verified",
    }, None


def _candidate(pr: dict) -> tuple[str, list[str]]:
    author = _object(pr.get("author"))
    login = str(author.get("login") or "").lower()
    if login == "itstimwhite":
        return "founder-operated-unknown-provider", ["github-pr-author-only"]
    if login in {"dependabot", "dependabot[bot]"}:
        return "dependabot", ["github-pr-author-only"]
    if "grok" in login and (login.endswith("[bot]") or login.endswith("bot")):
        return "grokbot", ["github-pr-author-only"]
    if login.endswith("[bot]") or login.endswith("bot"):
        return "other-automation", ["github-pr-author-only"]
    return "unknown", []


def _contributions(pr: dict, receipts: list[dict], repository: str) -> list[dict]:
    values = {}
    for row in receipts:
        if row.get("schema") != LANE_RECEIPT_SCHEMA or row.get("pr") != pr["number"]:
            continue
        if _repository(row) != repository:
            continue
        attribution = _object(row.get("attribution"))
        category = attribution.get("category")
        kind = row.get("kind") or "issue"
        if category == "review-only" or kind == "adopt":
            role = "review"
        elif category == "autonomous-remediation" or kind in {"binding-repair", "fix-red"}:
            role = "remediation"
        elif category == "finalizer-only" or kind in {"ready-green", "sync-main", "terminal-revisit"}:
            role = "finalizing"
        elif category == "cross-provider-handoff":
            role = "handoff"
        else:
            continue
        provider = row.get("provider") or attribution.get("provider")
        head_after = row.get("headAfter") or row.get("headSha")
        item = {
            "role": role, "provider": provider, "model": row.get("model"),
            "runId": row.get("runId"), "attempt": _attempt(row),
            "executionHost": row.get("executionHost"), "headBefore": row.get("headBefore"),
            "headAfter": head_after, "exactFinalHead": head_after == pr.get("headRefOid"),
        }
        key = (role, provider, item["model"], item["runId"], item["attempt"],
               item["headBefore"], head_after)
        values[key] = item
    return sorted(values.values(), key=lambda row: tuple(str(row.get(k) or "")
                                                         for k in ("role", "provider", "runId", "headAfter")))


def attribute_pr(pr: dict, receipts: list[dict], repository: str) -> dict:
    """Return one primary origin plus separate, deduplicated contributor roles."""
    exact, invalid = [], []
    for row in receipts:
        origin, error = _source_origin(row, repository, pr)
        if origin is None and error is None:
            origin, error = _lane_origin(row, repository, pr)
        if origin:
            exact.append(origin)
        elif error:
            invalid.append({"reason": error, "receiptId": row.get("receiptId") or row.get("runId"),
                            "method": row.get("method") or
                            ("symphony" if row.get("schema") == LANE_RECEIPT_SCHEMA else None)})
    signatures = {(row["method"], row.get("provider"), row.get("model"), row.get("initiator"),
                   row.get("runId")) for row in exact}
    if len(signatures) == 1:
        origin = sorted(exact, key=lambda row: str(row.get("receiptId")))[0]
    elif exact:
        origin = {"method": "unknown", "provider": None, "model": None, "initiator": None,
                  "executionHost": None, "runId": None, "attempt": None, "linearIssue": None,
                  "headSha": pr.get("headRefOid"), "receiptSchema": None, "receiptId": None,
                  "evidenceUrl": None, "confidence": "unknown"}
        invalid.append({"reason": "conflicting-exact-origin-receipts", "receiptId": None, "method": None})
    else:
        inferred = {row["method"] for row in invalid if row.get("method") in METHODS - {"unknown"}}
        method, reasons = _candidate(pr)
        if len(inferred) == 1:
            method, reasons = inferred.pop(), sorted({row["reason"] for row in invalid})
        elif len(inferred) > 1:
            method, reasons = "unknown", ["conflicting-inexact-origin-receipts"]
        origin = {"method": method, "provider": None, "model": None, "initiator": None,
                  "executionHost": None, "runId": None, "attempt": None, "linearIssue": None,
                  "headSha": pr.get("headRefOid"), "receiptSchema": None, "receiptId": None,
                  "evidenceUrl": None, "confidence": "inferred" if method != "unknown" else "unknown",
                  "inferenceReasons": reasons}
    contributions = _contributions(pr, receipts, repository)
    merge_commit = _object(pr.get("mergeCommit"))
    author, merger = _object(pr.get("author")), _object(pr.get("mergedBy"))
    return {
        "repository": repository, "prNumber": pr["number"],
        "prUrl": pr.get("url") or f"https://github.com/{repository}/pull/{pr['number']}",
        "title": pr.get("title"), "headSha": pr.get("headRefOid"),
        "mergeCommitSha": merge_commit.get("oid"), "mergedAt": pr.get("mergedAt"),
        "createdAt": pr.get("createdAt"), "prAuthor": author.get("login"),
        "mergeActor": merger.get("login"), "origin": origin,
        "contributions": contributions, "evidenceErrors": invalid,
    }


def project_report(project: dict, evidence: dict, ledger: dict, generated_at: float) -> dict:
    repository, instrumented = project["repository"], project["instrumented"]
    window = evidence.get("window") if isinstance(evidence, dict) else None
    complete = isinstance(evidence, dict) and evidence.get("complete") is True
    rows = [attribute_pr(pr, ledger.get("rows") or [], repository) for pr in evidence.get("prs") or []] \
        if complete and instrumented else []
    if complete and instrumented:
        by_confidence = Counter(row["origin"]["confidence"] for row in rows)
        by_method = Counter(row["origin"]["method"] for row in rows)
        denominator, verified = len(rows), by_confidence["verified"]
        coverage = {"numerator": verified, "denominator": denominator,
                    "percent": round(100 * verified / denominator, 1) if denominator else None}
        missing = [row["prUrl"] for row in rows if row["origin"]["confidence"] != "verified"]
        remediation = {row["prNumber"] for row in rows
                       if any(item["role"] == "remediation" for item in row["contributions"])}
        handoffs = {row["prNumber"] for row in rows
                    if row["origin"].get("finalizingProvider") or
                    any(item["role"] == "handoff" for item in row["contributions"])}
    else:
        by_confidence, by_method, denominator, coverage, missing = Counter(), Counter(), None, None, None
        remediation, handoffs = set(), set()
    until = (window or {}).get("until")
    age = generated_at - until if isinstance(until, (int, float)) and math.isfinite(until) else None
    historical = age is not None and age > 36 * 3600
    remote_ingest = ledger.get("remoteIngest")
    ingest_complete = not (isinstance(remote_ingest, dict) and remote_ingest.get("errors"))
    return {
        "channel": project["channel"], "repository": repository, "instrumented": instrumented,
        "window": {"since": (window or {}).get("since"), "until": until, "halfOpen": True},
        "denominatorComplete": complete, "incompleteReason": None if complete else
        (evidence.get("reason") if isinstance(evidence, dict) else "merge-window-not-read"),
        "attributionEvidenceComplete": complete and instrumented and ledger.get("complete") is True and ingest_complete,
        "mergeCount": denominator,
        "coverage": coverage,
        "byConfidence": dict(sorted(by_confidence.items())) if complete and instrumented else None,
        "byShippingMethod": dict(sorted(by_method.items())) if complete and instrumented else None,
        "unknownCount": by_confidence["unknown"] if complete and instrumented else None,
        "inferredCount": by_confidence["inferred"] if complete and instrumented else None,
        "missingOriginReceiptPullRequests": missing,
        "work": {"initiatedPullRequests": denominator,
                 "remediationPullRequests": len(remediation) if denominator is not None else None,
                 "handoffPullRequests": len(handoffs) if denominator is not None else None},
        "freshness": {"status": "historical" if historical else "fresh" if age is not None and age <= 600 else "stale",
                      "ageSeconds": round(max(0, age), 3) if age is not None else None,
                      "ledgerObservedAt": ledger.get("observedAt")},
        "receiptStream": {k: ledger.get(k) for k in ("complete", "reason", "corruptRows")},
        "remoteIngest": remote_ingest,
        "pullRequests": rows,
    }


def company_report(evidence_by_repository: dict, ledger: dict, generated_at: float) -> dict:
    projects = [project_report(project, evidence_by_repository.get(project["repository"]) or {}, ledger,
                               generated_at) for project in PROJECTS]
    complete = all(row["attributionEvidenceComplete"] for row in projects)
    denominators = [row["mergeCount"] for row in projects]
    total = sum(denominators) if complete and all(value is not None for value in denominators) else None
    return {"schema": ATTRIBUTION_SCHEMA, "generatedAt": _iso(generated_at),
            "complete": complete, "mergeCount": total, "projects": projects}


def validate_origin_receipt(receipt: dict) -> None:
    if (not isinstance(receipt, dict) or type(receipt.get("pr")) is not int or receipt["pr"] < 1
            or not isinstance(receipt.get("repository"), str)
            or not re.fullmatch(r"[\w.-]+/[\w.-]+", receipt["repository"])):
        raise ValueError("malformed-origin-receipt")
    fake = {"number": receipt.get("pr"), "headRefOid": receipt.get("headSha")}
    origin, error = _source_origin(receipt, receipt.get("repository"), fake)
    if origin is None or error:
        raise ValueError(error or "invalid-origin-receipt")


def resolve_origin_head(repository: str, number: int, expected_head: str, *, fetch=None,
                        sleep=None, attempts=None) -> tuple[str, dict]:
    """Read canonical GitHub identity; caller assertions alone never establish a head.

    A just-pushed SHA can be missing from the pull and the git ref for a short
    window. Poll until both equal ``expected_head``. Repository, pull number,
    and base repo mismatches are rejected on the first read. A head that is
    still different after the bounded wait is still a mismatch.
    """
    def remote(endpoint):
        result = subprocess.run(["gh", "api", endpoint], capture_output=True, text=True,
                                timeout=20, check=True)
        return json.loads(result.stdout)
    read = fetch or remote
    pause = sleep or time.sleep
    tries = ORIGIN_HEAD_READ_ATTEMPTS if attempts is None else attempts
    canonical = read(f"repos/{repository}")["full_name"]
    if canonical not in {project["repository"] for project in PROJECTS}:
        raise ValueError("origin-repository-not-allowed")
    for attempt in range(max(tries, 0)):
        pr = read(f"repos/{canonical}/pulls/{number}")
        if (type(pr.get("number")) is not int or pr["number"] != number
                or _object(_object(pr.get("base")).get("repo")).get("full_name") != canonical):
            raise ValueError("origin-receipt-head-mismatch")
        matched = _object(pr.get("head")).get("sha") == expected_head
        if matched and pr.get("state") == "open":
            head = pr["head"]
            ref = read(f"repos/{head['repo']['full_name']}/git/ref/heads/{quote(head['ref'], safe='')}")
            matched = _object(ref.get("object")).get("sha") == expected_head
        if matched:
            return canonical, pr
        if attempt + 1 >= tries:
            break
        print(f"origin head {str(expected_head)[:12]} not converged for pull {number} "
              f"(attempt {attempt + 1}/{tries})", file=sys.stderr)
        pause(ORIGIN_HEAD_RETRY_DELAYS[min(attempt, len(ORIGIN_HEAD_RETRY_DELAYS) - 1)])
    raise ValueError("origin-receipt-head-mismatch")


def append_origin_receipt(path: Path, receipt: dict) -> None:
    """Append a manual/external origin receipt without changing execution authority."""
    validate_origin_receipt(receipt)
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with Path(path).open("a+") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        handle.seek(0)
        for raw in handle:
            if not raw.strip():
                continue
            try:
                row = json.loads(raw)
            except ValueError:
                raise OSError("origin-ledger-corrupt") from None
            if not isinstance(row, dict):
                raise OSError("origin-ledger-corrupt")
            if (row.get("schema") == ORIGIN_RECEIPT_SCHEMA and
                    (row.get("repository"), row.get("pr"), row.get("headSha")) ==
                    (receipt["repository"], receipt["pr"], receipt["headSha"])):
                fields = ("method", "initiator", "provider", "model", "linearIssue")
                if any(row.get(key) != receipt.get(key) for key in fields):
                    raise ValueError("conflicting-origin-receipt")
                raise ValueError("duplicate-origin-receipt")
        handle.write(json.dumps(receipt, separators=(",", ":")) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    record = sub.add_parser("record-origin", help="append a minimal origin receipt to the canonical ledger")
    record.add_argument("--ledger", required=True, type=Path)
    record.add_argument("--repository", required=True)
    record.add_argument("--pr", required=True, type=int)
    record.add_argument("--head-sha", required=True)
    record.add_argument("--method", required=True, choices=sorted(METHODS - {"unknown"}))
    record.add_argument("--initiator", required=True)
    record.add_argument("--provider")
    record.add_argument("--model")
    record.add_argument("--execution-host")
    record.add_argument("--run-id")
    record.add_argument("--linear-issue")
    record.add_argument("--evidence-url")
    args = parser.parse_args(argv)
    receipt = {"schema": ORIGIN_RECEIPT_SCHEMA, "receiptId": f"origin:{args.repository}:{args.pr}:{args.head_sha}",
               "role": "origin", "recordedAt": _iso(datetime.now(timezone.utc).timestamp()),
               "repository": args.repository, "pr": args.pr, "headSha": args.head_sha,
               "method": args.method, "initiator": args.initiator, "provider": args.provider,
               "model": args.model, "executionHost": args.execution_host, "runId": args.run_id,
               "linearIssue": args.linear_issue, "evidenceUrl": args.evidence_url}
    validate_origin_receipt(receipt)
    receipt["repository"], _ = resolve_origin_head(args.repository, args.pr, args.head_sha)
    receipt["receiptId"] = f"origin:{receipt['repository']}:{args.pr}:{args.head_sha}"
    append_origin_receipt(args.ledger, receipt)
    print(json.dumps({"receiptId": receipt["receiptId"], "ledger": str(args.ledger)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
