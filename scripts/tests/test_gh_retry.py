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

    def test_drain_remediate_script_exists(self) -> None:
        remediate = _REPO_ROOT / "scripts" / "drain-pr-remediate.mjs"
        assert remediate.is_file()
        content = remediate.read_text(encoding="utf-8")
        assert "listBlockedAgentPrs" in content
        assert "force-with-lease" in content

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
        assert "=== GRAPHITE MQ synthetic drafts ===" in result.stdout
        assert "#999" in result.stdout
        assert "ACTIVE/PRESERVE (synthetic branch is not a draft)" in result.stdout
        assert "[dry-run] would -merge-queue on #999" not in result.stdout
        assert "[dry-run] would +needs-conflict-resolution on #999" not in result.stdout

    def test_gtmq_orphan_dry_run_reports_without_mutation(self, tmp_path: Path) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                echo "$*" >> "{tmp_path}/calls.log"
                if [[ "$1 $2" == "pr list" ]]; then
                  cat <<'JSON'
                [{{"n":1001,"t":"Graphite orphan","body":"Sources: https://app.graphite.com/github/pr/JovieInc/Jovie/41 and https://github.com/JovieInc/Jovie/pull/42","draft":true,"m":"CONFLICTING","ms":"DIRTY","head":"gtmq_spec_orphan","L":[],"fail":[]}}]
JSON
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  [[ "$3" == "41" ]] && echo MERGED || echo CLOSED
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
        assert "#1001  Graphite orphan  ORPHAN (#41=MERGED, #42=CLOSED)" in result.stdout
        assert "[dry-run] would comment root cause and close orphaned Graphite draft #1001" in result.stdout
        calls = (tmp_path / "calls.log").read_text(encoding="utf-8")
        assert "pr comment" not in calls
        assert "pr close" not in calls

    def test_gtmq_active_source_preserves_draft(self, tmp_path: Path) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                echo "$*" >> "{tmp_path}/calls.log"
                if [[ "$1 $2" == "pr list" ]]; then
                  cat <<'JSON'
                [{{"n":1002,"t":"Graphite active","body":"* https://app.graphite.com/github/pr/JovieInc/Jovie/51\\n* https://app.graphite.com/github/pr/JovieInc/Jovie/52","draft":true,"m":"MERGEABLE","ms":"CLEAN","head":"gtmq_spec_active","L":[],"fail":[]}}]
JSON
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  [[ "$3" == "51" ]] && echo CLOSED || echo OPEN
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
            f'PATH="{tmp_path}:$PATH" DRY_RUN=0 bash "{_DRAIN_SCRIPT}"'
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "ACTIVE/PRESERVE (#51=CLOSED, #52=OPEN)" in result.stdout
        calls = (tmp_path / "calls.log").read_text(encoding="utf-8")
        assert "pr comment" not in calls
        assert "pr close" not in calls

    def test_gtmq_orphan_live_mode_comments_before_close(self, tmp_path: Path) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                echo "$*" >> "{tmp_path}/calls.log"
                if [[ "$1 $2" == "pr list" ]]; then
                  cat <<'JSON'
                [{{"n":1003,"t":"Graphite orphan","body":"https://app.graphite.com/github/pr/JovieInc/Jovie/61","draft":true,"m":"CONFLICTING","ms":"DIRTY","head":"gtmq_spec_closed","L":[],"fail":[]}}]
JSON
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then echo MERGED; exit 0; fi
                if [[ "$1 $2" == "pr comment" || "$1 $2" == "pr close" ]]; then exit 0; fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(
            f'PATH="{tmp_path}:$PATH" DRY_RUN=0 bash "{_DRAIN_SCRIPT}"'
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "closed orphaned Graphite draft #1003" in result.stdout
        calls = (tmp_path / "calls.log").read_text(encoding="utf-8").splitlines()
        comment_index = next(i for i, call in enumerate(calls) if call.startswith("pr comment 1003"))
        close_index = next(i for i, call in enumerate(calls) if call.startswith("pr close 1003"))
        assert comment_index < close_index
        assert "Root cause: this Graphite merge-queue synthetic draft is orphaned" in calls[comment_index]


class TestMergeQueueWatchdog:
    """
    Regression tests for scripts/merge-queue-watchdog.sh.

    The watchdog rescues PRs stalled *inside* the merge queue (already
    labeled `merge-queue`, but Graphite has stopped progressing on them).
    It is distinct from drain-pr-queue.sh, which only handles enrollment.
    """

    @staticmethod
    def _fake_gh(
        tmp_path: Path,
        *,
        pr_list_json: str,
        timeline_by_pr: dict[int, str] | None = None,
        comments_by_pr: dict[int, str] | None = None,
        checks_by_pr: dict[int, tuple[str, int]] | None = None,
    ) -> Path:
        """Write a fake `gh` that answers pr list / api timeline / api comments /
        pr checks / pr edit for the watchdog script's exact call shapes."""
        timeline_by_pr = timeline_by_pr or {}
        comments_by_pr = comments_by_pr or {}
        checks_by_pr = checks_by_pr or {}

        # `gh api ... --jq FILTER` applies FILTER server-side before returning
        # output. Fixtures below provide the raw (unfiltered) API payload; the
        # fake `gh` runs it through the real `jq` binary using whatever --jq
        # expression was passed on argv, matching real `gh` behavior exactly.
        timeline_cases = "\n".join(
            f'''  if [[ "$path" == "repos/JovieInc/Jovie/issues/{n}/timeline" ]]; then
    echo '{body}' | jq -r "$jq_filter"
    exit 0
  fi'''
            for n, body in timeline_by_pr.items()
        )
        comments_cases = "\n".join(
            f'''  if [[ "$path" == "repos/JovieInc/Jovie/issues/{n}/comments" ]]; then
    echo '{body}' | jq -r "$jq_filter"
    exit 0
  fi'''
            for n, body in comments_by_pr.items()
        )
        checks_cases = "\n".join(
            f'''  if [[ "$n" == "{n}" ]]; then
    echo '{out}'
    exit {code}
  fi'''
            for n, (out, code) in checks_by_pr.items()
        )

        script = textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            set -euo pipefail
            if [[ "$1 $2" == "pr list" ]]; then
              cat <<'JSON'
{pr_list_json}
JSON
              exit 0
            fi
            if [[ "$1" == "api" ]]; then
              path="$2"
              jq_filter="."
              for ((i=3; i<=$#; i++)); do
                if [[ "${{!i}}" == "--jq" ]]; then
                  j=$((i+1))
                  jq_filter="${{!j}}"
                fi
              done
{textwrap.indent(timeline_cases, "  ")}
{textwrap.indent(comments_cases, "  ")}
              # default: empty timeline/comments
              echo '[]' | jq -r "$jq_filter"
              exit 0
            fi
            if [[ "$1 $2" == "pr checks" ]]; then
              n="$3"
{textwrap.indent(checks_cases, "  ")}
              echo '[]'
              exit 0
            fi
            if [[ "$1 $2" == "pr edit" ]]; then
              echo "edit $*" >> "{tmp_path}/edits.log"
              exit 0
            fi
            if [[ "$1 $2" == "pr comment" ]]; then
              echo "comment $*" >> "{tmp_path}/edits.log"
              exit 0
            fi
            echo "unexpected gh args: $*" >&2
            exit 2
            """
        )
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(script, encoding="utf-8")
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        return fake_gh

    def _run_watchdog(
        self, tmp_path: Path, *, extra_env: str = "", dry_run: bool = True
    ) -> subprocess.CompletedProcess[str]:
        dry_run_flag = "DRY_RUN=1" if dry_run else "DRY_RUN=0"
        return _run_bash(
            f'PATH="{tmp_path}:$PATH" {dry_run_flag} REPO=JovieInc/Jovie {extra_env} '
            f'bash "{_WATCHDOG_SCRIPT}"'
        )

    @staticmethod
    def _stale_ts(minutes: int = 120) -> str:
        """A merge-queue label timestamp `minutes` in the past — recently stale.

        Fixtures must use realistic stall ages: the watchdog now treats stalls
        beyond MAX_STALL_MINUTES (7 days) as data errors from unset/zeroed
        timestamps and skips them (#13343), so a hardcoded 2020 date would be
        rejected rather than kicked.
        """
        import datetime

        return (
            datetime.datetime.now(datetime.timezone.utc)
            - datetime.timedelta(minutes=minutes)
        ).strftime("%Y-%m-%dT%H:%M:%SZ")

    def test_stale_clean_pr_gets_label_cycled(self, tmp_path: Path) -> None:
        stale_ts = self._stale_ts()
        pr_list = (
            '[{"n":100,"t":"Stale clean PR","m":"MERGEABLE","ms":"CLEAN",'
            '"head":"tim/jov-100","L":["merge-queue"]}]'
        )
        timeline = (
            f'[{{"event":"labeled","label":{{"name":"merge-queue"}},'
            f'"created_at":"{stale_ts}"}}]'
        )
        self._fake_gh(
            tmp_path,
            pr_list_json=pr_list,
            timeline_by_pr={100: timeline},
            comments_by_pr={100: "[]"},
            checks_by_pr={100: ("[]", 0)},
        )

        result = self._run_watchdog(tmp_path, extra_env="STALL_MINUTES=45")

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "[dry-run] would -merge-queue on #100" in result.stdout
        assert "[dry-run] would +merge-queue on #100" in result.stdout
        assert "kicked (label-cycled): 1" in result.stdout

    def test_freshly_labeled_pr_is_skipped(self, tmp_path: Path) -> None:
        fresh_ts = subprocess.run(
            ["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"], capture_output=True, text=True, check=True
        ).stdout.strip()
        pr_list = (
            '[{"n":101,"t":"Fresh PR","m":"MERGEABLE","ms":"CLEAN",'
            '"head":"tim/jov-101","L":["merge-queue"]}]'
        )
        timeline = (
            f'[{{"event":"labeled","label":{{"name":"merge-queue"}},'
            f'"created_at":"{fresh_ts}"}}]'
        )
        self._fake_gh(
            tmp_path,
            pr_list_json=pr_list,
            timeline_by_pr={101: timeline},
            comments_by_pr={101: "[]"},
            checks_by_pr={101: ("[]", 0)},
        )

        result = self._run_watchdog(tmp_path, extra_env="STALL_MINUTES=45")

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "[dry-run] would -merge-queue on #101" not in result.stdout
        assert "[dry-run] would +merge-queue on #101" not in result.stdout
        assert "kicked (label-cycled): 0" in result.stdout
        assert "skipped (fresh, <45m): 1" in result.stdout

    def test_recent_kick_is_skipped_via_cooldown(self, tmp_path: Path) -> None:
        stale_ts = self._stale_ts()
        recent_kick_ts = subprocess.run(
            ["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"], capture_output=True, text=True, check=True
        ).stdout.strip()
        pr_list = (
            '[{"n":102,"t":"Cooldown PR","m":"MERGEABLE","ms":"CLEAN",'
            '"head":"tim/jov-102","L":["merge-queue"]}]'
        )
        timeline = (
            f'[{{"event":"labeled","label":{{"name":"merge-queue"}},'
            f'"created_at":"{stale_ts}"}}]'
        )
        comments = (
            '[{"body":"<!-- bot-comment:merge-queue-watchdog-kick -->already kicked",'
            f'"updated_at":"{recent_kick_ts}"}}]'
        )
        self._fake_gh(
            tmp_path,
            pr_list_json=pr_list,
            timeline_by_pr={102: timeline},
            comments_by_pr={102: comments},
            checks_by_pr={102: ("[]", 0)},
        )

        result = self._run_watchdog(
            tmp_path, extra_env="STALL_MINUTES=45 COOLDOWN_HOURS=2"
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "STALLED but in cooldown" in result.stdout
        assert "kicked (label-cycled): 0" in result.stdout
        assert "skipped (cooldown): 1" in result.stdout

    def test_conflicting_pr_gets_conflict_label_without_dequeue(
        self, tmp_path: Path
    ) -> None:
        stale_ts = self._stale_ts()
        pr_list = (
            '[{"n":103,"t":"Conflicting PR","m":"CONFLICTING","ms":"DIRTY",'
            '"head":"tim/jov-103","L":["merge-queue"]}]'
        )
        timeline = (
            f'[{{"event":"labeled","label":{{"name":"merge-queue"}},'
            f'"created_at":"{stale_ts}"}}]'
        )
        self._fake_gh(
            tmp_path,
            pr_list_json=pr_list,
            timeline_by_pr={103: timeline},
            comments_by_pr={103: "[]"},
        )

        result = self._run_watchdog(tmp_path, extra_env="STALL_MINUTES=45")

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "[dry-run] would +needs-conflict-resolution on #103" in result.stdout
        assert "[dry-run] would -merge-queue on #103" not in result.stdout
        assert "conflicts flagged: 1" in result.stdout

    def test_terminal_red_check_dequeues(self, tmp_path: Path) -> None:
        stale_ts = self._stale_ts()
        pr_list = (
            '[{"n":104,"t":"Red CI PR","m":"MERGEABLE","ms":"CLEAN",'
            '"head":"tim/jov-104","L":["merge-queue"]}]'
        )
        timeline = (
            f'[{{"event":"labeled","label":{{"name":"merge-queue"}},'
            f'"created_at":"{stale_ts}"}}]'
        )
        self._fake_gh(
            tmp_path,
            pr_list_json=pr_list,
            timeline_by_pr={104: timeline},
            comments_by_pr={104: "[]"},
            checks_by_pr={104: ('["Typecheck"]', 1)},
        )

        result = self._run_watchdog(tmp_path, extra_env="STALL_MINUTES=45")

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "[dry-run] would -merge-queue on #104" in result.stdout
        assert "[dry-run] would +merge-queue on #104" not in result.stdout
        assert "dequeued (terminal red): 1" in result.stdout

    def test_pending_and_cancelled_checks_do_not_count_as_failures(
        self, tmp_path: Path
    ) -> None:
        # gh pr checks --required with --jq exits 8 on pending checks even with
        # valid JSON output (same behavior drain-pr-queue.sh guards against).
        stale_ts = self._stale_ts()
        pr_list = (
            '[{"n":105,"t":"Pending checks PR","m":"MERGEABLE","ms":"UNSTABLE",'
            '"head":"tim/jov-105","L":["merge-queue"]}]'
        )
        timeline = (
            f'[{{"event":"labeled","label":{{"name":"merge-queue"}},'
            f'"created_at":"{stale_ts}"}}]'
        )
        self._fake_gh(
            tmp_path,
            pr_list_json=pr_list,
            timeline_by_pr={105: timeline},
            comments_by_pr={105: "[]"},
            checks_by_pr={105: ("[]", 8)},
        )

        result = self._run_watchdog(tmp_path, extra_env="STALL_MINUTES=45")

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        # Pending checks are NOT a terminal failure, so this must not dequeue —
        # it falls through to the stuck-clean kick path instead.
        assert "dequeued (terminal red): 0" in result.stdout
        assert "kicked (label-cycled): 1" in result.stdout

    def test_epoch_zero_timestamp_is_skipped_not_kicked(self, tmp_path: Path) -> None:
        # Regression for #13343: an unset/epoch-0 enqueue timestamp computed a
        # ~29.7M-minute "stall" and mass label-cycled freshly-enrolled PRs.
        # Timestamps before 2020 are unset/zeroed data — skip, never kick.
        pr_list = (
            '[{"n":106,"t":"Epoch-zero PR","m":"MERGEABLE","ms":"CLEAN",'
            '"head":"tim/jov-106","L":["merge-queue"]}]'
        )
        timeline = (
            '[{"event":"labeled","label":{"name":"merge-queue"},'
            '"created_at":"1970-01-01T00:00:00Z"}]'
        )
        self._fake_gh(
            tmp_path,
            pr_list_json=pr_list,
            timeline_by_pr={106: timeline},
            comments_by_pr={106: "[]"},
            checks_by_pr={106: ("[]", 0)},
        )

        result = self._run_watchdog(tmp_path, extra_env="STALL_MINUTES=45")

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "no valid merge-queue label timestamp" in result.stdout
        assert "kicked (label-cycled): 0" in result.stdout
        assert "would -merge-queue" not in result.stdout

    def test_absurdly_old_stall_is_treated_as_data_error(self, tmp_path: Path) -> None:
        # Regression for #13343: a computed stall beyond MAX_STALL_MINUTES
        # (default 7 days) can only come from bad timestamp data — the
        # watchdog must skip it rather than kick, and must cite the timestamp.
        pr_list = (
            '[{"n":107,"t":"Ancient stall PR","m":"MERGEABLE","ms":"CLEAN",'
            '"head":"tim/jov-107","L":["merge-queue"]}]'
        )
        timeline = (
            '[{"event":"labeled","label":{"name":"merge-queue"},'
            '"created_at":"2024-01-01T00:00:00Z"}]'
        )
        self._fake_gh(
            tmp_path,
            pr_list_json=pr_list,
            timeline_by_pr={107: timeline},
            comments_by_pr={107: "[]"},
            checks_by_pr={107: ("[]", 0)},
        )

        result = self._run_watchdog(tmp_path, extra_env="STALL_MINUTES=45")

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "sanity cap" in result.stdout
        assert "2024-01-01T00:00:00Z" in result.stdout
        assert "kicked (label-cycled): 0" in result.stdout
