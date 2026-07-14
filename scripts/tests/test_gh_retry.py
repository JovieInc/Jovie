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
_GTMQ_GUARD = _REPO_ROOT / "scripts" / "guard-gtmq-source-authorization.sh"
_GTMQ_WORKFLOW = _REPO_ROOT / ".github" / "workflows" / "gtmq-source-authorization.yml"


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


def _drain_command(
    tmp_path: Path,
    *,
    extra_env: str = "",
    expected_gh: Path | None = None,
) -> str:
    fake_gh = tmp_path / "gh"
    assert fake_gh.is_file(), f"test must create isolated gh fixture first: {fake_gh}"
    expected = expected_gh or fake_gh
    env_prefix = (
        f'PATH="{tmp_path}:$PATH" '
        f'DRAIN_EXPECT_GH="{expected}" '
        'DRAIN_MUTATION_AUTHORIZATION=test-fixture '
    )
    if extra_env:
        env_prefix += f"{extra_env} "
    return f'{env_prefix}bash "{_DRAIN_SCRIPT}"'


def _guard_command(tmp_path: Path, *args: str | int, extra_env: str = "") -> str:
    fake_gh = tmp_path / "gh"
    assert fake_gh.is_file(), f"test must create isolated gh fixture first: {fake_gh}"
    env_prefix = (
        f'PATH="{tmp_path}:$PATH" DRAIN_EXPECT_GH="{fake_gh}" '
        'GTMQ_MUTATION_AUTHORIZATION=test-fixture '
    )
    if extra_env:
        env_prefix += f"{extra_env} "
    arguments = " ".join(str(arg) for arg in args)
    return f'{env_prefix}bash "{_GTMQ_GUARD}" {arguments}'


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
    def test_live_drain_refuses_before_calling_gh_when_fixture_path_mismatches(
        self, tmp_path: Path
    ) -> None:
        called = tmp_path / "called"
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            f"#!/usr/bin/env bash\ntouch '{called}'\nexit 99\n",
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                expected_gh=Path("/definitely/not/the/fixture"),
            )
        )

        assert result.returncode == 2
        assert "Refusing drain" in result.stderr
        assert not called.exists(), "drain invoked gh before isolation preflight"

    def test_live_mutation_tests_centralize_exact_fake_gh_preflight(self) -> None:
        source = Path(__file__).read_text(encoding="utf-8")
        helper_launches = [
            line.strip()
            for line in source.splitlines()
            if line.strip().startswith("return f'{env_prefix}bash")
        ]
        assert helper_launches == [
            "return f'{env_prefix}bash \"{_DRAIN_SCRIPT}\"'",
            "return f'{env_prefix}bash \"{_GTMQ_GUARD}\" {arguments}'",
        ]
        assert 'DRAIN_EXPECT_GH="{fake_gh}"' in source
        assert "DRAIN_MUTATION_AUTHORIZATION=test-fixture" in source
        assert "GTMQ_MUTATION_AUTHORIZATION=test-fixture" in source

    def test_drain_script_avoids_bulk_status_rollup_and_uses_per_pr_checks(self) -> None:
        content = _DRAIN_SCRIPT.read_text(encoding="utf-8")
        assert 'source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"' in content
        assert 'gh_retry pr list' in content
        assert "--limit 200" in content
        assert "statusCheckRollup" not in content
        assert "gh pr checks" in content
        assert "--json name,bucket,state,workflow,description,startedAt,completedAt" in content
        assert "--remove-label" in content
        assert "DRAIN_MUTATION_AUTHORIZATION" in content
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
                  echo '[{"name":"Typecheck","bucket":"fail","state":"FAILURE"}]'
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
            _drain_command(tmp_path, extra_env="DRY_RUN=1")
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
                [{"n":456,"t":"Taste approved PR","draft":false,"m":"MERGEABLE","head":"codex/jov-456-taste","L":["needs-human","approved:taste"],"fail":[]},{"n":789,"t":"Human gated PR","draft":false,"m":"MERGEABLE","head":"codex/jov-789-human","L":["needs-human","merge-queue"],"fail":[]},{"n":102,"t":"Deferred PR","draft":false,"m":"MERGEABLE","head":"codex/jov-102-deferred","L":["queue-deferred","merge-queue"],"fail":[]},{"n":103,"t":"Draft PR","draft":true,"m":"MERGEABLE","head":"codex/jov-103-draft","L":["merge-queue"],"fail":[]},{"n":101,"t":"Clean PR","draft":false,"m":"MERGEABLE","head":"codex/jov-101-clean","L":[],"fail":[]}]
JSON
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  [[ "$3" == "101" ]]
                  echo '[{"name":"CI / PR Ready","bucket":"pass","state":"SUCCESS"},{"name":"CI / Migration Guard","bucket":"pass","state":"SUCCESS"},{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"},{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[]}'
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
            _drain_command(tmp_path, extra_env="DRY_RUN=1")
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "=== DEQUEUE (hard gates" in result.stdout
        assert "[dry-run] would -merge-queue on #789" in result.stdout
        assert "[dry-run] would -merge-queue on #102" in result.stdout
        assert "[dry-run] would -merge-queue on #103" in result.stdout
        assert "[dry-run] would +merge-queue on #101" in result.stdout
        assert "[dry-run] would +merge-queue on #456" not in result.stdout
        assert "[dry-run] would +merge-queue on #789" not in result.stdout
        assert "[dry-run] would +merge-queue on #102" not in result.stdout
        assert "[dry-run] would +merge-queue on #103" not in result.stdout
        assert "=== SURFACE (human decision; not touched) ===" in result.stdout
        assert "#456" in result.stdout
        assert "#789" in result.stdout


class TestGraphiteEventAuthorizationGuard:
    def test_workflow_covers_synthetic_and_source_events_with_minimum_permissions(self) -> None:
        workflow = _GTMQ_WORKFLOW.read_text(encoding="utf-8")
        assert "pull_request_target:" in workflow
        for event_type in (
            "opened",
            "synchronize",
            "reopened",
            "closed",
            "labeled",
            "unlabeled",
            "converted_to_draft",
            "ready_for_review",
        ):
            assert event_type in workflow
        assert (
            "group: gtmq-source-authorization-${{ github.event.pull_request.number }}"
            in workflow
        )
        assert "cancel-in-progress: false" in workflow
        assert "contents: read" in workflow
        assert "issues: write" in workflow
        assert "pull-requests: write" in workflow
        assert "ref: main" in workflow
        assert "persist-credentials: false" in workflow
        assert "guard-gtmq-source-authorization.sh" in workflow
        assert '[[ "$EVENT_HEAD_REF" == gtmq_* ]]' in workflow
        assert '--synthetic-event "$EVENT_PR_NUMBER"' in workflow
        assert '--source-event "$EVENT_ACTION"' in workflow
        assert "drain-pr-queue.sh" not in workflow

    def test_opened_synthetic_with_revoked_source_is_closed_and_verified(
        self, tmp_path: Path
    ) -> None:
        calls = tmp_path / "calls"
        event_views = tmp_path / "event-views"
        event_views.write_text("0", encoding="utf-8")
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2 $3" == "pr view 14328" ]]; then
                  count=$(<"{event_views}")
                  count=$((count + 1))
                  echo "$count" >"{event_views}"
                  if [[ "$count" == 1 ]]; then
                    echo '{{"number":14328,"title":"Graphite batch","body":"https://github.com/JovieInc/Jovie/pull/14279","headRefName":"gtmq_14279","state":"OPEN"}}'
                  else
                    echo '{{"state":"CLOSED"}}'
                  fi
                  exit 0
                fi
                if [[ "$1 $2 $3" == "pr view 14279" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"labels":[{{"name":"gated"}}]}}'
                  exit 0
                fi
                if [[ "$1 $2 $3" == "pr close 14328" ]]; then
                  echo "$*" >>"{calls}"
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(_guard_command(tmp_path, "--synthetic-event", 14328))

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "source #14279 is OPEN with hard gate(s): gated" in result.stdout
        assert "closed unauthorized Graphite synthetic #14328" in result.stdout
        assert "Durable guard: #14312" in calls.read_text(encoding="utf-8")

    def test_active_synthetic_is_preserved(self, tmp_path: Path) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2 $3" == "pr view 14330" ]]; then
                  echo '{"number":14330,"title":"Active batch","body":"https://github.com/JovieInc/Jovie/pull/14280","headRefName":"gtmq_14280","state":"OPEN"}'
                  exit 0
                fi
                if [[ "$1 $2 $3" == "pr view 14280" ]]; then
                  echo '{"state":"OPEN","isDraft":false,"labels":[{"name":"merge-queue"}]}'
                  exit 0
                fi
                if [[ "$1 $2" == "pr close" ]]; then
                  exit 9
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(_guard_command(tmp_path, "--synthetic-event", 14330))

        assert result.returncode == 0, result.stderr
        assert "ACTIVE/PRESERVE" in result.stdout

    def test_source_closed_event_rescans_and_closes_existing_synthetic(
        self, tmp_path: Path
    ) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2 $3" == "pr view 14279" ]]; then
                  echo '{{"state":"CLOSED","isDraft":false,"labels":[]}}'
                  exit 0
                fi
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"number":14328,"title":"Existing batch","body":"https://github.com/JovieInc/Jovie/pull/14279","headRefName":"gtmq_14279"}}]'
                  exit 0
                fi
                if [[ "$1 $2 $3" == "pr close 14328" ]]; then
                  exit 0
                fi
                if [[ "$1 $2 $3" == "pr view 14328" ]]; then
                  echo '{{"state":"CLOSED"}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(_guard_command(tmp_path, "--source-event", "closed"))

        assert result.returncode == 0, result.stderr
        assert "source #14279 is CLOSED" in result.stdout
        assert "closed unauthorized Graphite synthetic #14328" in result.stdout

    def test_terminal_synthetic_is_a_noop_and_event_lookup_failure_fails_closed(
        self, tmp_path: Path
    ) -> None:
        lookup_views = tmp_path / "lookup-views"
        lookup_views.write_text("0", encoding="utf-8")
        closed = tmp_path / "closed"
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2 $3" == "pr view 14328" ]]; then
                  echo '{{"number":14328,"title":"Done","body":"","headRefName":"gtmq_14279","state":"CLOSED"}}'
                  exit 0
                fi
                if [[ "$1 $2 $3" == "pr view 99999" ]]; then
                  count=$(<"{lookup_views}")
                  count=$((count + 1))
                  echo "$count" >"{lookup_views}"
                  if [[ "$count" == 1 ]]; then exit 1; fi
                  echo '{{"state":"CLOSED"}}'
                  exit 0
                fi
                if [[ "$1 $2 $3" == "pr close 99999" ]]; then
                  touch "{closed}"
                  exit 0
                fi
                if [[ "$1 $2" == "pr close" ]]; then
                  exit 9
                fi
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        terminal = _run_bash(_guard_command(tmp_path, "--synthetic-event", 14328))
        lookup_failure = _run_bash(
            _guard_command(
                tmp_path,
                "--synthetic-event",
                99999,
                extra_env="GH_RETRY_ATTEMPTS=1",
            )
        )

        assert terminal.returncode == 0, terminal.stderr
        assert "is terminal; no authorization mutation" in terminal.stdout
        assert lookup_failure.returncode == 0, lookup_failure.stderr
        assert "synthetic event lookup failed" in lookup_failure.stdout
        assert "closed unauthorized Graphite synthetic #99999" in lookup_failure.stdout
        assert closed.exists()

    @pytest.mark.parametrize(
        ("source_labels", "expected_reason"),
        [
            ('[{"name":"merge-queue"},{"name":"gated"}]', "hard gate(s): gated"),
            ('[{"name":"merge-queue"},{"name":"hold"}]', "hard gate(s): hold"),
            (
                '[{"name":"merge-queue"},{"name":"needs-human"}]',
                "hard gate(s): needs-human",
            ),
            (
                '[{"name":"merge-queue"},{"name":"queue-deferred"}]',
                "hard gate(s): queue-deferred",
            ),
            (
                '[{"name":"merge-queue"},{"name":"needs-conflict-resolution"}]',
                "hard gate(s): needs-conflict-resolution",
            ),
            (
                '[{"name":"merge-queue"},{"name":"needs:taste"}]',
                "hard gate(s): needs:taste",
            ),
            (
                '[{"name":"merge-queue"},{"name":"needs-human-taste"}]',
                "hard gate(s): needs-human-taste",
            ),
            (
                '[{"name":"merge-queue"},{"name":"needs-human-review"}]',
                "hard gate(s): needs-human-review",
            ),
            (
                '[{"name":"merge-queue"},{"name":"human-review-required"}]',
                "hard gate(s): human-review-required",
            ),
            (
                '[{"name":"merge-queue"},{"name":"no-auto"}]',
                "hard gate(s): no-auto",
            ),
            (
                '[{"name":"merge-queue"},{"name":"taste"}]',
                "hard gate(s): taste",
            ),
            ("[]", "no longer has merge-queue"),
        ],
    )
    def test_gtmq_synthetic_closes_when_open_source_authorization_is_revoked(
        self, tmp_path: Path, source_labels: str, expected_reason: str
    ) -> None:
        calls = tmp_path / "calls"
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":14307,"t":"Graphite MQ for 14071","body":"https://app.graphite.com/github/pr/JovieInc/Jovie/14071","draft":true,"m":"MERGEABLE","ms":"UNSTABLE","head":"gtmq_14071","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2 $3" == "pr view 14071" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"labels":{source_labels}}}'
                  exit 0
                fi
                if [[ "$1 $2 $3" == "pr close 14307" ]]; then
                  echo "$*" >> "{calls}"
                  exit 0
                fi
                if [[ "$1 $2 $3" == "pr view 14307" ]]; then
                  echo '{{"state":"CLOSED"}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(_drain_command(tmp_path))

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert expected_reason in result.stdout
        assert "closed unauthorized Graphite synthetic #14307" in result.stdout
        close_call = calls.read_text(encoding="utf-8")
        assert "pr close 14307" in close_call
        assert "Root cause: Graphite synthetic #14307" in close_call
        assert "#14071 was re-gated and dequeued" in close_call

    @pytest.mark.parametrize("source_state", ["CLOSED", "MERGED"])
    def test_gtmq_synthetic_closes_when_source_is_terminal(
        self, tmp_path: Path, source_state: str
    ) -> None:
        closed = tmp_path / "closed"
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":14313,"t":"Orphan Graphite MQ","body":"https://github.com/JovieInc/Jovie/pull/14075","draft":true,"m":"MERGEABLE","ms":"CLEAN","head":"gtmq_14075","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2 $3" == "pr view 14075" ]]; then
                  echo '{{"state":"{source_state}","isDraft":false,"labels":[]}}'
                  exit 0
                fi
                if [[ "$1 $2 $3" == "pr close 14313" ]]; then
                  touch "{closed}"
                  exit 0
                fi
                if [[ "$1 $2 $3" == "pr view 14313" ]]; then
                  echo '{{"state":"CLOSED"}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(_drain_command(tmp_path))

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert (
            f"source #14075 is {source_state} and no longer authorizes this synthetic"
            in result.stdout
        )
        assert "closed unauthorized Graphite synthetic #14313" in result.stdout
        assert closed.exists()

    def test_gtmq_synthetic_preserves_only_explicitly_queued_ungated_open_source(
        self, tmp_path: Path
    ) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{"n":14308,"t":"Active Graphite MQ","body":"https://github.com/JovieInc/Jovie/pull/14072","draft":true,"m":"MERGEABLE","ms":"CLEAN","head":"gtmq_14072","L":[],"fail":[]}]'
                  exit 0
                fi
                if [[ "$1 $2 $3" == "pr view 14072" ]]; then
                  echo '{"state":"OPEN","isDraft":false,"labels":[{"name":"merge-queue"},{"name":"testing"}]}'
                  exit 0
                fi
                if [[ "$1 $2" == "pr close" ]]; then
                  echo "unexpected close mutation: $*" >&2
                  exit 9
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(_drain_command(tmp_path))

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert (
            "ACTIVE/PRESERVE (all open sources non-draft, explicitly queued, and ungated)"
            in result.stdout
        )
        assert "Graphite synthetics closed: 0; active/preserved: 1" in result.stdout

    def test_gtmq_synthetic_closes_when_source_is_draft(self, tmp_path: Path) -> None:
        closed = tmp_path / "closed"
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":14331,"t":"Draft-source batch","body":"https://github.com/JovieInc/Jovie/pull/14281","draft":true,"m":"MERGEABLE","ms":"CLEAN","head":"gtmq_14281","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2 $3" == "pr view 14281" ]]; then
                  echo '{{"state":"OPEN","isDraft":true,"labels":[{{"name":"merge-queue"}}]}}'
                  exit 0
                fi
                if [[ "$1 $2 $3" == "pr close 14331" ]]; then
                  touch "{closed}"
                  exit 0
                fi
                if [[ "$1 $2 $3" == "pr view 14331" ]]; then
                  echo '{{"state":"CLOSED"}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(_drain_command(tmp_path))

        assert result.returncode == 0, result.stderr
        assert "source #14281 is OPEN but is draft" in result.stdout
        assert closed.exists()

    def test_gtmq_synthetic_fails_closed_when_source_lookup_fails(
        self, tmp_path: Path
    ) -> None:
        closed = tmp_path / "closed"
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":14309,"t":"Unknown-source Graphite MQ","body":"https://app.graphite.com/github/pr/JovieInc/Jovie/14073","draft":true,"m":"MERGEABLE","ms":"CLEAN","head":"gtmq_14073","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2 $3" == "pr view 14073" ]]; then
                  exit 1
                fi
                if [[ "$1 $2 $3" == "pr close 14309" ]]; then
                  touch "{closed}"
                  exit 0
                fi
                if [[ "$1 $2 $3" == "pr view 14309" ]]; then
                  echo '{{"state":"CLOSED"}}'
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
            _drain_command(tmp_path, extra_env="GH_RETRY_ATTEMPTS=1")
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "source #14073 lookup failed" in result.stdout
        assert closed.exists()

    def test_gtmq_synthetic_fails_closed_on_missing_source_metadata(
        self, tmp_path: Path
    ) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{"n":14311,"t":"Malformed Graphite MQ","body":"Graphite queue batch source #14074","draft":true,"m":"MERGEABLE","ms":"CLEAN","head":"gtmq_malformed","L":[],"fail":[]}]'
                  exit 0
                fi
                if [[ "$1 $2 $3" == "pr close 14311" ]]; then exit 0; fi
                if [[ "$1 $2 $3" == "pr view 14311" ]]; then
                  echo '{"state":"CLOSED"}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(_drain_command(tmp_path))

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "missing or malformed source PR metadata" in result.stdout
        assert "closed unauthorized Graphite synthetic #14311" in result.stdout

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
                  echo '[{"name":"CI / PR Ready","bucket":"pass","state":"SUCCESS"},{"name":"CI / Migration Guard","bucket":"pass","state":"SUCCESS"},{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"},{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}]'
                  exit 8
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[]}'
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
            _drain_command(tmp_path, extra_env="DRY_RUN=1")
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
                  echo '[{"name":"CI / PR Ready","bucket":"pass","state":"SUCCESS"},{"name":"CI / Migration Guard","bucket":"pass","state":"SUCCESS"},{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"},{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[]}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(_drain_command(tmp_path, extra_env=f'GH_RETRY_BASE_DELAY=0 GH_RETRY_TEST_COUNTER="{counter}" DRY_RUN=1'))

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "[dry-run] would +merge-queue on #654" in result.stdout
        assert "gh-retry" in result.stderr
        assert counter.read_text(encoding="utf-8").strip() == "2"

    @pytest.mark.parametrize(
        "refreshed_state",
        [
            '{"state":"OPEN","isDraft":true,"mergeable":"MERGEABLE","labels":[]}',
            '{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[{"name":"queue-deferred"}]}',
        ],
    )
    def test_enroll_refuses_draft_or_deferred_state_from_fresh_read(
        self, tmp_path: Path, refreshed_state: str
    ) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":655,"t":"Held after snapshot","draft":false,"m":"MERGEABLE","head":"codex/jov-655-held","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"CI / PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"CI / Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{refreshed_state}'
                  exit 0
                fi
                if [[ "$1 $2" == "pr edit" ]]; then
                  echo "unexpected enrollment mutation: $*" >&2
                  exit 9
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(
            _drain_command(tmp_path, extra_env="DRY_RUN=1")
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "eligibility changed; refusing enrollment for #655" in result.stdout
        assert "[dry-run] would +merge-queue on #655" not in result.stdout

    @pytest.mark.parametrize("edit_exit", [0, 1])
    def test_held_dequeue_fails_when_removal_is_not_proven(
        self, tmp_path: Path, edit_exit: int
    ) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":656,"t":"Held and queued","draft":true,"m":"MERGEABLE","head":"codex/jov-656-held","L":["merge-queue"],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr edit" ]]; then
                  exit {edit_exit}
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"labels":[{{"name":"merge-queue"}}]}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(_drain_command(tmp_path))

        assert result.returncode != 0
        assert "Failed to prove held PR #656 is outside merge queue" in result.stderr

    def test_enrollment_mutation_failure_is_terminal(self, tmp_path: Path) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{"n":657,"t":"Clean candidate","draft":false,"m":"MERGEABLE","head":"codex/jov-657-clean","L":[],"fail":[]}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{"name":"CI / PR Ready","bucket":"pass","state":"SUCCESS"},{"name":"CI / Migration Guard","bucket":"pass","state":"SUCCESS"},{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"},{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[]}'
                  exit 0
                fi
                if [[ "$1 $2" == "pr edit" ]]; then
                  exit 1
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(_drain_command(tmp_path))

        assert result.returncode != 0
        assert "Failed to prove enrollment for #657" in result.stderr

    @pytest.mark.parametrize(
        ("second_read", "removal_exit", "expected_message"),
        [
            (
                '{"state":"OPEN","isDraft":true,"mergeable":"MERGEABLE","labels":[{"name":"merge-queue"}]}',
                0,
                "enrollment verification failed",
            ),
            (
                '{"state":"OPEN","isDraft":false,"mergeable":"CONFLICTING","labels":[{"name":"merge-queue"},{"name":"needs-conflict-resolution"}]}',
                0,
                "enrollment verification failed",
            ),
            ("READ_FAILURE", 0, "could not verify"),
            (
                "READ_FAILURE",
                1,
                "CRITICAL: could not prove failed enrollment was compensated",
            ),
        ],
    )
    def test_post_enrollment_failure_compensates_and_proves_absence(
        self,
        tmp_path: Path,
        second_read: str,
        removal_exit: int,
        expected_message: str,
    ) -> None:
        read_count = tmp_path / "read-count"
        edit_count = tmp_path / "edit-count"
        read_count.write_text("0", encoding="utf-8")
        edit_count.write_text("0", encoding="utf-8")
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":658,"t":"Racing candidate","draft":false,"m":"MERGEABLE","head":"codex/jov-658-race","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"CI / PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"CI / Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  count=$(cat '{read_count}')
                  count=$((count + 1))
                  echo "$count" > '{read_count}'
                  if [[ "$count" -eq 1 ]]; then
                    echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[]}}'
                  elif [[ "$count" -eq 2 && '{second_read}' == 'READ_FAILURE' ]]; then
                    exit 1
                  elif [[ "$count" -eq 2 ]]; then
                    echo '{second_read}'
                  else
                    echo '{{"labels":[]}}'
                  fi
                  exit 0
                fi
                if [[ "$1 $2" == "pr edit" ]]; then
                  count=$(cat '{edit_count}')
                  count=$((count + 1))
                  echo "$count" > '{edit_count}'
                  if [[ "$count" -eq 2 ]]; then exit {removal_exit}; fi
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(_drain_command(tmp_path))

        assert result.returncode != 0
        assert expected_message in result.stderr
        assert edit_count.read_text(encoding="utf-8").strip() == "2"

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
            _drain_command(tmp_path, extra_env="DRY_RUN=1")
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
                  echo '[{"name":"CI / PR Ready","bucket":"fail","state":"FAILURE"},{"name":"CI / Migration Guard","bucket":"pass","state":"SUCCESS"},{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"},{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}]'
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
            _drain_command(tmp_path, extra_env="DRY_RUN=1")
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "BLOCKED: 1" in result.stdout
        assert "[dry-run] would -merge-queue on #888" in result.stdout
        assert "checks=CI / PR Ready" in result.stdout
        assert "=== BLOCKED (red checks" in result.stdout
        assert "#888" in result.stdout
        assert "[dry-run] would +merge-queue on #888" not in result.stdout

    def test_unstable_state_with_missing_required_checks_is_dequeued(
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
            _drain_command(tmp_path, extra_env="DRY_RUN=1")
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "UNSTABLE: 1" in result.stdout
        # Queue enrollment requires positive proof that every required aggregate
        # exists and succeeded. An empty check set must fail closed even when the
        # GitHub mergeability snapshot still says MERGEABLE.
        assert "[dry-run] would -merge-queue on #889" in result.stdout
        assert "CI / PR Ready (missing)" in result.stdout
        assert "[dry-run] would +merge-queue on #889" not in result.stdout

    def test_drain_remediate_script_exists(self) -> None:
        remediate = _REPO_ROOT / "scripts" / "drain-pr-remediate.mjs"
        assert remediate.is_file()
        content = remediate.read_text(encoding="utf-8")
        assert "listBlockedAgentPrs" in content
        assert "force-with-lease" in content

    def test_gtmq_drafts_bypass_ordinary_label_mutations_but_fail_closed_without_sources(
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
            _drain_command(tmp_path, extra_env="DRY_RUN=1")
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "gtmq: 1" in result.stdout
        assert "=== GRAPHITE MQ source authorization ===" in result.stdout
        assert "#999" in result.stdout
        assert "missing or malformed source PR metadata" in result.stdout
        assert "[dry-run] would document root cause and close Graphite synthetic #999" in result.stdout
        assert "[dry-run] would -merge-queue on #999" not in result.stdout
        assert "[dry-run] would +needs-conflict-resolution on #999" not in result.stdout


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
        add_label_failures: int = 0,
        comment_failures: int = 0,
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
              if [[ " $* " == *" --add-label merge-queue "* ]]; then
                count=$(cat "{tmp_path}/add-label-count" 2>/dev/null || echo 0)
                count=$((count + 1))
                echo "$count" > "{tmp_path}/add-label-count"
                if [[ "$count" -le {add_label_failures} ]]; then
                  echo "simulated add-label failure" >&2
                  exit 1
                fi
              fi
              exit 0
            fi
            if [[ "$1 $2" == "pr comment" ]]; then
              echo "comment $*" >> "{tmp_path}/edits.log"
              count=$(cat "{tmp_path}/comment-count" 2>/dev/null || echo 0)
              count=$((count + 1))
              echo "$count" > "{tmp_path}/comment-count"
              if [[ "$count" -le {comment_failures} ]]; then
                echo "simulated comment failure" >&2
                exit 1
              fi
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

    def test_successful_real_cycle_removes_readds_and_records(self, tmp_path: Path) -> None:
        stale_ts = self._stale_ts()
        pr_list = (
            '[{"n":108,"t":"Successful cycle","m":"MERGEABLE","ms":"CLEAN",'
            '"head":"tim/jov-108","L":["merge-queue"]}]'
        )
        timeline = (
            f'[{{"event":"labeled","label":{{"name":"merge-queue"}},'
            f'"created_at":"{stale_ts}"}}]'
        )
        self._fake_gh(
            tmp_path,
            pr_list_json=pr_list,
            timeline_by_pr={108: timeline},
            comments_by_pr={108: "[]"},
            checks_by_pr={108: ("[]", 0)},
        )

        result = self._run_watchdog(tmp_path, extra_env="STALL_MINUTES=45", dry_run=False)

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        edits = (tmp_path / "edits.log").read_text(encoding="utf-8")
        assert edits.count("--remove-label merge-queue") == 1
        assert edits.count("--add-label merge-queue") == 1
        assert edits.count("comment pr comment 108") == 1
        assert "kicked (label-cycled): 1" in result.stdout
        assert "mutation failures: 0" in result.stdout

    def test_readd_failure_restores_label_and_returns_failure(self, tmp_path: Path) -> None:
        stale_ts = self._stale_ts()
        pr_list = (
            '[{"n":109,"t":"Re-add fails once","m":"MERGEABLE","ms":"CLEAN",'
            '"head":"tim/jov-109","L":["merge-queue"]}]'
        )
        timeline = (
            f'[{{"event":"labeled","label":{{"name":"merge-queue"}},'
            f'"created_at":"{stale_ts}"}}]'
        )
        self._fake_gh(
            tmp_path,
            pr_list_json=pr_list,
            timeline_by_pr={109: timeline},
            comments_by_pr={109: "[]"},
            checks_by_pr={109: ("[]", 0)},
            add_label_failures=1,
        )

        result = self._run_watchdog(tmp_path, extra_env="STALL_MINUTES=45", dry_run=False)

        assert result.returncode != 0
        edits = (tmp_path / "edits.log").read_text(encoding="utf-8")
        assert edits.count("--remove-label merge-queue") == 1
        assert edits.count("--add-label merge-queue") == 2
        assert "compensating by restoring merge-queue" in result.stderr
        assert "mutation failures: 1" in result.stdout

    def test_comment_failure_confirms_label_and_returns_failure(self, tmp_path: Path) -> None:
        stale_ts = self._stale_ts()
        pr_list = (
            '[{"n":110,"t":"Comment fails","m":"MERGEABLE","ms":"CLEAN",'
            '"head":"tim/jov-110","L":["merge-queue"]}]'
        )
        timeline = (
            f'[{{"event":"labeled","label":{{"name":"merge-queue"}},'
            f'"created_at":"{stale_ts}"}}]'
        )
        self._fake_gh(
            tmp_path,
            pr_list_json=pr_list,
            timeline_by_pr={110: timeline},
            comments_by_pr={110: "[]"},
            checks_by_pr={110: ("[]", 0)},
            comment_failures=1,
        )

        result = self._run_watchdog(tmp_path, extra_env="STALL_MINUTES=45", dry_run=False)

        assert result.returncode != 0
        edits = (tmp_path / "edits.log").read_text(encoding="utf-8")
        assert edits.count("--remove-label merge-queue") == 1
        assert edits.count("--add-label merge-queue") == 2
        assert edits.count("comment pr comment 110") == 1
        assert "confirming merge-queue remains restored" in result.stderr
        assert "mutation failures: 1" in result.stdout

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
