"""Deterministic coverage for receipt-first merged-PR attribution."""
from __future__ import annotations

import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import shipping_attribution as attribution  # noqa: E402


def pr(number=7, head="a" * 40, author="contributor", branch="feature/work", created="2026-10-07T10:00:00Z"):
    return {"number": number, "title": "change", "url": f"https://github.com/JovieInc/Jovie/pull/{number}",
            "headRefName": branch, "headRefOid": head, "mergeCommit": {"oid": "f" * 40},
            "baseRefName": "main", "createdAt": created, "updatedAt": "2026-10-07T12:00:01Z",
            "mergedAt": "2026-10-07T12:00:00Z", "author": {"login": author},
            "mergedBy": {"login": "merge-queue[bot]"}}


def lane_origin(number=7, head="a" * 40, provider="codex", **overrides):
    row = {"schema": "jovie-lane-run/v1", "runId": "run-7", "repository": "JovieInc/Jovie",
           "executionHost": "gem", "initiator": "symphony", "provider": provider,
           "model": provider + "-model", "origin": "autonomous-lane", "issue": "JOV-7",
           "pr": number, "headSha": head, "kind": "issue",
           "attribution": {"category": "autonomous-created", "originProvider": provider,
                           "finalProvider": provider}, "startedAt": "2026-10-01T00:00:00Z"}
    row.update(overrides)
    return row


def source_origin(method, number=7, head="a" * 40, **overrides):
    row = {"schema": "jovie-shipping-origin/v1", "receiptId": f"source-{number}", "role": "origin",
           "recordedAt": "2026-10-07T11:00:00Z", "repository": "JovieInc/Jovie", "pr": number,
           "headSha": head, "method": method, "initiator": "tim", "provider": None, "model": None}
    row.update(overrides)
    return row


def evidence(rows, complete=True, reason=None):
    return {"schema": "jovie-merge-window/v1", "complete": complete, "reason": reason,
            "window": {"since": 1_791_325_091, "until": 1_791_411_491}, "prs": rows}


def ledger(rows=(), **overrides):
    value = {"complete": True, "reason": None, "corruptRows": 0,
             "observedAt": "2026-10-07T12:01:00Z", "rows": list(rows)}
    value.update(overrides)
    return value


def test_cross_provider_handoff_keeps_origin_and_finalizer_separate():
    receipt = lane_origin(attribution={"category": "cross-provider-handoff",
                                       "originProvider": "codex", "finalProvider": "devin"},
                          finishedBy="devin", handoffs=[{"from": "codex", "to": "devin"}])
    row = attribution.attribute_pr(pr(), [receipt], "JovieInc/Jovie")
    assert row["origin"]["method"] == "symphony"
    assert row["origin"]["provider"] == "codex"
    assert row["origin"]["finalizingProvider"] == "devin"
    assert row["origin"]["confidence"] == "verified"


def test_founder_author_is_inferred_until_manual_source_receipt_exists():
    authored = attribution.attribute_pr(pr(author="itstimwhite"), [], "JovieInc/Jovie")
    assert authored["origin"]["method"] == "founder-operated-unknown-provider"
    assert authored["origin"]["confidence"] == "inferred"
    receipt = source_origin("founder-operated-codex", provider="codex", model="gpt-5-codex")
    verified = attribution.attribute_pr(pr(author="itstimwhite"), [receipt], "JovieInc/Jovie")
    assert (verified["origin"]["method"], verified["origin"]["provider"],
            verified["origin"]["confidence"]) == ("founder-operated-codex", "codex", "verified")


def test_bot_authored_pr_with_exact_lane_receipt_is_symphony_not_automation():
    row = attribution.attribute_pr(pr(author="jovie-bot[bot]"), [lane_origin()], "JovieInc/Jovie")
    assert row["origin"]["method"] == "symphony"
    assert row["origin"]["confidence"] == "verified"
    assert (row["prAuthor"], row["mergeActor"], row["headSha"], row["mergedAt"]) == (
        "jovie-bot[bot]", "merge-queue[bot]", "a" * 40, "2026-10-07T12:00:00Z")


def test_dependency_automation_remains_inferred_without_origin_receipt():
    dependency = pr(author="dependabot[bot]", branch="dependabot/npm/pkg-2")
    inferred = attribution.attribute_pr(dependency, [], "JovieInc/Jovie")
    assert (inferred["origin"]["method"], inferred["origin"]["confidence"]) == ("dependabot", "inferred")
    verified = attribution.attribute_pr(dependency, [source_origin("dependabot")], "JovieInc/Jovie")
    assert verified["origin"]["confidence"] == "verified"


def test_old_branch_age_and_provider_prefix_never_replace_receipt_proof():
    old = pr(branch="codex/old-work", created="2026-09-01T00:00:00Z")
    assert attribution.attribute_pr(old, [], "JovieInc/Jovie")["origin"]["confidence"] == "unknown"
    proven = attribution.attribute_pr(old, [lane_origin()], "JovieInc/Jovie")
    assert proven["origin"]["method"] == "symphony"
    legacy = lane_origin()
    legacy.pop("attribution")
    assert attribution.attribute_pr(old, [legacy], "JovieInc/Jovie")["origin"]["confidence"] == "verified"
    mismatch = attribution.attribute_pr(old, [lane_origin(head="b" * 40)], "JovieInc/Jovie")
    assert (mismatch["origin"]["method"], mismatch["origin"]["confidence"]) == ("symphony", "inferred")


def test_missing_and_corrupt_receipts_are_explicit(tmp_path):
    path = tmp_path / "ledger.jsonl"
    path.write_text(json.dumps(lane_origin()) + "\n{bad json\n")
    receipt_stream = attribution.read_ledger(path)
    report = attribution.project_report(attribution.PROJECTS[0], evidence([pr(7), pr(8)]),
                                        receipt_stream, 1_791_411_492)
    assert report["mergeCount"] == 2
    assert report["coverage"] == {"numerator": 1, "denominator": 2, "percent": 50.0}
    assert report["receiptStream"] == {"complete": False, "reason": "corrupt-receipts", "corruptRows": 1}
    assert report["attributionEvidenceComplete"] is False
    assert report["missingOriginReceiptPullRequests"] == ["https://github.com/JovieInc/Jovie/pull/8"]


def test_incomplete_github_window_never_reports_a_zero_denominator():
    report = attribution.project_report(attribution.PROJECTS[0], evidence([], False, "fetch_failed"), ledger(), 2)
    assert report["denominatorComplete"] is False
    assert report["attributionEvidenceComplete"] is False
    assert report["mergeCount"] is None
    assert report["coverage"] is None
    assert report["byShippingMethod"] is None


def test_lyb_is_project_specific_and_missing_reads_are_not_zero():
    only_jovie = attribution.company_report({"JovieInc/Jovie": evidence([])}, ledger(), 1_791_411_492)
    lyb = next(row for row in only_jovie["projects"] if row["channel"] == "LogYourBody")
    assert lyb["instrumented"] is True
    assert lyb["mergeCount"] is None
    assert only_jovie["complete"] is False
    lyb_pr = {**pr(number=12), "url": "https://github.com/JovieInc/LogYourBody/pull/12"}
    lyb_receipt = lane_origin(number=12, kind="binding-issue", issue="LYB-12", binding="LYB",
                              repository="JovieInc/LogYourBody")
    report = attribution.company_report({"JovieInc/Jovie": evidence([]),
                                         "JovieInc/LogYourBody": evidence([lyb_pr])},
                                        ledger([lyb_receipt]), 1_791_411_492)
    lyb = next(row for row in report["projects"] if row["channel"] == "LogYourBody")
    assert lyb["coverage"] == {"numerator": 1, "denominator": 1, "percent": 100.0}


def test_multiple_repair_receipts_do_not_duplicate_a_merged_pr():
    repair = {"schema": "jovie-lane-run/v1", "repository": "JovieInc/Jovie", "pr": 7,
              "kind": "fix-red", "provider": "devin", "runId": "repair-1",
              "attribution": {"category": "autonomous-remediation", "provider": "devin"},
              "headBefore": "b" * 40, "headAfter": "a" * 40}
    report = attribution.project_report(attribution.PROJECTS[0], evidence([pr()]),
                                        ledger([lane_origin(), repair, dict(repair)]), 1_791_411_492)
    assert report["mergeCount"] == 1
    assert report["work"]["remediationPullRequests"] == 1
    assert len(report["pullRequests"][0]["contributions"]) == 1


def test_fixed_window_shape_sums_verified_inferred_and_unknown_to_69():
    prs = [pr(number=i, head=f"{i:040x}", author="dependabot[bot]" if 8 <= i < 27 else "contributor")
           for i in range(69)]
    receipts = [lane_origin(number=i, head=f"{i:040x}", runId=f"run-{i}", issue=f"JOV-{i + 1}")
                for i in range(8)]
    report = attribution.project_report(attribution.PROJECTS[0], evidence(prs), ledger(receipts), 1_791_411_492)
    assert report["mergeCount"] == 69
    assert report["byConfidence"] == {"inferred": 19, "unknown": 42, "verified": 8}
    assert sum(report["byShippingMethod"].values()) == 69
    assert report["coverage"] == {"numerator": 8, "denominator": 69, "percent": 11.6}


def test_origin_append_is_strict_and_append_only(tmp_path):
    path = tmp_path / "ledger.jsonl"
    receipt = source_origin("independent-hyperagent", executionHost="external")
    attribution.append_origin_receipt(path, receipt)
    attribution.append_origin_receipt(path, {**receipt, "receiptId": "source-8", "pr": 8})
    assert len(path.read_text().splitlines()) == 2
    with pytest.raises(ValueError, match="malformed-origin-receipt"):
        attribution.validate_origin_receipt({**receipt, "headSha": "bad"})
