"""Rotation and sparse-checkout coverage for the shared ledger writer."""
from __future__ import annotations

import json
import multiprocessing
import os
import shutil
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import atomic_state as state  # noqa: E402
import ledger_archive  # noqa: E402
import shipping_attribution as attribution  # noqa: E402


def source_origin(method, number=7, head="a" * 40, **overrides):
    row = {"schema": "jovie-shipping-origin/v1", "receiptId": f"source-{number}", "role": "origin",
           "recordedAt": "2026-10-07T11:00:00Z", "repository": "JovieInc/Jovie", "pr": number,
           "headSha": head, "method": method, "initiator": "tim", "provider": None, "model": None}
    row.update(overrides)
    return row


def test_small_producers_execute_the_shared_writer_and_preserve_receipts(tmp_path):
    # Only pure receipt functions, no lane/controller construction or installed bindings.
    import pr_events
    import taste_default
    import outcome_lane
    pr_events.ledger(SimpleNamespace(state=tmp_path), {"kind": "fixture", "text": "x" * 20000})
    taste_default.ledger_row(tmp_path, "JOV-1", {"enteredAt": 1800000000}, "fixture", 1800000001)
    outcome_lane.ledger(tmp_path, "JOV-1", {"at": "2026-01-01T00:00:00Z", "sha": "a" * 40},
                        {"result": "fixture", "decision": "fixture"})
    rows = [json.loads(r) for r in (tmp_path / "runs/ledger.jsonl").read_bytes().splitlines()]
    assert [row["kind"] for row in rows] == ["fixture", "taste-decision", "outcome-verify"]
    assert rows[0]["text"] == "x" * 20000
    assert rows[1]["waitHours"] is None
    assert rows[2]["sha"] == "a" * 40
    with patch.object(taste_default, "append_json_object", side_effect=OSError("fixture")), \
            patch.object(outcome_lane, "append_json_object", side_effect=OSError("fixture")):
        taste_default.ledger_row(tmp_path, "JOV-1", {"enteredAt": 1800000000}, "fixture", 1800000001)
        outcome_lane.ledger(tmp_path, "JOV-1", {}, {})
    assert len((tmp_path / "runs/ledger.jsonl").read_bytes().splitlines()) == 3


def _append_after_rotation_starts(path, started):
    started.set()
    state.append_json_object(Path(path), {"id": 2})


def test_multiprocess_appender_waits_for_rotation_and_opens_current_inode(tmp_path):
    path = tmp_path / "runs/ledger.jsonl"
    state.append_json_object(path, {"id": 1})
    ctx = multiprocessing.get_context("spawn")
    started = ctx.Event()
    worker = ctx.Process(target=_append_after_rotation_starts, args=(str(path), started))
    def during_rename(_):
        worker.start()
        assert started.wait(10)
        assert not path.exists()  # appender cannot recreate the path during rotation
    try:
        assert ledger_archive.rotate(tmp_path, sleep=during_rename)["status"] == "rotated"
        worker.join(10)
        assert worker.exitcode == 0
    finally:
        if worker.is_alive():
            worker.terminate()
            worker.join()
    assert [json.loads(r)["id"] for r in path.read_bytes().splitlines()] == [1, 2]


def test_rotation_without_runs_directory_preserves_no_ledger_contract(tmp_path):
    assert ledger_archive.rotate(tmp_path)["status"] == "no-ledger"
    assert not (tmp_path / "runs").exists()
    (tmp_path / "runs").mkdir()
    assert ledger_archive.rotate(tmp_path)["status"] == "no-ledger"


def test_rotation_archives_old_objects_without_issue_metadata(tmp_path):
    path = tmp_path / "runs/ledger.jsonl"
    state.append_json_object(path, {"endedAt": "2020-01-01T00:00:00Z", "kept": "fixture"})
    result = ledger_archive.rotate(tmp_path, now=1800000000, settle_s=0)
    assert result["archived"] == 1
    archived = list((path.parent / ledger_archive.ARCHIVE_DIR).glob("*.jsonl"))
    assert len(archived) == 1
    assert json.loads(archived[0].read_bytes())["kept"] == "fixture"
    assert path.read_bytes() == b""



def test_dependabot_origin_cli_runs_from_exact_sparse_checkout_manifest(tmp_path):
    workflow = ROOT / ".github/workflows/dependabot-auto-merge.yml"
    lines = workflow.read_text().splitlines()
    start = next(i for i, line in enumerate(lines) if line.strip() == "sparse-checkout: |")
    indent = len(lines[start]) - len(lines[start].lstrip())
    patterns = []
    for line in lines[start + 1:]:
        if line.strip() and len(line) - len(line.lstrip()) <= indent:
            break
        if line.strip():
            patterns.append(line.strip())
    assert "scripts/shipping_origin.py" in patterns
    assert "scripts/lanes/shipping_attribution.py" in patterns
    checkout = tmp_path / "checkout"
    checkout.mkdir()
    # Materialize only tracked files selected by the real manifest, from current
    # source bytes. No dependency injection, hidden helper copy or test stub.
    listed = subprocess.run(["git", "ls-files", "-z", "--", *patterns], cwd=ROOT,
                            capture_output=True, check=True).stdout
    for relative in listed.decode().split("\0"):
        if not relative:
            continue
        target = checkout / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / relative, target)
    home, temporary = tmp_path / "home", tmp_path / "tmp"
    home.mkdir(mode=0o700)
    temporary.mkdir(mode=0o700)
    env = {"PATH": os.defpath, "HOME": str(home), "TMPDIR": str(temporary),
           "PYTHONPATH": "", "PYTHONNOUSERSITE": "1", "PYTHONDONTWRITEBYTECODE": "1"}
    for arguments in (["scripts/shipping_origin.py", "--help"],
                      ["scripts/shipping_origin.py", "emit-automation", "--help"],
                      ["scripts/lanes/shipping_attribution.py", "--help"]):
        result = subprocess.run([sys.executable, "-S", *arguments], cwd=checkout, env=env,
                                capture_output=True, text=True, timeout=10)
        assert result.returncode == 0, result.stderr
        assert "usage:" in result.stdout



@pytest.mark.parametrize("original", [
    b'{}\r{"prior":true}\r\n',
    '\u00a0\u2003\n{"prior":true}\n'.encode("utf-8"),
    b'{"legacy":NaN}\n{"legacy":Infinity}\n',
])
def test_origin_scan_preserves_existing_reader_accepted_bytes(tmp_path, original):
    path = tmp_path / "ledger.jsonl"
    path.write_bytes(original)
    attribution.append_origin_receipt(path, source_origin("grokbot"))
    assert path.read_bytes().startswith(original)
    assert attribution.read_ledger(path)["complete"] is True
