"""
Regression tests for scripts/lib/gh-retry.sh.

The merge-queue enroll job calls drain-pr-queue.sh, which must survive
transient GitHub GraphQL 504s instead of failing the workflow.

Run with:
    python -m pytest scripts/tests/test_gh_retry.py -v
"""
from __future__ import annotations

import os
import stat
import subprocess
import textwrap
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[2]
_GH_RETRY = _REPO_ROOT / "scripts" / "lib" / "gh-retry.sh"
_DRAIN_SCRIPT = _REPO_ROOT / "scripts" / "drain-pr-queue.sh"


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


class TestDrainPrQueueWiring:
    def test_drain_script_avoids_bulk_status_rollup_and_uses_per_pr_checks(self) -> None:
        content = _DRAIN_SCRIPT.read_text(encoding="utf-8")
        assert 'source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"' in content
        assert 'gh_retry pr list' in content
        assert "--limit 200" in content
        assert "statusCheckRollup" not in content
        assert "gh pr checks" in content
        assert "--required" in content
        assert "--remove-label" in content
        assert "tim-approved" not in content
        assert "approved:taste" not in content

    def test_merge_queue_autoenroll_runs_drain_remediation(self) -> None:
        workflow = (
            _REPO_ROOT / ".github" / "workflows" / "merge-queue-autoenroll.yml"
        ).read_text(encoding="utf-8")
        assert "drain-pr-remediate.mjs" in workflow
        assert "--apply" in workflow

    def test_agent_remediation_workflow_exists(self) -> None:
        workflow = (
            _REPO_ROOT / ".github" / "workflows" / "agent-remediation.yml"
        ).read_text(encoding="utf-8")
        assert "agent-remediation-requested" in workflow
        assert "drain-pr-remediate.mjs" in workflow

    def test_red_required_checks_block_enqueue(self, tmp_path: Path) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  cat <<'JSON'
                [{"n":123,"t":"Red CI PR","draft":false,"m":"MERGEABLE","head":"codex/jov-123-red","L":[],"fail":[]}]
JSON
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '["Typecheck"]'
                  exit 1
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(
            f'PATH="{tmp_path}:$PATH" DRY_RUN=1 bash "{_DRAIN_SCRIPT}"'
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "[dry-run] would +merge-queue on #123" not in result.stdout
        assert "=== BLOCKED (red checks" in result.stdout
        assert "#123" in result.stdout
        assert "Typecheck" in result.stdout

    def test_hard_gated_prs_dequeue_and_do_not_enqueue(self, tmp_path: Path) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  cat <<'JSON'
                [{"n":456,"t":"Taste approved PR","draft":false,"m":"MERGEABLE","head":"codex/jov-456-taste","L":["needs-human","approved:taste"],"fail":[]},{"n":789,"t":"Human gated PR","draft":false,"m":"MERGEABLE","head":"codex/jov-789-human","L":["needs-human","merge-queue"],"fail":[]},{"n":101,"t":"Clean PR","draft":false,"m":"MERGEABLE","head":"codex/jov-101-clean","L":[],"fail":[]}]
JSON
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  [[ "$3" == "101" ]]
                  echo '[]'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(
            f'PATH="{tmp_path}:$PATH" DRY_RUN=1 bash "{_DRAIN_SCRIPT}"'
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "=== DEQUEUE (hard gates" in result.stdout
        assert "[dry-run] would -merge-queue on #789" in result.stdout
        assert "[dry-run] would +merge-queue on #101" in result.stdout
        assert "[dry-run] would +merge-queue on #456" not in result.stdout
        assert "[dry-run] would +merge-queue on #789" not in result.stdout
        assert "=== SURFACE (human decision; not touched) ===" in result.stdout
        assert "#456" in result.stdout
        assert "#789" in result.stdout

    def test_nonzero_checks_with_valid_json_do_not_abort_drain(self, tmp_path: Path) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  cat <<'JSON'
                [{"n":321,"t":"Clean nonzero checks","draft":false,"m":"MERGEABLE","head":"codex/jov-321-clean","L":[],"fail":[]}]
JSON
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[]'
                  exit 8
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(
            f'PATH="{tmp_path}:$PATH" DRY_RUN=1 bash "{_DRAIN_SCRIPT}"'
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "[dry-run] would +merge-queue on #321" in result.stdout

    def test_required_check_lookup_retries_transient_failures(self, tmp_path: Path) -> None:
        counter = tmp_path / "checks"
        counter.write_text("0", encoding="utf-8")
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  cat <<'JSON'
                [{"n":654,"t":"Retry checks PR","draft":false,"m":"MERGEABLE","head":"codex/jov-654-retry","L":[],"fail":[]}]
JSON
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  count_file="${GH_RETRY_TEST_COUNTER:?}"
                  count=$(<"$count_file")
                  count=$((count + 1))
                  echo "$count" >"$count_file"
                  if [[ "$count" -lt 2 ]]; then
                    echo "HTTP 504: We couldn't respond to your request in time." >&2
                    exit 1
                  fi
                  echo '[]'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(
            f'PATH="{tmp_path}:$PATH" GH_RETRY_BASE_DELAY=0 GH_RETRY_TEST_COUNTER="{counter}" DRY_RUN=1 bash "{_DRAIN_SCRIPT}"'
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "[dry-run] would +merge-queue on #654" in result.stdout
        assert "gh-retry" in result.stderr
        assert counter.read_text(encoding="utf-8").strip() == "2"

    def test_queued_conflict_is_dequeued_and_labeled_for_resolution(self, tmp_path: Path) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  cat <<'JSON'
                [{"n":777,"t":"Queued conflict","draft":false,"m":"CONFLICTING","ms":"DIRTY","head":"codex/jov-777-conflict","L":["merge-queue"],"fail":[]}]
JSON
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(
            f'PATH="{tmp_path}:$PATH" DRY_RUN=1 bash "{_DRAIN_SCRIPT}"'
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "DIRTY: 1" in result.stdout
        assert "=== DEQUEUE (conflict / failing" in result.stdout
        assert "[dry-run] would -merge-queue on #777" in result.stdout
        assert "[dry-run] would +needs-conflict-resolution on #777" in result.stdout
        assert "[dry-run] would +merge-queue on #777" not in result.stdout

    def test_queued_red_required_checks_are_dequeued(self, tmp_path: Path) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  cat <<'JSON'
                [{"n":888,"t":"Queued red CI","draft":false,"m":"MERGEABLE","ms":"BLOCKED","head":"codex/jov-888-red","L":["merge-queue"],"fail":[]}]
JSON
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '["PR Ready"]'
                  exit 1
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(
            f'PATH="{tmp_path}:$PATH" DRY_RUN=1 bash "{_DRAIN_SCRIPT}"'
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "BLOCKED: 1" in result.stdout
        assert "[dry-run] would -merge-queue on #888" in result.stdout
        assert "checks=PR Ready" in result.stdout
        assert "=== BLOCKED (red checks" in result.stdout
        assert "#888" in result.stdout
        assert "[dry-run] would +merge-queue on #888" not in result.stdout

    def test_unstable_state_with_no_failures_stays_enrolled(
        self, tmp_path: Path
    ) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  cat <<'JSON'
                [{"n":889,"t":"Queued stale Graphite state","draft":false,"m":"MERGEABLE","ms":"UNSTABLE","head":"codex/jov-889-unstable","L":["merge-queue"],"fail":[]}]
JSON
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[]'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(
            f'PATH="{tmp_path}:$PATH" DRY_RUN=1 bash "{_DRAIN_SCRIPT}"'
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "UNSTABLE: 1" in result.stdout
        # 2026-06-22 stall fix: a MERGEABLE PR that is UNSTABLE/BLOCKED only because
        # of a zombie cancelled/queued required-check (no TERMINAL failure) must NOT
        # be dequeued. It stays enrolled and untouched so Graphite can land it.
        assert "[dry-run] would -merge-queue on #889" not in result.stdout
        assert "[dry-run] would +merge-queue on #889" not in result.stdout

    def test_gtmq_drafts_are_report_only_even_when_labeled(self, tmp_path: Path) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  cat <<'JSON'
                [{"n":999,"t":"Graphite draft","draft":false,"m":"CONFLICTING","ms":"DIRTY","head":"gtmq_spec_abc123","L":["merge-queue","needs-conflict-resolution"],"fail":[]}]
JSON
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(
            f'PATH="{tmp_path}:$PATH" DRY_RUN=1 bash "{_DRAIN_SCRIPT}"'
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "gtmq: 1" in result.stdout
        assert "=== GRAPHITE MQ in-flight (leave) ===" in result.stdout
        assert "#999" in result.stdout
        assert "[dry-run] would -merge-queue on #999" not in result.stdout
        assert "[dry-run] would +needs-conflict-resolution on #999" not in result.stdout
