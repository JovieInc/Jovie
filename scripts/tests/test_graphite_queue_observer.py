from __future__ import annotations

import json
import os
import stat
import subprocess
import textwrap
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / ".github/scripts/observe-graphite-queue.sh"


def _run(
    tmp_path: Path,
    *,
    behind: int,
    status: str = "in_progress",
    comment=False,
    gated_group=False,
    repeated_group=False,
    multi_source_group=False,
    source_gated=False,
    source_draft=False,
    merge_conclusion="success",
    terminal_conclusion=None,
):
    old = (datetime.now(timezone.utc) - timedelta(minutes=10)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    recent = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    pr = {
        "number": 42,
        "title": "Queued source",
        "updated_at": old,
        "head": {"ref": "codex/source", "sha": "abc123"},
        "draft": gated_group or source_draft,
        "labels": [
            {"name": "merge-queue"},
            *([{"name": "gated"}] if gated_group or source_gated else []),
        ],
    }
    check = {
        "name": "Graphite / mergeability_check",
        "status": status,
        "conclusion": terminal_conclusion or merge_conclusion,
        "started_at": old,
    }
    check_runs = [] if status == "missing" else [check]
    group = {
        "number": 99,
        "title": f"[Graphite MQ] Draft PR GROUP:test (PRs {'41, ' if multi_source_group else ''}42)",
        "updated_at": old,
        "head": {"ref": "gtmq_test", "sha": "group123"},
        "labels": [],
        "draft": True,
    }
    comments = (
        [{"body": "<!-- bot-comment:graphite-zero-group-observer -->", "updated_at": recent}]
        if comment
        else []
    )
    clean_pr = {
        **pr,
        "number": 41,
        "head": {"ref": "codex/clean", "sha": "clean123"},
        "draft": False,
        "labels": [],
    }
    pulls = (
        [clean_pr, pr, group]
        if gated_group and multi_source_group
        else ([pr, group] if gated_group else [pr])
    )
    fake = tmp_path / "gh"
    fake.write_text(
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            args="$*"
            if [[ "$args" == *"pulls?state=open"* ]]; then echo '{json.dumps([pulls])}'; exit 0; fi
            if [[ "$args" == *"issues/42/comments"* && "$args" == *".body]"* ]]; then echo '{"Recurring synthetic group #98 detected" if repeated_group else ""}'; exit 0; fi
            if [[ "$args" == *"issues/42/comments"* ]]; then echo '{old if repeated_group else (recent if comment else "null")}'; exit 0; fi
            if [[ "$args" == *"commits/abc123/check-runs"* ]]; then echo '{json.dumps([{"check_runs": check_runs}])}'; exit 0; fi
            if [[ "$args" == *"commits/clean123/check-runs"* ]]; then echo '{json.dumps([{"check_runs": []}])}'; exit 0; fi
            if [[ "$args" == *"compare/main...abc123"* ]]; then echo '{behind}'; exit 0; fi
            echo "unexpected gh: $args" >&2; exit 2
            """
        ),
        encoding="utf-8",
    )
    fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
    env = os.environ | {
        "PATH": f"{tmp_path}:{os.environ['PATH']}",
        "DRY_RUN": "1",
        "GROUP_WAIT_SECONDS": "1",
        "COOLDOWN_SECONDS": "7200",
    }
    return subprocess.run(
        ["bash", str(SCRIPT)], cwd=ROOT, env=env, text=True, capture_output=True
    )


def test_stale_mergeability_behind_main_dispatches_rebase_not_label_cycle(tmp_path):
    result = _run(tmp_path, behind=3)
    assert result.returncode == 0, result.stderr
    assert "targeted rebase dispatch" in result.stdout
    assert "single label cycle" not in result.stdout


def test_stale_mergeability_on_current_head_escalates_fail_closed(tmp_path):
    result = _run(tmp_path, behind=0)
    assert result.returncode == 0, result.stderr
    assert "fail-closed escalation" in result.stdout
    assert "single label cycle" not in result.stdout


def test_zero_group_without_stale_mergeability_gets_one_label_cycle(tmp_path):
    result = _run(tmp_path, behind=0, status="completed")
    assert result.returncode == 0, result.stderr
    assert "single label cycle" in result.stdout


def test_zero_group_gated_source_is_dequeued_not_reenrolled(tmp_path):
    result = _run(tmp_path, behind=0, status="completed", source_gated=True)
    assert result.returncode == 0, result.stderr
    assert "ineligible for zero-group recovery" in result.stdout
    assert "single label cycle" not in result.stdout


def test_zero_group_draft_source_is_dequeued_not_reenrolled(tmp_path):
    result = _run(tmp_path, behind=0, status="completed", source_draft=True)
    assert result.returncode == 0, result.stderr
    assert "ineligible for zero-group recovery" in result.stdout
    assert "single label cycle" not in result.stdout


def test_zero_group_terminal_source_is_dequeued_not_reenrolled(tmp_path):
    result = _run(
        tmp_path,
        behind=0,
        status="completed",
        terminal_conclusion="startup_failure",
    )
    assert result.returncode == 0, result.stderr
    assert "terminal=1" in result.stdout
    assert "single label cycle" not in result.stdout


def test_zero_group_missing_mergeability_is_dequeued_not_reenrolled(tmp_path):
    result = _run(tmp_path, behind=0, status="missing")
    assert result.returncode == 0, result.stderr
    assert "mergeability=missing/missing" in result.stdout
    assert "single label cycle" not in result.stdout


def test_zero_group_unsuccessful_mergeability_is_not_reenrolled(tmp_path):
    result = _run(
        tmp_path,
        behind=0,
        status="completed",
        merge_conclusion="failure",
    )
    assert result.returncode == 0, result.stderr
    assert "mergeability=completed/failure" in result.stdout
    assert "single label cycle" not in result.stdout


def test_zero_group_queued_mergeability_is_deferred_not_reenrolled(tmp_path):
    result = _run(tmp_path, behind=0, status="queued")
    assert result.returncode == 0, result.stderr
    assert "mergeability is still queued/success" in result.stdout
    assert "single label cycle" not in result.stdout


def test_persistent_comment_debounces_recovery(tmp_path):
    result = _run(tmp_path, behind=3, comment=True)
    assert result.returncode == 0, result.stderr
    assert "observation is debounced" in result.stdout
    assert "targeted rebase dispatch" not in result.stdout


def test_gated_source_synthetic_recurrence_is_fail_closed_not_cycled(tmp_path):
    result = _run(tmp_path, behind=0, status="completed", gated_group=True)
    assert result.returncode == 0, result.stderr
    assert "close/dequeue source before synthetic fail-closed" in result.stdout
    assert "single label cycle" not in result.stdout


def test_repeated_gated_synthetic_recurrence_temporarily_closes_source(tmp_path):
    result = _run(
        tmp_path,
        behind=0,
        status="completed",
        gated_group=True,
        repeated_group=True,
    )
    assert result.returncode == 0, result.stderr
    assert "temporarily close source with reopen marker" in result.stdout
    assert "single label cycle" not in result.stdout


def test_multi_source_group_checks_downstream_gated_source(tmp_path):
    result = _run(
        tmp_path,
        behind=0,
        status="completed",
        gated_group=True,
        multi_source_group=True,
    )
    assert result.returncode == 0, result.stderr
    assert "source #42 -> close/dequeue source before synthetic fail-closed" in result.stdout


def test_label_cycle_has_compensating_restore_and_fail_closed_gate() -> None:
    script = SCRIPT.read_text(encoding="utf-8")

    assert "for attempt in 1 2 3" in script
    assert "failed to restore it after 3 attempts" in script
    assert 'gh pr edit "$n" -R "$REPO" --add-label gated || true' in script
