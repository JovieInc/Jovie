"""Deterministic coverage for receipt-first merged-PR attribution."""
from __future__ import annotations

import ast
import errno
import json
import multiprocessing
import os
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import patch

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import atomic_state as state  # noqa: E402
import ledger_archive  # noqa: E402
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


def test_duplicate_and_conflicting_origin_appends_preserve_original_bytes(tmp_path):
    path = tmp_path / "ledger.jsonl"
    receipt = source_origin("grokbot")
    attribution.append_origin_receipt(path, receipt)
    first = path.read_bytes()
    with pytest.raises(ValueError, match="duplicate-origin-receipt"):
        attribution.append_origin_receipt(path, dict(receipt))
    with pytest.raises(ValueError, match="conflicting-origin-receipt"):
        attribution.append_origin_receipt(path, {**receipt, "method": "independent-hyperagent"})
    assert path.read_bytes() == first
    conflict = {**receipt, "method": "independent-hyperagent"}
    row = attribution.attribute_pr(pr(), [receipt, conflict], "JovieInc/Jovie")
    assert row["origin"]["confidence"] == "unknown"
    assert row["evidenceErrors"][-1]["reason"] == "conflicting-exact-origin-receipts"


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_origin_nonfinite_extension_rejected_before_ledger_write(tmp_path, value):
    path = tmp_path / "ledger.jsonl"
    path.write_bytes(b'{"existing":true}\n')
    before = path.read_bytes()
    with pytest.raises(ValueError):
        attribution.append_origin_receipt(path, {**source_origin("grokbot"), "extra": value})
    assert path.read_bytes() == before


# Canonical ledger writes use only synthetic rows and isolated files.

def _writer(path, start, count, ready, go):
    ready.put(True)
    go.wait(10)
    for index in range(count):
        # Force repeated short writes while processes compete for the same lock.
        real_write = os.write
        with patch.object(state.os, "write", side_effect=lambda fd, data: real_write(fd, data[:997])):
            state.append_json_object(Path(path), {"id": start + index, "text": "é" * 10000})


def test_multiprocess_large_rows_remain_whole_with_short_writes(tmp_path):
    ctx = multiprocessing.get_context("fork")
    ready, go = ctx.Queue(), ctx.Event()
    path = tmp_path / "runs/ledger.jsonl"
    workers = [ctx.Process(target=_writer, args=(str(path), n * 8, 8, ready, go)) for n in range(4)]
    for worker in workers:
        worker.start()
    try:
        for _ in workers:
            assert ready.get(timeout=10)
        go.set()
        for worker in workers:
            worker.join(15)
            assert worker.exitcode == 0
    finally:
        for worker in workers:
            if worker.is_alive():
                worker.terminate()
                worker.join()
    rows = [json.loads(line) for line in path.read_bytes().splitlines()]
    assert sorted(r["id"] for r in rows) == list(range(32))
    assert all(r["text"] == "é" * 10000 for r in rows)
    assert attribution.read_ledger(path)["complete"] is True


def test_single_unchecked_short_write_reproduces_partial_record(tmp_path):
    path = tmp_path / "old.jsonl"
    payload = (json.dumps({"text": "x" * 20000}) + "\n").encode()
    real_write = os.write
    fd = os.open(path, os.O_CREAT | os.O_WRONLY | os.O_APPEND, 0o600)
    try:
        with patch.object(os, "write", side_effect=lambda fd, data: real_write(fd, data[:8193])):
            os.write(fd, payload)  # negative control: ignoring a short write tears the row
    finally:
        os.close(fd)
    assert attribution.read_ledger(path)["complete"] is False


@pytest.mark.parametrize("record", [None, [], 1, "{}", {"x": float("nan")},
                                   {"x": [float("inf")]}, {"x": float("-inf")}, {"x": object()}])
def test_invalid_input_has_no_filesystem_side_effect(tmp_path, record):
    path = tmp_path / "absent/ledger.jsonl"
    with pytest.raises((ValueError, TypeError)):
        state.append_json_object(path, record)
    assert not path.parent.exists()


@pytest.mark.parametrize("serialized", ['{', '[]', 'null', '{"x":NaN}', '{"x":Infinity}',
                                         '{"x":1e999}', '{}\n{}', '{\n"x":1}'])
def test_invalid_serialized_records_rejected_before_io(tmp_path, serialized):
    path = tmp_path / "absent/ledger.jsonl"
    with patch.object(state.json, "dumps", return_value=serialized):
        with pytest.raises(ValueError):
            state.append_json_object(path, {})
    assert not path.parent.exists()


@pytest.mark.parametrize("failure", ["zero", "negative", "write", "fsync", "interrupt"])
def test_failed_append_restores_every_original_byte(tmp_path, failure):
    path = tmp_path / "ledger.jsonl"
    before = b'{"kept": true}\n\n'
    path.write_bytes(before)
    real_write, real_sync = os.write, os.fsync
    writes = 0
    syncs = 0

    def write(fd, data):
        nonlocal writes
        writes += 1
        if writes == 1:
            return real_write(fd, data[:3])
        if failure == "zero":
            return 0
        if failure == "negative":
            return -1
        if failure == "write":
            raise OSError(errno.ENOSPC, "fixture")
        if failure == "interrupt":
            raise KeyboardInterrupt()
        return real_write(fd, data)

    def sync(fd):
        nonlocal syncs
        syncs += 1
        if failure == "fsync" and syncs == 1:
            raise OSError(errno.EIO, "fixture")
        return real_sync(fd)

    with patch.object(state.os, "write", side_effect=write), patch.object(state.os, "fsync", side_effect=sync):
        with pytest.raises((OSError, KeyboardInterrupt)):
            state.append_json_object(path, {"text": "x" * 20000})
    assert path.read_bytes() == before
    state.append_json_object(path, {"after": True})
    assert path.read_bytes().startswith(before)


def test_rollback_error_reports_uncertain_outcome(tmp_path):
    path = tmp_path / "ledger.jsonl"
    with patch.object(state.os, "write", side_effect=OSError("fixture")), \
            patch.object(state.os, "ftruncate", side_effect=OSError("fixture")):
        with pytest.raises(OSError, match="rollback-uncertain"):
            state.append_json_object(path, {})


@pytest.mark.parametrize("tail", [b'{"valid":1}', b'{"torn":', b'not-json'])
def test_unterminated_existing_tail_is_never_changed(tmp_path, tail):
    path = tmp_path / "ledger.jsonl"
    path.write_bytes(tail)
    with pytest.raises(OSError, match="unterminated"):
        state.append_json_object(path, {})
    assert path.read_bytes() == tail


def test_callback_sees_snapshot_and_failure_preserves_bytes(tmp_path):
    path = tmp_path / "ledger.jsonl"
    path.write_bytes(b'{"prior":1}\n')
    def check(handle, record):
        assert handle.read() == b'{"prior":1}\n'
        assert record == {"next": 2}
        raise ValueError("refused")
    with pytest.raises(ValueError, match="refused"):
        state.append_json_object(path, {"next": 2}, before_append=check)
    assert path.read_bytes() == b'{"prior":1}\n'


@pytest.mark.parametrize("kind", ["ledger", "lock"])
def test_symlink_cannot_redirect_append(tmp_path, kind):
    target = tmp_path / "target"
    target.write_bytes(b'{"kept":1}\n')
    path = tmp_path / "ledger.jsonl"
    (path if kind == "ledger" else state.ledger_lock_path(path)).symlink_to(target)
    with pytest.raises(OSError):
        state.append_json_object(path, {})
    assert target.read_bytes() == b'{"kept":1}\n'


def test_path_drift_is_refused(tmp_path):
    path = tmp_path / "ledger.jsonl"
    path.write_bytes(b'{}\n')
    actual = os.fstat
    def moved(fd):
        result = actual(fd)
        return SimpleNamespace(st_mode=result.st_mode, st_dev=result.st_dev, st_ino=-1)
    with patch.object(state.os, "fstat", side_effect=moved):
        with pytest.raises(OSError, match="path-changed"):
            state.append_json_object(path, {})
    assert path.read_bytes() == b'{}\n'


def test_finite_float_and_escaped_newlines_are_valid(tmp_path):
    path = tmp_path / "ledger.jsonl"
    state.append_json_object(path, {"float": 1.5, "text": "line\nline"})
    assert json.loads(path.read_bytes()) == {"float": 1.5, "text": "line\nline"}


def test_rotation_uses_append_lock(tmp_path):
    import fcntl
    path = tmp_path / "runs/ledger.jsonl"
    state.append_json_object(path, {"id": 1})
    with state.ledger_lock_path(path).open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        assert ledger_archive.rotate(tmp_path, settle_s=0)["status"] == "busy"
    assert ledger_archive.rotate(tmp_path, settle_s=0)["status"] == "rotated"
    state.append_json_object(path, {"id": 2})
    assert [json.loads(r)["id"] for r in path.read_bytes().splitlines()] == [1, 2]


def test_every_maintained_producer_routes_through_shared_helper():
    root = Path(__file__).resolve().parents[1] / "lanes"
    expected = {"lane_runner.py": 12, "hyperagent_repair.py": 1, "epics.py": 1,
                "pr_events.py": 1, "bindings.py": 1, "taste_default.py": 1, "outcome_lane.py": 1}
    calls_by_file = {}
    for path in root.glob("*.py"):
        source = path.read_text()
        if "ledger.jsonl" not in source:
            continue
        tree = ast.parse(source)
        calls_by_file[path.name] = [n for n in ast.walk(tree) if isinstance(n, ast.Call)]
    for name, count in expected.items():
        routed = [n for n in calls_by_file[name] if isinstance(n.func, ast.Name)
                  and n.func.id == "append_json_object"]
        assert len(routed) == count, name
    # Catch literal canonical appends, including Path.open's argument-zero mode.
    for name, calls in calls_by_file.items():
        for call in calls:
            if getattr(call.func, "id", getattr(call.func, "attr", "")) != "open":
                continue
            mode_index = 1 if isinstance(call.func, ast.Name) else 0
            mode = call.args[mode_index] if len(call.args) > mode_index else None
            is_append = isinstance(mode, ast.Constant) and isinstance(mode.value, str) and "a" in mode.value
            assert not (is_append and "ledger.jsonl" in ast.unparse(call)), name



@pytest.mark.parametrize("bad", [b'{broken}\n', b'[]\n', b'null\n', b'\xff\n', b'\xef\xbb\xbf{}\n'])
def test_origin_existing_corruption_remains_failclosed_and_unchanged(tmp_path, bad):
    path = tmp_path / "ledger.jsonl"
    original = b'\n{"prior":true}\n' + bad
    path.write_bytes(original)
    with pytest.raises(OSError, match="origin-ledger-corrupt"):
        attribution.append_origin_receipt(path, source_origin("grokbot"))
    assert path.read_bytes() == original
    if bad != b'\xff\n':
        assert attribution.read_ledger(path)["complete"] is False


def test_origin_blank_lines_and_unrelated_rows_are_preserved(tmp_path):
    path = tmp_path / "ledger.jsonl"
    original = b'\n{"prior":true}\n \t\r\n'
    path.write_bytes(original)
    attribution.append_origin_receipt(path, source_origin("grokbot"))
    assert path.read_bytes().startswith(original)
    assert attribution.read_ledger(path)["complete"] is True


def _origin_contender(path, ready, go, results):
    ready.put(True)
    go.wait(10)
    try:
        attribution.append_origin_receipt(Path(path), source_origin("grokbot"))
        results.put("appended")
    except ValueError as error:
        results.put(str(error))


def test_concurrent_origin_duplicates_have_exactly_one_winner(tmp_path):
    ctx = multiprocessing.get_context("fork")
    ready, go, results = ctx.Queue(), ctx.Event(), ctx.Queue()
    path = tmp_path / "runs/ledger.jsonl"
    workers = [ctx.Process(target=_origin_contender, args=(str(path), ready, go, results)) for _ in range(3)]
    for worker in workers:
        worker.start()
    try:
        for _ in workers:
            assert ready.get(timeout=10)
        go.set()
        for worker in workers:
            worker.join(10)
            assert worker.exitcode == 0
        assert sorted(results.get(timeout=5) for _ in workers) == [
            "appended", "duplicate-origin-receipt", "duplicate-origin-receipt"]
    finally:
        for worker in workers:
            if worker.is_alive():
                worker.terminate()
                worker.join()
    assert len(path.read_bytes().splitlines()) == 1
