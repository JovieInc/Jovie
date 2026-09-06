"""
Regression tests for scripts/lib/gh-retry.sh.

The retry helper handles transient GitHub failures; the retired admission drain
must never call external tools, even with former controller authorization.

Run with:
    python -m pytest scripts/tests/test_gh_retry.py -v
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import shutil
import stat
import subprocess
import textwrap
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[2]
_GH_RETRY = _REPO_ROOT / "scripts" / "lib" / "gh-retry.sh"
_DRAIN_SCRIPT = _REPO_ROOT / "scripts" / "drain-pr-queue.sh"
_WATCHDOG_SCRIPT = _REPO_ROOT / "scripts" / "merge-queue-watchdog.sh"


def _run_bash(script: str, *, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    merged = os.environ.copy()
    if env:
        merged.update(env)
    return subprocess.run(
        ["bash", "-c", script],
        cwd=_REPO_ROOT,
        env=merged,
        text=True,
        capture_output=True,
        check=False,
    )


class TestGhRetryHelper:
    def test_retries_transient_504_then_succeeds(self, tmp_path: Path) -> None:
        counter = tmp_path / "calls"
        counter.write_text("0", encoding="utf-8")
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                count_file="${GH_RETRY_TEST_COUNTER:?}"
                count=$(<"$count_file")
                count=$((count + 1))
                echo "$count" >"$count_file"
                if [[ "$count" -lt 3 ]]; then
                  echo "HTTP 504: We couldn't respond to your request in time." >&2
                  exit 1
                fi
                echo '["ok"]'
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        script = textwrap.dedent(
            f"""\
            set -euo pipefail
            source "{_GH_RETRY}"
            export PATH="{tmp_path}:$PATH"
            export GH_RETRY_ATTEMPTS=5
            export GH_RETRY_BASE_DELAY=0
            export GH_RETRY_TEST_COUNTER="{counter}"
            out=$(gh_retry api graphql -f query='{{viewer{{login}}}}')
            test "$out" = '["ok"]'
            """
        )
        result = _run_bash(script)
        assert result.returncode == 0, result.stderr
        assert "gh-retry" in result.stderr
        assert counter.read_text(encoding="utf-8").strip() == "3"

    @pytest.mark.parametrize(
        "transient_error",
        [
            "stream error: stream ID 1; CANCEL; received from peer",
            "unexpected end of JSON input",
        ],
    )
    def test_retries_github_transport_truncation_then_succeeds(
        self, tmp_path: Path, transient_error: str
    ) -> None:
        counter = tmp_path / "calls"
        counter.write_text("0", encoding="utf-8")
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                count_file="${GH_RETRY_TEST_COUNTER:?}"
                count=$(<"$count_file")
                count=$((count + 1))
                echo "$count" >"$count_file"
                if [[ "$count" -lt 2 ]]; then
                  echo "${GH_RETRY_TEST_ERROR:?}" >&2
                  exit 1
                fi
                echo '["ok"]'
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        script = textwrap.dedent(
            f"""\
            set -euo pipefail
            source "{_GH_RETRY}"
            export PATH="{tmp_path}:$PATH"
            export GH_RETRY_ATTEMPTS=3
            export GH_RETRY_BASE_DELAY=0
            export GH_RETRY_TEST_COUNTER="{counter}"
            export GH_RETRY_TEST_ERROR="{transient_error}"
            out=$(gh_retry pr list --json statusCheckRollup)
            test "$out" = '["ok"]'
            """
        )
        result = _run_bash(script)
        assert result.returncode == 0, result.stderr
        assert "gh-retry" in result.stderr
        assert counter.read_text(encoding="utf-8").strip() == "2"

    def test_does_not_retry_permanent_errors(self, tmp_path: Path) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                echo "HTTP 401: Bad credentials" >&2
                exit 1
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        stderr_file = tmp_path / "stderr.txt"

        script = textwrap.dedent(
            f"""\
            set -euo pipefail
            source "{_GH_RETRY}"
            export PATH="{tmp_path}:$PATH"
            export GH_RETRY_ATTEMPTS=5
            export GH_RETRY_BASE_DELAY=0
            if gh_retry api user 2>"{stderr_file}"; then
              exit 2
            fi
            grep -q "HTTP 401" "{stderr_file}"
            test "$(wc -l <"{stderr_file}" | tr -d ' ')" = "1"
            """
        )
        result = _run_bash(script)
        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"

    def test_does_not_retry_exhausted_installation_quota(
        self, tmp_path: Path
    ) -> None:
        counter = tmp_path / "calls"
        counter.write_text("0", encoding="utf-8")
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                count_file="${GH_RETRY_TEST_COUNTER:?}"
                count=$(<"$count_file")
                echo "$((count + 1))" >"$count_file"
                echo "GraphQL: API rate limit already exceeded for installation ID 112037986." >&2
                exit 1
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        stderr_file = tmp_path / "stderr.txt"

        script = textwrap.dedent(
            f"""\
            set -euo pipefail
            source "{_GH_RETRY}"
            export PATH="{tmp_path}:$PATH"
            export GH_RETRY_ATTEMPTS=8
            export GH_RETRY_BASE_DELAY=0
            export GH_RETRY_TEST_COUNTER="{counter}"
            if gh_retry api graphql 2>"{stderr_file}"; then
              exit 2
            fi
            grep -q "rate limit already exceeded for installation ID" "{stderr_file}"
            test "$(wc -l <"{stderr_file}" | tr -d ' ')" = "1"
            """
        )
        result = _run_bash(script)
        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert counter.read_text(encoding="utf-8").strip() == "1"


@pytest.mark.parametrize("authorization", ["", "merge-queue-autoenroll", "test-fixture"])
@pytest.mark.parametrize("dry_run", ["0", "1"])
def test_retired_drain_never_runs_tools(tmp_path, authorization, dry_run):
    log = tmp_path / "tool-calls"
    for name in ("gh", "node", "python", "python3", "curl", "jq", "git"):
        tool = tmp_path / name
        tool.write_text(f'#!/bin/sh\nprintf invoked >> "{log}"\nexit 99\n')
        tool.chmod(0o755)
    result = subprocess.run(
        ["/bin/bash", "-x", str(_DRAIN_SCRIPT), "--anything"],
        env={**os.environ, "PATH": str(tmp_path),
             "DRAIN_MUTATION_AUTHORIZATION": authorization,
             "GH_MUTATION_TOKEN": "old-writer", "DRY_RUN": dry_run,
             "DRAIN_RECONCILE_MISSED_ADMISSION": "1",
             "DRAIN_RECOVER_MISSING_CI": "1",
             "DRAIN_ADMISSION_PR": "123", "DRAIN_ADMISSION_HEAD": "a" * 40,
             "DRAIN_PROMOTION_MODE": "normal"},
        capture_output=True, text=True, check=False,
    )
    assert result.returncode == 2
    assert not log.exists()
    assert "retired; no action was taken" in result.stderr
    assert "node scripts/native-merge-intent.mjs --repo OWNER/REPO --pr NUMBER --head EXACT_SHA" in result.stderr
    # Shell tracing proves the unconditional refusal was executed.
    assert "+ exit 2" in result.stderr


_RELEASE_SCRIPT = _REPO_ROOT / "scripts" / "release-queue-deferred.sh"
_RELEASE_WORKFLOW = _REPO_ROOT / ".github" / "workflows" / "queue-deferred-release.yml"
_FLEET_GATE_REFRESH_WORKFLOW = _REPO_ROOT / ".github" / "workflows" / "fleet-gate-refresh.yml"


def _release_command(tmp_path: Path, *, extra_env: str = "") -> str:
    fake_gh = tmp_path / "gh"
    assert fake_gh.is_file(), f"test must create isolated gh fixture first: {fake_gh}"
    env_prefix = (
        f'PATH="{tmp_path}:$PATH" '
        f'FAKE_GH_LOG="{tmp_path}/gh-calls.log" '
        f'FAKE_GH_STATE="{tmp_path}/state" '
    )
    if extra_env:
        env_prefix += f"{extra_env} "
    return f'{env_prefix}bash "{_RELEASE_SCRIPT}"'


def _fleet_receipt(tmp_path: Path, *, state: str = "GREEN", age_minutes: int = 0) -> Path:
    observed = datetime.now(timezone.utc) - timedelta(minutes=age_minutes)
    receipt = tmp_path / f"fleet-{state.lower()}-{age_minutes}.json"
    receipt.write_text(
        json.dumps(
            {
                "schema": "jovie-fleet-gate/v1",
                "observedAt": observed.isoformat(),
                "state": state,
                "promotionAdmission": {"allowed": state == "GREEN"},
            }
        ),
        encoding="utf-8",
    )
    return receipt


def _receipt_comment_body(
    tmp_path: Path,
    *,
    head: str,
    repository: str = "JovieInc/Jovie",
    deferred_minutes: int = 120,
    pr: int = 900,
    author: str = "itstimwhite",
    reason: str = "symphony-birth-hold",
    source: str = "symphony",
) -> None:
    deferred = datetime.now(timezone.utc) - timedelta(minutes=deferred_minutes)
    receipt = {
        "schema": "jovie-queue-deferral/v1",
        "repository": repository,
        "pr": pr,
        "head": head,
        "reason": reason,
        "source": source,
        "deferredAt": deferred.isoformat(),
    }
    body = (
        "<!-- bot-comment:queue-deferral -->\n"
        "## Queue Deferral Receipt\n\n"
        "```json\n"
        + json.dumps(receipt, indent=2)
        + "\n```\n"
    )
    # `gh api --paginate --slurp` wraps endpoint pages in an outer array.
    (tmp_path / "comments-900.json").write_text(
        json.dumps([[{"user": {"login": author}, "body": body}]]),
        encoding="utf-8",
    )


_FAKE_GH_PREAMBLE = """\
#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "${FAKE_GH_LOG:?}"
mkdir -p "${FAKE_GH_STATE:?}"
"""

_FAKE_GH_API_UNTYPED = """\
if [[ "$1" == "api" ]]; then
  # Attempt-marker lookup and untyped deferral lookup: no marker comments.
  exit 0
fi
"""

_FAKE_GH_GREEN_CHECKS = """\
if [[ "$1 $2" == "pr checks" ]]; then
  echo '[{"name":"PR Ready","bucket":"pass","state":"SUCCESS"},{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"},{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"},{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}]'
  exit 0
fi
"""


def _write_fake_gh(tmp_path: Path, body: str) -> None:
    fake_gh = tmp_path / "gh"
    fake_gh.write_text(body, encoding="utf-8")
    fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def _run_single_candidate_release(
    tmp_path: Path,
    *,
    head: str,
    base: str = "main",
    draft: bool = False,
    branch: str = "symphony/JOV-900-fix",
    labels: list[str] | None = None,
    fleet_state: str = "GREEN",
    fleet_age_minutes: int = 0,
) -> subprocess.CompletedProcess[str]:
    labels_json = json.dumps(labels or ["queue-deferred"])
    receipt = _fleet_receipt(
        tmp_path, state=fleet_state, age_minutes=fleet_age_minutes
    )
    _write_fake_gh(
        tmp_path,
        textwrap.dedent(
            f"""\
            {_FAKE_GH_PREAMBLE}
            if [[ "$1 $2" == "pr list" ]]; then
              echo '[{{"n":900,"t":"Deferred PR","draft":{str(draft).lower()},"m":"MERGEABLE","head":"{branch}","oid":"{head}","owner":"JovieInc","updated":"2026-08-13T00:00:00Z","L":{labels_json}}}]'
              exit 0
            fi
            if [[ "$1" == "api" ]]; then
              if [[ "$*" != *"queue-deferral-release"* && -f "${{FAKE_GH_STATE}}/../comments-900.json" ]]; then
                cat "${{FAKE_GH_STATE}}/../comments-900.json"
              fi
              exit 0
            fi
            if [[ "$1 $2" == "pr view" ]]; then
              echo '{{"draft":{str(draft).lower()},"head":"{head}","branch":"{branch}","headOwner":"JovieInc","base":"{base}","labels":{labels_json},"mergeable":"MERGEABLE","state":"OPEN"}}'
              exit 0
            fi
            {_FAKE_GH_GREEN_CHECKS}
            echo "unexpected gh args: $*" >&2
            exit 2
            """
        ),
    )
    return _run_bash(
        _release_command(
            tmp_path,
            extra_env=(
                "RELEASE_MODE=release DRY_RUN=1 ATTEMPT_COOLDOWN_MINUTES=0 "
                f'FLEET_RECEIPT_FILE="{receipt}"'
            ),
        )
    )


class TestReleaseQueueDeferred:
    def test_workflow_is_event_driven_with_no_cron(self) -> None:
        workflow = _RELEASE_WORKFLOW.read_text(encoding="utf-8")
        fleet_gate_refresh = _FLEET_GATE_REFRESH_WORKFLOW.read_text(encoding="utf-8")
        assert "schedule:" not in workflow
        assert "workflow_run:" in workflow
        # CI and Production Controller are direct upstream semantic inputs.
        # Marker Recovery dispatches a fresh Fleet Gate event after durable
        # bytes so downstream release remains inside the workflow_run cap.
        assert (
            "workflows: [CI, Production Controller]"
            in fleet_gate_refresh
        )
        assert "Production Marker Recovery]" not in fleet_gate_refresh
        assert "Queue-Deferred Release]" not in fleet_gate_refresh
        assert "workflows: ['Fleet Gate Refresh']" in workflow
        assert "workflows: ['CI', 'Production Controller', 'Fleet Gate Refresh']" not in workflow
        assert "pull_request_target:" in fleet_gate_refresh
        assert "\n  pull_request:\n" not in fleet_gate_refresh
        assert "converted_to_draft" in fleet_gate_refresh
        assert "github.event_name != 'pull_request_target'" in fleet_gate_refresh
        assert "branches: [main]" in fleet_gate_refresh
        assert "github.event.workflow_run.conclusion != 'cancelled'" in fleet_gate_refresh
        assert "github.event.pull_request.merged != true" in fleet_gate_refresh
        # The trigger allowlist owns workflow identity. Job admission must not
        # compare `workflow_run.name`: custom `run-name` values include dynamic
        # SHAs and caused successful Production Controller wakes to skip.
        assert "github.event.workflow_run.name" not in workflow
        assert "github.event.workflow_run.event == 'pull_request'" in workflow
        assert "github.event.workflow_run.event != 'pull_request'" in workflow
        assert "github.event.workflow_run.conclusion == 'success'" in workflow
        assert "github.event.workflow_run.conclusion != 'cancelled'" in workflow
        assert "pull-requests: write" in workflow
        assert "READY_GH_TOKEN" not in workflow
        assert "bash scripts/release-queue-deferred.sh" in workflow
        assert "ATTEMPT_COOLDOWN_MINUTES: 5" in workflow
        assert 'RELEASE_RETRY_FILE="$retry_file"' in workflow
        assert 'sleep "$retry_seconds"' in workflow
        assert "for pass in 1 2" in workflow
        # Mutations must fire real PR events that wake the autoenroll
        # controller; a GITHUB_TOKEN mutation would not cascade.
        assert "steps.app-token.outputs.token" in workflow

    def test_report_lists_age_and_typed_reason_with_alarm(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        _receipt_comment_body(tmp_path, head=head, deferred_minutes=120)
        stale_update = (
            datetime.now(timezone.utc) - timedelta(hours=3)
        ).isoformat()
        _write_fake_gh(
            tmp_path,
            textwrap.dedent(
                f"""\
                {_FAKE_GH_PREAMBLE}
                if [[ "$1 $2" == "pr list" ]]; then
                  cat <<'JSON'
                [{{"n":900,"t":"Symphony draft","draft":true,"m":"MERGEABLE","head":"symphony/JOV-900-fix","oid":"{head}","owner":"JovieInc","updated":"{stale_update}","L":["queue-deferred"]}},{{"n":901,"t":"Repair hold","draft":true,"m":"MERGEABLE","head":"codex/JOV-901-fix","oid":"{"d" * 40}","owner":"JovieInc","updated":"{stale_update}","L":["queue-deferred"]}}]
JSON
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ "$*" == *"issues/900/"* && "$*" != *"queue-deferral-release"* ]]; then
                    cat "${{FAKE_GH_STATE}}/../comments-900.json"
                  fi
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
        )

        result = _run_bash(
            _release_command(tmp_path, extra_env="RELEASE_MODE=report")
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "#900" in result.stdout
        assert "symphony-birth-hold" in result.stdout
        assert "#901" in result.stdout
        assert "untyped-ready-hold" in result.stdout
        assert "untyped-hold-manual-release-required" not in result.stdout
        assert "::warning::queue-deferred #900" in result.stdout
        assert "::warning::queue-deferred #901" in result.stdout

    def test_release_disabled_under_amber(self, tmp_path: Path) -> None:
        head = "c" * 40
        _receipt_comment_body(tmp_path, head=head)
        receipt = _fleet_receipt(tmp_path, state="AMBER")
        _write_fake_gh(
            tmp_path,
            textwrap.dedent(
                f"""\
                {_FAKE_GH_PREAMBLE}
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":900,"t":"Symphony draft","draft":true,"m":"MERGEABLE","head":"symphony/JOV-900-fix","oid":"{head}","owner":"JovieInc","updated":"2026-08-13T00:00:00Z","L":["queue-deferred"]}}]'
                  exit 0
                fi
                {_FAKE_GH_API_UNTYPED}
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
        )

        result = _run_bash(
            _release_command(
                tmp_path,
                extra_env=f'RELEASE_MODE=release FLEET_RECEIPT_FILE="{receipt}"',
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "fleet-gate-not-releasable:AMBER" in result.stdout
        log = (tmp_path / "gh-calls.log").read_text(encoding="utf-8")
        assert "pr edit" not in log
        assert "pr ready" not in log

    def test_release_disabled_with_stale_fleet_receipt(self, tmp_path: Path) -> None:
        receipt = _fleet_receipt(tmp_path, state="GREEN", age_minutes=30)
        _write_fake_gh(
            tmp_path,
            textwrap.dedent(
                f"""\
                {_FAKE_GH_PREAMBLE}
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[]'
                  exit 0
                fi
                {_FAKE_GH_API_UNTYPED}
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
        )

        result = _run_bash(
            _release_command(
                tmp_path,
                extra_env=f'RELEASE_MODE=release FLEET_RECEIPT_FILE="{receipt}"',
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "fleet-receipt-stale" in result.stdout

    def test_scanner_includes_non_agent_queue_deferred_prs(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        stale_update = (
            datetime.now(timezone.utc) - timedelta(hours=3)
        ).isoformat()
        _write_fake_gh(
            tmp_path,
            textwrap.dedent(
                f"""\
                {_FAKE_GH_PREAMBLE}
                if [[ "$1 $2" == "pr list" ]]; then
                  cat <<'JSON'
                [{{"n":15849,"t":"Non-agent ready PR","draft":false,"m":"MERGEABLE","head":"cursor/fix-shell-restore","oid":"{head}","owner":"JovieInc","updated":"{stale_update}","L":["queue-deferred"]}},{{"n":901,"t":"Human feat branch","draft":false,"m":"MERGEABLE","head":"feat/onboarding","oid":"{"d" * 40}","owner":"JovieInc","updated":"{stale_update}","L":["queue-deferred"]}}]
JSON
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
        )

        result = _run_bash(
            _release_command(tmp_path, extra_env="RELEASE_MODE=report")
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "scanning open queue-deferred PRs" in result.stdout
        assert "#15849" in result.stdout
        assert "#901" in result.stdout
        assert "untyped-ready-hold" in result.stdout

    def test_untyped_hold_on_ready_green_pr_is_released_under_green_fleet(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        result = _run_single_candidate_release(
            tmp_path,
            head=head,
            branch="cursor/fix-shell-restore",
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "untyped hold" in result.stdout
        assert "releasing only after fresh controller admission" in result.stdout
        assert "never released automatically" not in result.stdout
        assert "would remove `queue-deferred` from #900" in result.stdout

    def test_untyped_draft_hold_cannot_be_released(self, tmp_path: Path) -> None:
        head = "c" * 40
        result = _run_single_candidate_release(tmp_path, head=head, draft=True)

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "live state no longer matches the releasable snapshot" in result.stdout
        assert "would remove" not in result.stdout

    def test_untyped_hold_with_retired_taste_label_is_released(self, tmp_path: Path) -> None:
        head = "c" * 40
        result = _run_single_candidate_release(
            tmp_path,
            head=head,
            labels=["queue-deferred", "needs:taste"],
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "human-policy-hold" not in result.stdout
        assert "would remove `queue-deferred` from #900" in result.stdout

    def test_untyped_hold_with_net_new_label_is_released(self, tmp_path: Path) -> None:
        head = "c" * 40
        result = _run_single_candidate_release(
            tmp_path,
            head=head,
            labels=["queue-deferred", "net-new"],
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "human-policy-hold" not in result.stdout
        assert "would remove `queue-deferred` from #900" in result.stdout

    def test_untyped_hold_with_outbound_label_is_released(self, tmp_path: Path) -> None:
        head = "c" * 40
        result = _run_single_candidate_release(
            tmp_path,
            head=head,
            labels=["queue-deferred", "outbound"],
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "human-policy-hold" not in result.stdout
        assert "would remove `queue-deferred` from #900" in result.stdout

    def test_untyped_hold_stays_held_when_fleet_is_red(self, tmp_path: Path) -> None:
        head = "c" * 40
        result = _run_single_candidate_release(
            tmp_path,
            head=head,
            fleet_state="RED",
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "fleet-gate-not-releasable:RED" in result.stdout
        assert "would remove" not in result.stdout

    def test_untyped_hold_stays_held_when_production_receipt_is_stale(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        result = _run_single_candidate_release(
            tmp_path,
            head=head,
            fleet_state="GREEN",
            fleet_age_minutes=30,
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "fleet-receipt-stale" in result.stdout
        assert "would remove" not in result.stdout

    def test_recent_attempt_requests_bounded_in_run_retry(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        _receipt_comment_body(tmp_path, head=head)
        receipt = _fleet_receipt(tmp_path, state="GREEN")
        retry_file = tmp_path / "retry-after-seconds"
        attempted = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()
        _write_fake_gh(
            tmp_path,
            textwrap.dedent(
                f"""\
                {_FAKE_GH_PREAMBLE}
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":900,"t":"Symphony draft","draft":true,"m":"MERGEABLE","head":"symphony/JOV-900-fix","oid":"{head}","owner":"JovieInc","updated":"2026-08-13T00:00:00Z","L":["queue-deferred"]}}]'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ "$*" == *"queue-deferral-release"* ]]; then
                    echo '{attempted}'
                  else
                    cat "${{FAKE_GH_STATE}}/../comments-900.json"
                  fi
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
        )

        result = _run_bash(
            _release_command(
                tmp_path,
                extra_env=(
                    "RELEASE_MODE=release ATTEMPT_COOLDOWN_MINUTES=5 "
                    f'RELEASE_RETRY_FILE="{retry_file}" '
                    f'FLEET_RECEIPT_FILE="{receipt}"'
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "retry requested in 180s" in result.stdout
        assert retry_file.read_text(encoding="utf-8").strip() == "180"
        log = (tmp_path / "gh-calls.log").read_text(encoding="utf-8")
        assert "pr view" not in log
        assert "pr edit" not in log
        assert "pr ready" not in log

    def test_untrusted_comment_is_ignored_and_ready_untyped_hold_releases(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        _receipt_comment_body(tmp_path, head=head, author="random-contributor")
        result = _run_single_candidate_release(tmp_path, head=head)

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "untyped hold" in result.stdout
        assert "would remove `queue-deferred` from #900" in result.stdout

    def test_receipt_for_another_pr_is_treated_as_untyped_ready_hold(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        _receipt_comment_body(tmp_path, head=head, pr=901)
        result = _run_single_candidate_release(tmp_path, head=head)

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "deferral-receipt-pr-mismatch (receipt=#901, live=#900)" in result.stdout
        assert "treating as untyped ready hold" in result.stdout
        assert "would remove `queue-deferred` from #900" in result.stdout

    def test_receipt_for_another_repository_stays_held(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        _receipt_comment_body(tmp_path, head=head, repository="JovieInc/LogYourBody")
        result = _run_single_candidate_release(tmp_path, head=head)

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert (
            "deferral-receipt-repository-mismatch (receipt=JovieInc/LogYourBody, live=JovieInc/Jovie)"
            in result.stdout
        )
        assert "untyped-hold-manual-release-required" in result.stdout
        assert "would remove" not in result.stdout

    def test_head_stale_mechanical_receipt_is_released_against_live_head(
        self, tmp_path: Path
    ) -> None:
        live_head = "e" * 40
        _receipt_comment_body(tmp_path, head="f" * 40)
        result = _run_single_candidate_release(tmp_path, head=live_head)

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "deferral-receipt-head-stale" in result.stdout
        assert "evaluating live head" in result.stdout
        assert "would remove `queue-deferred` from #900" in result.stdout

    def test_queue_pressure_receipt_stays_held_while_live_pressure_is_high(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        _receipt_comment_body(
            tmp_path,
            head=head,
            reason="queue-pressure",
            source="agent-pipeline",
        )
        receipt = _fleet_receipt(tmp_path, state="GREEN")
        _write_fake_gh(
            tmp_path,
            textwrap.dedent(
                f"""\
                {_FAKE_GH_PREAMBLE}
                if [[ "$1 $2" == "pr list" && "$*" == *"number,title"* ]]; then
                  echo '[{{"n":900,"t":"Pressure hold","draft":true,"m":"MERGEABLE","head":"symphony/JOV-900-fix","oid":"{head}","owner":"JovieInc","updated":"2026-08-13T00:00:00Z","L":["queue-deferred"]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"number":901,"isDraft":false,"mergeStateStatus":"CLEAN","labels":[]}}]'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ "$*" != *"queue-deferral-release"* ]]; then
                    cat "${{FAKE_GH_STATE}}/../comments-900.json"
                  fi
                  exit 0
                fi
                {_FAKE_GH_GREEN_CHECKS}
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
        )

        result = _run_bash(
            _release_command(
                tmp_path,
                extra_env=(
                    "RELEASE_MODE=release DRY_RUN=1 ATTEMPT_COOLDOWN_MINUTES=0 "
                    "QUEUE_READY_THRESHOLD=1 "
                    f'FLEET_RECEIPT_FILE="{receipt}"'
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "queue pressure remains high (1 ready, threshold 1)" in result.stdout
        assert "would remove" not in result.stdout

    def test_non_main_live_target_cannot_be_released(self, tmp_path: Path) -> None:
        head = "c" * 40
        _receipt_comment_body(tmp_path, head=head)
        result = _run_single_candidate_release(
            tmp_path,
            head=head,
            base="symphony/JOV-899-stack",
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "live state no longer matches the releasable snapshot" in result.stdout
        assert "would remove" not in result.stdout

    def test_draft_hold_cannot_be_released_by_non_human_controller(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        _receipt_comment_body(tmp_path, head=head)
        result = _run_single_candidate_release(tmp_path, head=head, draft=True)

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "live state no longer matches the releasable snapshot" in result.stdout
        assert "would remove" not in result.stdout
        log = (tmp_path / "gh-calls.log").read_text(encoding="utf-8")
        assert "pr ready" not in log

    def test_green_receipt_releases_ready_typed_birth_hold(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        _receipt_comment_body(tmp_path, head=head)
        receipt = _fleet_receipt(tmp_path, state="GREEN")
        _write_fake_gh(
            tmp_path,
            textwrap.dedent(
                f"""\
                {_FAKE_GH_PREAMBLE}
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":900,"t":"Symphony PR","draft":false,"m":"MERGEABLE","head":"symphony/JOV-900-fix","oid":"{head}","owner":"JovieInc","updated":"2026-08-13T00:00:00Z","L":["queue-deferred"]}}]'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ "$*" != *"queue-deferral-release"* && "$*" != *"-X PATCH"* ]]; then
                    cat "${{FAKE_GH_STATE}}/../comments-900.json"
                  fi
                  exit 0
                fi
                {_FAKE_GH_GREEN_CHECKS}
                if [[ "$1 $2" == "pr view" ]]; then
                  if [[ -f "${{FAKE_GH_STATE}}/label_removed" ]]; then
                    echo '{{"draft":false,"head":"{head}","branch":"symphony/JOV-900-fix","headOwner":"JovieInc","base":"main","labels":[],"mergeable":"MERGEABLE","state":"OPEN"}}'
                  else
                    echo '{{"draft":false,"head":"{head}","branch":"symphony/JOV-900-fix","headOwner":"JovieInc","base":"main","labels":["queue-deferred"],"mergeable":"MERGEABLE","state":"OPEN"}}'
                  fi
                  exit 0
                fi
                if [[ "$1 $2" == "pr edit" ]]; then
                  touch "${{FAKE_GH_STATE}}/label_removed"
                  exit 0
                fi
                if [[ "$1 $2" == "pr comment" ]]; then
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
        )

        result = _run_bash(
            _release_command(
                tmp_path,
                extra_env=(
                    "RELEASE_MODE=release ATTEMPT_COOLDOWN_MINUTES=0 "
                    f'FLEET_RECEIPT_FILE="{receipt}"'
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "✓ removed `queue-deferred` from #900" in result.stdout
        log = (tmp_path / "gh-calls.log").read_text(encoding="utf-8")
        assert "--remove-label queue-deferred" in log
        assert "pr ready" not in log
        assert "--add-label queue-deferred" not in log, "no compensating restore expected"
