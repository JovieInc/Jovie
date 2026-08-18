"""
Regression tests for scripts/lib/gh-retry.sh.

The merge-queue enroll job calls drain-pr-queue.sh, which must survive
transient GitHub GraphQL 504s instead of failing the workflow.

Run with:
    python -m pytest scripts/tests/test_gh_retry.py -v
"""
from __future__ import annotations

import base64
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
_UPSERT_PR_COMMENT = _REPO_ROOT / "scripts" / "lib" / "upsert-pr-comment.sh"
_DRAIN_SCRIPT = _REPO_ROOT / "scripts" / "drain-pr-queue.sh"
_WATCHDOG_SCRIPT = _REPO_ROOT / "scripts" / "merge-queue-watchdog.sh"
_EXPECTED_MAIN_SHA = "0" * 40


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
    backend: str = "test-label-fixture",
) -> str:
    fake_gh = tmp_path / "gh"
    assert fake_gh.is_file(), f"test must create isolated gh fixture first: {fake_gh}"
    fixture_gh = tmp_path / "gh-fixture"
    if not fixture_gh.exists():
        fake_gh.replace(fixture_gh)
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "${{1:-}}" == "api" && "${{2:-}}" == "repos/JovieInc/Jovie/git/ref/heads/main" ]]; then
                  call_file="${{DRAIN_TEST_MAIN_REF_CALLS:-${{DRAIN_TEST_MAIN_REF_STATE_DIR:?}}/main-ref-${{DRAIN_TEST_RUN_ID:?}}}}"
                  call=0
                  [[ -f "$call_file" ]] && call=$(<"$call_file")
                  call=$((call + 1))
                  echo "$call" >"$call_file"
                  error_from_call="${{DRAIN_TEST_MAIN_REF_ERROR_FROM_CALL:-0}}"
                  if [[ "$error_from_call" =~ ^[1-9][0-9]*$ ]] && (( call >= error_from_call )); then
                    echo "HTTP 401: simulated main-ref read failure" >&2
                    exit 1
                  fi
                  main_sha="${{DRAIN_EXPECTED_MAIN_SHA:?}}"
                  if [[ "${{DRAIN_TEST_MAIN_REF_INITIAL_EMPTY:-1}}" == "1" && "$call" -eq 1 ]]; then
                    printf '\n'
                    exit 0
                  fi
                  after_call="${{DRAIN_TEST_MAIN_REF_AFTER_CALL:-2}}"
                  if [[ -n "${{DRAIN_TEST_MAIN_REF_AFTER_SHA:-}}" ]] && (( call >= after_call )); then
                    main_sha="$DRAIN_TEST_MAIN_REF_AFTER_SHA"
                  fi
                  printf '%s\n' "$main_sha"
                  exit 0
                fi
                exec "{fixture_gh}" "$@"
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)
    expected = expected_gh or fake_gh
    authorization = "test-fixture" if backend == "test-label-fixture" else "merge-queue-autoenroll"
    env_prefix = (
        f'PATH="{tmp_path}:$PATH" '
        f'DRAIN_EXPECT_GH="{expected}" '
        f'DRAIN_MUTATION_AUTHORIZATION={authorization} '
        f'MERGE_QUEUE_BACKEND={backend} '
        f'DRAIN_EXPECTED_MAIN_SHA={_EXPECTED_MAIN_SHA} '
        f'DRAIN_RECEIPT_NODE="{shutil.which("node")}" '
        f'DRAIN_TEST_RUN_ID="$$" '
        f'DRAIN_TEST_MAIN_REF_STATE_DIR="{tmp_path}" '
    )
    if backend == "native":
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "promotionMode": "normal",
            "promotionAdmission": {"allowed": True},
            "signals": {
                "main": {"sha": _EXPECTED_MAIN_SHA, "status": "green"},
                "production": {"status": "green"},
            },
        }
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()
        env_prefix += f"DRAIN_FLEET_GATE_B64={encoded} "
    if extra_env:
        env_prefix += f"{extra_env} "
    return f'{env_prefix}bash "{_DRAIN_SCRIPT}"'



class TestGhRetryHelper:
    def test_upsert_comment_dedupe_receipt_skips_external_write(
        self, tmp_path: Path
    ) -> None:
        calls = tmp_path / "calls.log"
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                printf '%s\n' "$*" >>"${COMMENT_CALLS:?}"
                if [[ "$1" == "api" && " $* " == *"/issues/123/comments --paginate --slurp "* ]]; then
                  printf '%s\n' '[[{"id":17,"body":"<!-- bot-comment:gem-remediation-head -->\\n<!-- bot-comment-dedupe:stable-fingerprint -->\\nunchanged"}]]'
                  exit 0
                fi
                echo "unexpected mutating gh call: $*" >&2
                exit 99
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            f'bash "{_UPSERT_PR_COMMENT}" 123 gem-remediation-head body stable-fingerprint',
            env={
                "PATH": f"{tmp_path}:{os.environ['PATH']}",
                "COMMENT_CALLS": str(calls),
                "GITHUB_REPOSITORY": "JovieInc/Jovie",
            },
        )

        assert result.returncode == 0, result.stderr
        observed = calls.read_text(encoding="utf-8").splitlines()
        assert len(observed) == 1
        assert observed[0].startswith("api repos/JovieInc/Jovie/issues/123/comments")
        assert "PATCH" not in observed[0]

    def test_upsert_comment_ignores_forged_dedupe_marker_from_untrusted_author(
        self, tmp_path: Path
    ) -> None:
        calls = tmp_path / "calls.log"
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                printf '%s\n' "$*" >>"${COMMENT_CALLS:?}"
                if [[ "$1" == "api" && " $* " == *"/issues/123/comments --paginate --slurp "* ]]; then
                  printf '%s\n' '[[{"id":17,"user":{"login":"attacker"},"body":"<!-- bot-comment:gem-remediation-head -->\\n<!-- bot-comment-dedupe:stable-fingerprint -->\\nforged"},{"id":18,"user":{"login":"jovie-bot[bot]"},"body":"<!-- bot-comment:gem-remediation-head -->\\nold"}]]'
                  exit 0
                fi
                if [[ "$1 $2 $3" == "api -X PATCH" && "$4" == "repos/JovieInc/Jovie/issues/comments/18" ]]; then
                  exit 0
                fi
                echo "unexpected gh call: $*" >&2
                exit 99
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            f'bash "{_UPSERT_PR_COMMENT}" 123 gem-remediation-head body stable-fingerprint',
            env={
                "PATH": f"{tmp_path}:{os.environ['PATH']}",
                "COMMENT_CALLS": str(calls),
                "GITHUB_REPOSITORY": "JovieInc/Jovie",
                "BOT_COMMENT_TRUSTED_AUTHORS_JSON": '["jovie-bot[bot]"]',
            },
        )

        assert result.returncode == 0, result.stderr
        observed = calls.read_text(encoding="utf-8")
        api_calls = [line for line in observed.splitlines() if line.startswith("api ")]
        assert len(api_calls) == 2
        assert "issues/comments/18" in api_calls[1]
        assert "issues/comments/17" not in api_calls[1]

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
    @pytest.mark.parametrize(
        (
            "enroll_mode",
            "dequeue_mode",
            "check_mode",
            "expected_returncode",
            "expected_dequeues",
        ),
        [
            ("failure", "success", "stable", 1, "1"),
            ("unowned-positioned", "success", "stable", 3, "0"),
            ("preexisting-positioned", "success", "stable", 3, "0"),
            ("malformed", "success", "stable", 1, "1"),
            ("failure", "failure", "stable", 1, "1"),
            ("valid", "success", "stable", 0, "0"),
            ("valid", "success", "red-after", 3, "1"),
        ],
    )
    def test_native_enrollment_requires_receipt_and_compensates_once(
        self,
        tmp_path: Path,
        enroll_mode: str,
        dequeue_mode: str,
        check_mode: str,
        expected_returncode: int,
        expected_dequeues: str,
    ) -> None:
        head = "a" * 40
        dequeue_calls = tmp_path / "dequeue-calls"
        check_calls = tmp_path / "check-calls"
        queue_state = tmp_path / "queue-state"
        dequeue_calls.write_text("0", encoding="utf-8")
        check_calls.write_text("0", encoding="utf-8")
        queue_state.write_text(
            "queued" if enroll_mode == "preexisting-positioned" else "unqueued",
            encoding="utf-8",
        )
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                command_name="${{2:-}}"
                case "$command_name" in
                  preflight) exit 0 ;;
                  list-state)
                    state=$(<"${{FAKE_QUEUE_STATE:?}}")
                    if [[ "$state" == "queued" ]]; then
                      echo '{{"101":{{"headRefOid":"{head}","queued":true,"autoMergeEnabled":false}}}}'
                    else
                      echo '{{"101":{{"headRefOid":"{head}","queued":false,"autoMergeEnabled":false}}}}'
                    fi
                    ;;
                  enroll)
                    if [[ "${{FAKE_ENROLL_MODE:?}}" == "failure" ]]; then
                      echo 'merge-queue-backend[enrollment_postcondition_failed]: successful mutation lacked a durable postcondition' >&2
                      exit 1
                    fi
                    if [[ "${{FAKE_ENROLL_MODE:?}}" == "unowned-positioned" ]]; then
                      echo 'merge-queue-backend[enrollment_ownership_unproven]: later positioned state is evidence only' >&2
                      exit 1
                    fi
                    if [[ "${{FAKE_ENROLL_MODE:?}}" == "preexisting-positioned" ]]; then
                      echo '{{"changed":false,"state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}","mergeQueueEntry":{{"id":"MQE_FOREIGN","state":"AWAITING_CHECKS","position":1}}}}}}'
                      exit 0
                    fi
                    if [[ "${{FAKE_ENROLL_MODE:?}}" == "valid" ]]; then
                      printf queued >"${{FAKE_QUEUE_STATE:?}}"
                      echo '{{"changed":true,"state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}","mergeQueueEntry":{{"id":"MQE_1","state":"AWAITING_CHECKS","position":3}}}}}}'
                      exit 0
                    fi
                    echo '{{"state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}","mergeQueueEntry":null}}}}'
                    ;;
                  dequeue)
                    [[ "${{4:-}}" == "{head}" ]] || {{ echo "missing exact compensation head" >&2; exit 7; }}
                    count=$(<"${{FAKE_DEQUEUE_CALLS:?}}")
                    echo "$((count + 1))" >"${{FAKE_DEQUEUE_CALLS:?}}"
                    printf unqueued >"${{FAKE_QUEUE_STATE:?}}"
                    if [[ "${{FAKE_DEQUEUE_MODE:?}}" == "failure" ]]; then
                      exit 1
                    fi
                    echo '{{"state":{{"queued":false}}}}'
                    ;;
                  max-queue-depth) echo 16 ;;
                  --classify-queue)
                    payload="$(cat)"
                    if grep -q '"bucket":"fail"' <<<"$payload"; then
                      echo '["security-scan"]'
                    else
                      echo '[]'
                    fi
                    ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":101,"t":"Receipt regression","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/receipt","headOid":"{head}","base":"main","body":"","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  count=$(<"${{FAKE_CHECK_CALLS:?}}")
                  count=$((count + 1)); echo "$count" >"${{FAKE_CHECK_CALLS:?}}"
                  if [[ "${{FAKE_CHECK_MODE:?}}" == "red-after" && "$count" -ge 3 ]]; then
                    echo '[{{"name":"security-scan","bucket":"fail","state":"FAILURE"}}]'
                  else
                    echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  fi
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{head}","baseRefName":"main","body":""}}'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ " $* " == *"/commits/{head}/status "* ]]; then
                    echo '{{"statuses":[]}}'
                    exit 0
                  fi
                  if [[ " $* " == *"/statuses/{head} "* ]]; then
                    exit 0
                  fi
                  exit 1
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    f"DRAIN_ADMISSION_PR=101 DRAIN_ADMISSION_HEAD={head} "
                    f"FAKE_ENROLL_MODE={enroll_mode} FAKE_DEQUEUE_MODE={dequeue_mode} "
                    f"FAKE_DEQUEUE_CALLS={dequeue_calls} FAKE_CHECK_CALLS={check_calls} "
                    f"FAKE_QUEUE_STATE={queue_state} "
                    f"FAKE_CHECK_MODE={check_mode} "
                    "GITHUB_RUN_ID=42 GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert result.returncode == expected_returncode, (
            f"stdout={result.stdout}\nstderr={result.stderr}"
        )
        assert dequeue_calls.read_text(encoding="utf-8").strip() == expected_dequeues, (
            f"stdout={result.stdout}\nstderr={result.stderr}"
        )
        if enroll_mode == "valid" and check_mode == "stable":
            assert "+native-queue on #101" in result.stdout
            assert "state AWAITING_CHECKS, position 3" in result.stdout
        elif check_mode == "red-after":
            assert "exact-head checks changed during native enrollment" in result.stdout
            assert "+native-queue on #101" not in result.stdout
        elif enroll_mode == "unowned-positioned":
            assert "refusing foreign-state compensation" in result.stdout
            assert "later positioned state is evidence only" in result.stderr
        elif enroll_mode == "preexisting-positioned":
            assert "already queued without a canonical controller receipt" in result.stdout
            assert "+native-queue on #101" not in result.stdout
        else:
            assert "native enrollment" in result.stderr
        if dequeue_mode == "failure":
            assert "CRITICAL: could not compensate unproven" in result.stderr

    @pytest.mark.parametrize(
        (
            "after_sha",
            "after_call",
            "error_from_call",
            "expected_returncode",
            "expected_enrolls",
            "expected_dequeues",
            "expected_message",
        ),
        [
            (
                "1" * 40,
                2,
                0,
                3,
                "0",
                "0",
                "main advanced before native enrollment",
            ),
            (
                "",
                2,
                2,
                1,
                "0",
                "0",
                "could not read live refs/heads/main immediately before",
            ),
            (
                "1" * 40,
                3,
                0,
                3,
                "1",
                "1",
                "main advanced during native enrollment",
            ),
            (
                "",
                3,
                3,
                1,
                "1",
                "1",
                "could not read live refs/heads/main after native enrollment",
            ),
        ],
    )
    def test_native_enrollment_binds_each_mutation_to_expected_main(
        self,
        tmp_path: Path,
        after_sha: str,
        after_call: int,
        error_from_call: int,
        expected_returncode: int,
        expected_enrolls: str,
        expected_dequeues: str,
        expected_message: str,
    ) -> None:
        head = "a" * 40
        main_ref_calls = tmp_path / "main-ref-calls"
        enroll_calls = tmp_path / "enroll-calls"
        dequeue_calls = tmp_path / "dequeue-calls"
        for path in (main_ref_calls, enroll_calls, dequeue_calls):
            path.write_text("0", encoding="utf-8")

        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  list-state) echo '{{"101":{{"headRefOid":"{head}","queued":false}}}}' ;;
                  enroll)
                    count=$(<"${{FAKE_ENROLL_CALLS:?}}")
                    echo "$((count + 1))" >"${{FAKE_ENROLL_CALLS:?}}"
                    echo '{{"changed":true,"state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}","mergeQueueEntry":{{"id":"MQE_1","state":"AWAITING_CHECKS","position":1}}}}}}'
                    ;;
                  dequeue)
                    [[ "${{4:-}}" == "{head}" ]] || {{ echo "missing exact compensation head" >&2; exit 7; }}
                    count=$(<"${{FAKE_DEQUEUE_CALLS:?}}")
                    echo "$((count + 1))" >"${{FAKE_DEQUEUE_CALLS:?}}"
                    echo '{{"state":{{"queued":false}}}}'
                    ;;
                  max-queue-depth) echo 16 ;;
                  --classify-queue) echo '[]' ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)

        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":101,"t":"Main-bound admission","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/main-bound","headOid":"{head}","base":"main","body":"","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{head}","baseRefName":"main","body":""}}'
                  exit 0
                fi
                if [[ "$1" == "api" && " $* " == *"/commits/{head}/status "* ]]; then
                  echo '{{"statuses":[]}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    f"DRAIN_ADMISSION_PR=101 DRAIN_ADMISSION_HEAD={head} "
                    f"DRAIN_TEST_MAIN_REF_CALLS={main_ref_calls} "
                    f"DRAIN_TEST_MAIN_REF_AFTER_SHA={after_sha} "
                    f"DRAIN_TEST_MAIN_REF_AFTER_CALL={after_call} "
                    f"DRAIN_TEST_MAIN_REF_ERROR_FROM_CALL={error_from_call} "
                    f"FAKE_ENROLL_CALLS={enroll_calls} "
                    f"FAKE_DEQUEUE_CALLS={dequeue_calls}"
                ),
            )
        )

        assert result.returncode == expected_returncode, (
            f"stdout={result.stdout}\nstderr={result.stderr}"
        )
        assert expected_message in f"{result.stdout}\n{result.stderr}"
        assert enroll_calls.read_text(encoding="utf-8").strip() == expected_enrolls
        assert dequeue_calls.read_text(encoding="utf-8").strip() == expected_dequeues

    def test_native_enrollment_rejects_noncanonical_expected_main_sha(
        self, tmp_path: Path
    ) -> None:
        called = tmp_path / "gh-called"
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            f"#!/usr/bin/env bash\ntouch '{called}'\nexit 99\n",
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=f"DRAIN_EXPECTED_MAIN_SHA={'A' * 40}",
            )
        )

        assert result.returncode == 2
        assert "exact lowercase 40-character SHA" in result.stderr
        assert not called.exists()

    def test_initially_queued_exact_target_reconciles_after_live_ejection(
        self, tmp_path: Path
    ) -> None:
        head = "a" * 40
        list_calls = tmp_path / "list-calls"
        enroll_calls = tmp_path / "enroll-calls"
        list_calls.write_text("0", encoding="utf-8")
        enroll_calls.write_text("0", encoding="utf-8")
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  list-state)
                    count=$(<"${{FAKE_LIST_CALLS:?}}")
                    count=$((count + 1))
                    echo "$count" >"${{FAKE_LIST_CALLS:?}}"
                    enrolled=$(<"${{FAKE_ENROLL_CALLS:?}}")
                    if [[ "$count" -eq 1 || "$enrolled" -gt 0 ]]; then
                      echo '{{"101":{{"headRefOid":"{head}","queued":true}}}}'
                    else
                      echo '{{"101":{{"headRefOid":"{head}","queued":false}}}}'
                    fi
                    ;;
                  enroll)
                    count=$(<"${{FAKE_ENROLL_CALLS:?}}")
                    echo "$((count + 1))" >"${{FAKE_ENROLL_CALLS:?}}"
                    echo '{{"changed":true,"state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}","mergeQueueEntry":{{"id":"MQE_1","state":"AWAITING_CHECKS","position":1}}}}}}'
                    ;;
                  dequeue) echo '{{"state":{{"queued":false}}}}' ;;
                  max-queue-depth) echo 16 ;;
                  --classify-queue) echo '[]' ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":101,"t":"Receipt race","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/receipt-race","headOid":"{head}","base":"main","body":"","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{head}","baseRefName":"main","body":""}}'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ " $* " == *"/commits/{head}/status "* ]]; then
                    echo '{{"statuses":[]}}'
                    exit 0
                  fi
                  if [[ " $* " == *"/statuses/{head} "* ]]; then
                    echo '{{}}'
                    exit 0
                  fi
                  exit 1
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    f"DRAIN_ADMISSION_PR=101 DRAIN_ADMISSION_HEAD={head} "
                    f"FAKE_LIST_CALLS={list_calls} FAKE_ENROLL_CALLS={enroll_calls} "
                    "GITHUB_RUN_ID=42 GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "admission scope: #101 at " + head in result.stdout
        assert "+native-queue on #101" in result.stdout
        # Initial inventory, post-dequeue capacity refresh, and the receipt's
        # pre/post-write positioned-queue proofs are all required.
        assert list_calls.read_text(encoding="utf-8").strip() == "4"
        assert enroll_calls.read_text(encoding="utf-8").strip() == "1"

    def test_post_receipt_queue_loss_compensates_controller_enrollment(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        list_calls = tmp_path / "list-calls"
        enroll_calls = tmp_path / "enroll-calls"
        dequeue_calls = tmp_path / "dequeue-calls"
        for path in (list_calls, enroll_calls, dequeue_calls):
            path.write_text("0", encoding="utf-8")
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  list-state)
                    count=$(<"${{FAKE_LIST_CALLS:?}}")
                    count=$((count + 1))
                    echo "$count" >"${{FAKE_LIST_CALLS:?}}"
                    if [[ "$count" -eq 3 ]]; then
                      echo '{{"101":{{"headRefOid":"{head}","queued":true}}}}'
                    else
                      echo '{{"101":{{"headRefOid":"{head}","queued":false}}}}'
                    fi
                    ;;
                  enroll)
                    count=$(<"${{FAKE_ENROLL_CALLS:?}}")
                    echo "$((count + 1))" >"${{FAKE_ENROLL_CALLS:?}}"
                    echo '{{"changed":true,"state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}","mergeQueueEntry":{{"id":"MQE_1","state":"AWAITING_CHECKS","position":1}}}}}}'
                    ;;
                  dequeue)
                    [[ "${{3:-}}" == "101" && "${{4:-}}" == "{head}" && "${{5:-}}" == "controller-enrollment" ]]
                    count=$(<"${{FAKE_DEQUEUE_CALLS:?}}")
                    echo "$((count + 1))" >"${{FAKE_DEQUEUE_CALLS:?}}"
                    echo '{{"changed":true,"state":{{"queued":false}}}}'
                    ;;
                  max-queue-depth) echo 16 ;;
                  --classify-queue) echo '[]' ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":101,"t":"Receipt readback race","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/receipt-readback","headOid":"{head}","headOwner":"JovieInc","cross":false,"base":"main","body":"","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{head}","baseRefName":"main","body":""}}'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ " $* " == *"/commits/{head}/status "* ]]; then
                    echo '{{"statuses":[]}}'
                    exit 0
                  fi
                  if [[ " $* " == *"/statuses/{head} "* ]]; then
                    echo '{{}}'
                    exit 0
                  fi
                  exit 1
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    f"DRAIN_ADMISSION_PR=101 DRAIN_ADMISSION_HEAD={head} "
                    f"FAKE_LIST_CALLS={list_calls} FAKE_ENROLL_CALLS={enroll_calls} "
                    f"FAKE_DEQUEUE_CALLS={dequeue_calls} "
                    "GITHUB_RUN_ID=42 GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert result.returncode == 1, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "lost its exact positioned queue entry" in result.stderr
        assert enroll_calls.read_text(encoding="utf-8").strip() == "1"
        assert dequeue_calls.read_text(encoding="utf-8").strip() == "1"

    def test_vanished_native_receipt_does_not_retry_after_policy_change(
        self, tmp_path: Path
    ) -> None:
        head = "b" * 40
        list_calls = tmp_path / "list-calls"
        enroll_calls = tmp_path / "enroll-calls"
        list_calls.write_text("0", encoding="utf-8")
        enroll_calls.write_text("0", encoding="utf-8")
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  list-state)
                    count=$(<"${{FAKE_LIST_CALLS:?}}")
                    count=$((count + 1))
                    echo "$count" >"${{FAKE_LIST_CALLS:?}}"
                    if [[ "$count" -eq 1 ]]; then
                      echo '{{"102":{{"headRefOid":"{head}","queued":true}}}}'
                    else
                      echo '{{"102":{{"headRefOid":"{head}","queued":false}}}}'
                    fi
                    ;;
                  enroll)
                    count=$(<"${{FAKE_ENROLL_CALLS:?}}")
                    echo "$((count + 1))" >"${{FAKE_ENROLL_CALLS:?}}"
                    echo '{{"changed":true,"state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}","mergeQueueEntry":{{"id":"MQE_102","state":"AWAITING_CHECKS","position":1}}}}}}'
                    ;;
                  dequeue) echo '{{"state":{{"queued":false}}}}' ;;
                  max-queue-depth) echo 16 ;;
                  --classify-queue) echo '[]' ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":102,"t":"Policy changed","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/policy-change","headOid":"{head}","base":"main","body":"","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":true,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{head}","baseRefName":"main","body":""}}'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  exit 1
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    f"DRAIN_ADMISSION_PR=102 DRAIN_ADMISSION_HEAD={head} "
                    f"FAKE_LIST_CALLS={list_calls} FAKE_ENROLL_CALLS={enroll_calls}"
                ),
            )
        )

        assert result.returncode == 3, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "eligibility changed; refusing enrollment for #102" in result.stdout
        assert "queue-noop: exact admission #102" in result.stderr
        assert list_calls.read_text(encoding="utf-8").strip() == "3"
        assert enroll_calls.read_text(encoding="utf-8").strip() == "0"

    def test_vanished_native_receipt_does_not_retry_after_checks_turn_red(
        self, tmp_path: Path
    ) -> None:
        head = "c" * 40
        list_calls = tmp_path / "list-calls"
        check_calls = tmp_path / "check-calls"
        enroll_calls = tmp_path / "enroll-calls"
        for path in (list_calls, check_calls, enroll_calls):
            path.write_text("0", encoding="utf-8")
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  list-state)
                    count=$(<"${{FAKE_LIST_CALLS:?}}")
                    count=$((count + 1)); echo "$count" >"${{FAKE_LIST_CALLS:?}}"
                    if [[ "$count" -eq 1 ]]; then
                      echo '{{"103":{{"headRefOid":"{head}","queued":true}}}}'
                    else
                      echo '{{"103":{{"headRefOid":"{head}","queued":false}}}}'
                    fi
                    ;;
                  enroll)
                    count=$(<"${{FAKE_ENROLL_CALLS:?}}")
                    echo "$((count + 1))" >"${{FAKE_ENROLL_CALLS:?}}"
                    echo '{{"changed":true,"state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}","mergeQueueEntry":{{"id":"MQE_103","state":"AWAITING_CHECKS","position":1}}}}}}'
                    ;;
                  dequeue) echo '{{"state":{{"queued":false}}}}' ;;
                  max-queue-depth) echo 16 ;;
                  --classify-queue)
                    raw=$(cat)
                    if [[ "$raw" == *'"bucket":"fail"'* ]]; then
                      echo '["PR Ready"]'
                    else
                      echo '[]'
                    fi
                    ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":103,"t":"Checks changed","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/check-race","headOid":"{head}","base":"main","body":"","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  count=$(<"${{FAKE_CHECK_CALLS:?}}")
                  count=$((count + 1)); echo "$count" >"${{FAKE_CHECK_CALLS:?}}"
                  if [[ "$count" -eq 1 ]]; then
                    echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  else
                    echo '[{{"name":"PR Ready","bucket":"fail","state":"FAILURE"}}]'
                  fi
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{head}","baseRefName":"main","body":""}}'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ " $* " == *"/commits/{head}/status "* ]]; then
                    echo '{{"statuses":[]}}'; exit 0
                  fi
                  exit 1
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    f"DRAIN_ADMISSION_PR=103 DRAIN_ADMISSION_HEAD={head} "
                    f"FAKE_LIST_CALLS={list_calls} FAKE_CHECK_CALLS={check_calls} "
                    f"FAKE_ENROLL_CALLS={enroll_calls}"
                ),
            )
        )

        assert result.returncode == 3, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "exact-head checks changed; refusing enrollment for #103" in result.stdout
        assert enroll_calls.read_text(encoding="utf-8").strip() == "0"

    def test_scheduled_controller_failure_receipt_replays_through_native_writer(
        self, tmp_path: Path
    ) -> None:
        head = "d" * 40
        real_node = shutil.which("node")
        assert real_node is not None
        enroll_calls = tmp_path / "enroll-calls"
        queue_state = tmp_path / "queue-state"
        enroll_calls.write_text("0", encoding="utf-8")
        queue_state.write_text("unqueued", encoding="utf-8")
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  list-state)
                    state=$(<"${{FAKE_QUEUE_STATE:?}}")
                    if [[ "$state" == "queued" ]]; then
                      echo '{{"104":{{"headRefOid":"{head}","queued":true,"autoMergeEnabled":false}}}}'
                    else
                      echo '{{"104":{{"headRefOid":"{head}","queued":false,"autoMergeEnabled":false}}}}'
                    fi
                    ;;
                  enroll)
                    count=$(<"${{FAKE_ENROLL_CALLS:?}}")
                    echo "$((count + 1))" >"${{FAKE_ENROLL_CALLS:?}}"
                    printf queued >"${{FAKE_QUEUE_STATE:?}}"
                    echo '{{"changed":true,"state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}","mergeQueueEntry":{{"id":"MQE_104","state":"AWAITING_CHECKS","position":1}}}}}}'
                    ;;
                  dequeue) echo '{{"state":{{"queued":false}}}}' ;;
                  max-queue-depth) echo 16 ;;
                  --classify-queue) exec '{real_node}' "$1" "$2" ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":104,"t":"Controller retry","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/controller-retry","headOid":"{head}","base":"main","body":"","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"jovie-gem-queue-remediation/v1","bucket":"fail","state":"FAILURE"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{head}","baseRefName":"main","body":""}}'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ " $* " == *"/commits/{head}/status "* ]]; then
                    echo '{{"statuses":[{{"context":"jovie-gem-queue-remediation/v1","state":"failure","creator":null,"avatar_url":"https://avatars.example/jovie-bot","url":"https://api.github.com/repos/JovieInc/Jovie/statuses/{head}","target_url":"https://github.com/JovieInc/Jovie/actions/runs/41","updated_at":"2026-08-18T00:00:00Z"}}]}}'
                    exit 0
                  fi
                  if [[ "$2" == "users/jovie-bot%5Bbot%5D" ]]; then
                    echo '{{"login":"jovie-bot[bot]","type":"Bot","avatar_url":"https://avatars.example/jovie-bot"}}'
                    exit 0
                  fi
                  if [[ " $* " == *"/statuses/{head} "* ]]; then
                    echo '{{}}'; exit 0
                  fi
                  if [[ "$2" == "repos/JovieInc/Jovie/actions/runs/41" ]]; then
                    echo '{{"id":41,"name":"Merge Queue Auto-Enroll","path":".github/workflows/merge-queue-autoenroll.yml","html_url":"https://github.com/JovieInc/Jovie/actions/runs/41","repository":{{"full_name":"JovieInc/Jovie"}},"head_repository":{{"full_name":"JovieInc/Jovie"}},"head_sha":"{head}","workflow_id":99,"run_attempt":1}}'
                    exit 0
                  fi
                  exit 1
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "DRAIN_RECOVER_CONTROLLER_FAILURES=1 "
                    f"FAKE_ENROLL_CALLS={enroll_calls} FAKE_QUEUE_STATE={queue_state} "
                    "GITHUB_RUN_ID=42 "
                    "GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "replaying exact controller receipt" in result.stdout
        assert "+native-queue on #104" in result.stdout
        assert enroll_calls.read_text(encoding="utf-8").strip() == "1"

    def test_controller_failure_receipt_closes_when_exact_head_is_already_queued(
        self, tmp_path: Path
    ) -> None:
        head = "9" * 40
        enroll_calls = tmp_path / "enroll-calls"
        status_writes = tmp_path / "status-writes"
        controller_state = tmp_path / "controller-state"
        enroll_calls.write_text("0", encoding="utf-8")
        status_writes.write_text("0", encoding="utf-8")
        controller_state.write_text("failure", encoding="utf-8")
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  list-state) echo '{{"105":{{"headRefOid":"{head}","queued":true,"autoMergeEnabled":true}}}}' ;;
                  enroll)
                    count=$(<"${{FAKE_ENROLL_CALLS:?}}")
                    echo "$((count + 1))" >"${{FAKE_ENROLL_CALLS:?}}"
                    echo '{{"changed":false,"state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}","mergeQueueEntry":{{"id":"MQE_105","state":"AWAITING_CHECKS","position":1}}}}}}'
                    ;;
                  dequeue) echo '{{"state":{{"queued":false}}}}' ;;
                  max-queue-depth) echo 16 ;;
                  --classify-queue) echo '[]' ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":105,"t":"Queued controller retry","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/controller-queued","headOid":"{head}","headOwner":"JovieInc","cross":false,"base":"main","body":"","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"jovie-gem-queue-remediation/v1","bucket":"fail","state":"FAILURE"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{head}","baseRefName":"main","body":""}}'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ " $* " == *"/commits/{head}/status "* ]]; then
                    state=$(<"${{FAKE_CONTROLLER_STATE:?}}")
                    printf '{{"statuses":[{{"context":"jovie-gem-queue-remediation/v1/pr-105","description":"PR #105: controller outcome","state":"%s","creator":{{"type":"Bot","login":"jovie-bot[bot]"}},"target_url":"https://github.com/JovieInc/Jovie/actions/runs/41","updated_at":"2026-08-18T00:00:00Z"}},{{"context":"jovie-queue-reentry/v1/pr-105","description":"PR #105: Native queue admission recorded at exact head","state":"success","creator":{{"type":"Bot","login":"jovie-bot[bot]"}},"target_url":"https://github.com/JovieInc/Jovie/actions/runs/41","updated_at":"2026-08-18T00:00:01Z"}}]}}\n' "$state"
                    exit 0
                  fi
                  if [[ " $* " == *"/statuses/{head} "* ]]; then
                    count=$(<"${{FAKE_STATUS_WRITES:?}}")
                    echo "$((count + 1))" >"${{FAKE_STATUS_WRITES:?}}"
                    printf success >"${{FAKE_CONTROLLER_STATE:?}}"
                    echo '{{}}'
                    exit 0
                  fi
                  if [[ "$2" == "repos/JovieInc/Jovie/actions/runs/41" ]]; then
                    echo '{{"id":41,"name":"Merge Queue Auto-Enroll","path":".github/workflows/merge-queue-autoenroll.yml","html_url":"https://github.com/JovieInc/Jovie/actions/runs/41","repository":{{"full_name":"JovieInc/Jovie"}},"head_repository":{{"full_name":"JovieInc/Jovie"}},"head_sha":"{head}","workflow_id":99,"run_attempt":1}}'
                    exit 0
                  fi
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)
        command = _drain_command(
            tmp_path,
            backend="native",
            extra_env=(
                "DRAIN_RECOVER_CONTROLLER_FAILURES=1 "
                f"FAKE_ENROLL_CALLS={enroll_calls} "
                f"FAKE_STATUS_WRITES={status_writes} "
                f"FAKE_CONTROLLER_STATE={controller_state} "
                "GITHUB_RUN_ID=42 GITHUB_SERVER_URL=https://github.com"
            ),
        )

        first = _run_bash(command)
        second = _run_bash(command)

        assert first.returncode == 0, f"stdout={first.stdout}\nstderr={first.stderr}"
        assert second.returncode == 0, f"stdout={second.stdout}\nstderr={second.stderr}"
        assert "validating queued exact head before closing stale controller receipt" in first.stdout
        assert "validating queued exact head before closing stale controller receipt" not in second.stdout
        # The existing queue entry is revalidated through the native backend;
        # changed=false proves no enrollment command was attributed to Gem.
        assert enroll_calls.read_text(encoding="utf-8").strip() == "1"
        # The canonical queue-reentry receipt already exists, so only the
        # terminal controller status is written. The second pass is idempotent.
        assert status_writes.read_text(encoding="utf-8").strip() == "1"

    def test_missed_admission_reconciles_only_two_safe_exact_heads(
        self, tmp_path: Path
    ) -> None:
        heads = {
            number: character * 40
            for number, character in zip(range(101, 108), "abcdef1")
        }
        queue_states = {
            str(number): {
                "headRefOid": head,
                "queued": False,
                "autoMergeEnabled": number == 104,
            }
            for number, head in heads.items()
        }
        pulls = [
            {
                "n": number,
                "t": f"Candidate {number}",
                "draft": False,
                "m": "MERGEABLE",
                "ms": "CLEAN",
                "head": (
                    "codegen-bot/candidate-105"
                    if number == 105
                    else "human/ordinary-ready-106"
                    if number == 106
                    else f"codex/candidate-{number}"
                ),
                "headOid": head,
                "headOwner": "fork-owner" if number == 103 else "JovieInc",
                "cross": number == 103,
                "base": "main",
                "body": "",
                "L": ["no-auto"] if number == 102 else [],
                "fail": [],
            }
            for number, head in heads.items()
        ]
        enrolled = tmp_path / "enrolled"
        dequeued = tmp_path / "dequeued"
        enrolled.write_text("", encoding="utf-8")
        dequeued.write_text("", encoding="utf-8")
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  list-state)
                    state='{json.dumps(queue_states)}'
                    while IFS= read -r queued_pr; do
                      [[ -n "$queued_pr" ]] || continue
                      state=$(jq -c --arg pr "$queued_pr" '.[$pr].queued = true' <<<"$state")
                    done <"${{FAKE_ENROLLED:?}}"
                    printf '%s\n' "$state"
                    ;;
                  enroll)
                    pr="${{3:?}}"; head="${{4:?}}"
                    printf '%s\n' "$pr" >>"${{FAKE_ENROLLED:?}}"
                    printf '{{"changed":true,"state":{{"state":"OPEN","isDraft":false,"headRefOid":"%s","mergeQueueEntry":{{"id":"MQE_%s","state":"AWAITING_CHECKS","position":1}}}}}}\n' "$head" "$pr"
                    ;;
                  dequeue)
                    printf '%s\n' "${{3:?}}" >>"${{FAKE_DEQUEUED:?}}"
                    echo '{{"state":{{"queued":false}}}}'
                    ;;
                  max-queue-depth) echo 16 ;;
                  --classify-queue)
                    raw=$(cat)
                    if [[ "$raw" == *'"bucket":"fail"'* ]]; then
                      echo '["PR Ready"]'
                    else
                      echo '[]'
                    fi
                    ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  printf '%s\n' '{json.dumps(pulls)}'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  if [[ "$3" == "101" ]]; then
                    echo '[{{"name":"PR Ready","bucket":"fail","state":"FAILURE"}}]'
                  else
                    echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  fi
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  case "$3" in
                    103) head='{heads[103]}' ;;
                    105) head='{heads[105]}' ;;
                    106) head='{heads[106]}' ;;
                    *) echo "unexpected pr view: $*" >&2; exit 2 ;;
                  esac
                  printf '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"%s","baseRefName":"main","body":""}}\n' "$head"
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ " $* " == *"/commits/"*"/status "* ]]; then
                    echo '{{"statuses":[]}}'; exit 0
                  fi
                  if [[ " $* " == *"/statuses/"* ]]; then
                    echo '{{}}'; exit 0
                  fi
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "DRAIN_RECONCILE_MISSED_ADMISSION=1 "
                    "DRAIN_QUEUE_REENTRY_MAX_PER_RUN=2 "
                    f"FAKE_ENROLLED={enrolled} FAKE_DEQUEUED={dequeued} "
                    "GITHUB_RUN_ID=42 GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert enrolled.read_text(encoding="utf-8").splitlines() == ["103", "105"]
        # #104 has a clean, unowned auto-merge request. It is neither adopted
        # nor removed without an independent hard/fleet/check policy reason.
        assert dequeued.read_text(encoding="utf-8").splitlines() == []
        assert "reached total exact admission cap (2)" in result.stdout
        for excluded in (101, 102, 104, 106, 107):
            assert f"+native-queue on #{excluded}" not in result.stdout

    def test_scheduled_controller_recovery_rejects_spoofed_workflow_receipt(
        self, tmp_path: Path
    ) -> None:
        head = "e" * 40
        enroll_calls = tmp_path / "enroll-calls"
        enroll_calls.write_text("0", encoding="utf-8")
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  list-state) echo '{{"108":{{"headRefOid":"{head}","queued":false,"autoMergeEnabled":false}}}}' ;;
                  enroll)
                    count=$(<"${{FAKE_ENROLL_CALLS:?}}")
                    echo "$((count + 1))" >"${{FAKE_ENROLL_CALLS:?}}"
                    echo '{{"changed":true,"state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}","mergeQueueEntry":{{"id":"MQE_108","state":"AWAITING_CHECKS","position":1}}}}}}'
                    ;;
                  dequeue) echo '{{"state":{{"queued":false}}}}' ;;
                  max-queue-depth) echo 16 ;;
                  --classify-queue) echo '[]' ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":108,"t":"Foreign receipt","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/foreign-receipt","headOid":"{head}","headOwner":"JovieInc","cross":false,"base":"main","body":"","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ " $* " == *"/commits/{head}/status "* ]]; then
                    echo '{{"statuses":[{{"context":"jovie-gem-queue-remediation/v1","state":"failure","creator":{{"type":"Bot","login":"jovie-bot[bot]"}},"target_url":"https://github.com/JovieInc/Jovie/actions/runs/41","updated_at":"2026-08-18T00:00:00Z"}}]}}'
                    exit 0
                  fi
                  if [[ "$2" == "repos/JovieInc/Jovie/actions/runs/41" ]]; then
                    echo '{{"id":41,"name":"Unrelated Workflow","path":".github/workflows/unrelated.yml","html_url":"https://github.com/JovieInc/Jovie/actions/runs/41","repository":{{"full_name":"JovieInc/Jovie"}},"head_repository":{{"full_name":"JovieInc/Jovie"}},"head_sha":"{head}","workflow_id":100,"run_attempt":1}}'
                    exit 0
                  fi
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "DRAIN_RECOVER_CONTROLLER_FAILURES=1 "
                    f"FAKE_ENROLL_CALLS={enroll_calls} GITHUB_RUN_ID=42 "
                    "GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "replaying exact controller receipt" not in result.stdout
        assert enroll_calls.read_text(encoding="utf-8").strip() == "0"

    def test_composite_ci_reentry_recovers_only_bounded_exact_bot_receipts(
        self, tmp_path: Path
    ) -> None:
        """Synthetic merge-group events may recover only prior native members."""
        heads = {"1001": "a" * 40, "1002": "b" * 40, "1003": "c" * 40}
        enrolled = tmp_path / "enrolled"
        enrolled.write_text("", encoding="utf-8")
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  list-state)
                    state='{{"1001":{{"headRefOid":"{heads["1001"]}","queued":false}},"1002":{{"headRefOid":"{heads["1002"]}","queued":false}},"1003":{{"headRefOid":"{heads["1003"]}","queued":false}}}}'
                    while IFS= read -r queued_pr; do
                      [[ -n "$queued_pr" ]] || continue
                      state=$(jq -c --arg pr "$queued_pr" '.[$pr].queued = true' <<<"$state")
                    done <"{enrolled}"
                    printf '%s\n' "$state"
                    ;;
                  enroll)
                    echo "${{3:?}}" >>"{enrolled}"
                    head_var="${{4:?}}"
                    echo "{{\\"changed\\":true,\\"state\\":{{\\"state\\":\\"OPEN\\",\\"isDraft\\":false,\\"headRefOid\\":\\"$head_var\\",\\"mergeQueueEntry\\":{{\\"id\\":\\"MQE_${{3}}\\",\\"state\\":\\"AWAITING_CHECKS\\",\\"position\\":1}}}}}}"
                    ;;
                  dequeue) echo '{{"state":{{"queued":false}}}}' ;;
                  max-queue-depth) echo 16 ;;
                  --classify-queue) echo '[]' ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  cat <<'JSON'
                [{{"n":1001,"t":"First exact receipt","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/one","headOid":"{heads["1001"]}","base":"main","body":"","L":[],"fail":[]}},{{"n":1002,"t":"Second exact receipt","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/two","headOid":"{heads["1002"]}","base":"main","body":"","L":[],"fail":[]}},{{"n":1003,"t":"Third exact receipt","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/three","headOid":"{heads["1003"]}","base":"main","body":"","L":[],"fail":[]}}]
JSON
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  case "$3" in
                    1001) head="{heads["1001"]}" ;;
                    1002) head="{heads["1002"]}" ;;
                    1003) head="{heads["1003"]}" ;;
                    *) echo "unexpected PR view: $*" >&2; exit 2 ;;
                  esac
                  echo "{{\\"state\\":\\"OPEN\\",\\"isDraft\\":false,\\"mergeable\\":\\"MERGEABLE\\",\\"labels\\":[],\\"headRefOid\\":\\"$head\\",\\"baseRefName\\":\\"main\\",\\"body\\":\\"\\"}}"
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ "$2" == *"/commits/"*"/status"* ]]; then
                    head="${{2#*/commits/}}"; head="${{head%%/status*}}"
                    if [[ "$head" == "{heads["1002"]}" ]]; then
                      echo "{{\\"statuses\\":[{{\\"url\\":\\"https://api.github.com/repos/JovieInc/Jovie/statuses/$head\\",\\"avatar_url\\":\\"https://avatars.example/jovie-bot\\",\\"context\\":\\"jovie-queue-reentry/v1\\",\\"state\\":\\"success\\",\\"description\\":\\"Native queue admission recorded at exact head\\",\\"creator\\":null,\\"target_url\\":\\"https://github.com/JovieInc/Jovie/actions/runs/77\\",\\"updated_at\\":\\"2026-08-15T12:00:00Z\\"}}]}}"
                    else
                      echo "{{\\"statuses\\":[{{\\"context\\":\\"jovie-queue-reentry/v1\\",\\"state\\":\\"success\\",\\"description\\":\\"Native queue admission recorded at exact head\\",\\"creator\\":{{\\"type\\":\\"Bot\\",\\"login\\":\\"jovie-bot[bot]\\"}},\\"target_url\\":\\"https://github.com/JovieInc/Jovie/actions/runs/77\\",\\"updated_at\\":\\"2026-08-15T12:00:00Z\\"}}]}}"
                    fi
                    exit 0
                  fi
                  if [[ "$2" == "users/jovie-bot%5Bbot%5D" ]]; then
                    echo '{{"login":"jovie-bot[bot]","type":"Bot","avatar_url":"https://avatars.example/jovie-bot"}}'
                    exit 0
                  fi
                  if [[ "$2" == "repos/JovieInc/Jovie/actions/runs/77" ]]; then
                    echo '{{"id":77,"name":"Merge Queue Auto-Enroll","path":".github/workflows/merge-queue-autoenroll.yml","html_url":"https://github.com/JovieInc/Jovie/actions/runs/77","repository":{{"full_name":"JovieInc/Jovie"}},"head_repository":{{"full_name":"JovieInc/Jovie"}},"head_sha":"{heads["1002"]}","workflow_id":99,"run_attempt":1}}'
                    exit 0
                  fi
                  # Merge-group churn is unknown in this isolated receipt test;
                  # the guard must never block or mutate on that missing data.
                  exit 1
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "DRAIN_RECONCILE_QUEUE_REENTRY=1 "
                    "DRAIN_QUEUE_REENTRY_MAX_PER_RUN=2 "
                    "GITHUB_RUN_ID=77 GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\\nstderr={result.stderr}"
        assert "bounded exact-head native admission" in result.stdout
        assert "exact native re-entry at " + heads["1001"] in result.stdout
        assert "exact native re-entry at " + heads["1002"] in result.stdout
        assert heads["1003"] not in result.stdout
        assert enrolled.read_text(encoding="utf-8").splitlines() == ["1001", "1002"]

    def test_surviving_mutex_run_recovers_one_missed_head_with_target_under_total_cap(
        self, tmp_path: Path
    ) -> None:
        """One surviving pass recovers lost clean work without exceeding two admissions."""
        heads = {"1001": "d" * 40, "1002": "e" * 40, "1003": "f" * 40}
        enrolled = tmp_path / "enrolled"
        enrolled.write_text("", encoding="utf-8")
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  list-state)
                    state='{{"1001":{{"headRefOid":"{heads["1001"]}","queued":false}},"1002":{{"headRefOid":"{heads["1002"]}","queued":false}},"1003":{{"headRefOid":"{heads["1003"]}","queued":false}}}}'
                    while IFS= read -r queued_pr; do
                      [[ -n "$queued_pr" ]] || continue
                      state=$(jq -c --arg pr "$queued_pr" '.[$pr].queued = true' <<<"$state")
                    done <"{enrolled}"
                    printf '%s\n' "$state"
                    ;;
                  enroll)
                    echo "${{3:?}}" >>"{enrolled}"
                    head_var="${{4:?}}"
                    echo "{{\\"changed\\":true,\\"state\\":{{\\"state\\":\\"OPEN\\",\\"isDraft\\":false,\\"headRefOid\\":\\"$head_var\\",\\"mergeQueueEntry\\":{{\\"id\\":\\"MQE_${{3}}\\",\\"state\\":\\"AWAITING_CHECKS\\",\\"position\\":1}}}}}}"
                    ;;
                  dequeue) echo '{{"state":{{"queued":false}}}}' ;;
                  max-queue-depth) echo 16 ;;
                  --classify-queue) echo '[]' ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  cat <<'JSON'
                [{{"n":1001,"t":"Exact event target","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/event","headOid":"{heads["1001"]}","headOwner":"JovieInc","cross":false,"base":"main","body":"","L":[],"fail":[]}},{{"n":1002,"t":"Missed exact event","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/missed","headOid":"{heads["1002"]}","headOwner":"JovieInc","cross":false,"base":"main","body":"","L":[],"fail":[]}},{{"n":1003,"t":"Deferred by total cap","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/deferred","headOid":"{heads["1003"]}","headOwner":"JovieInc","cross":false,"base":"main","body":"","L":[],"fail":[]}}]
JSON
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  case "$3" in
                    1001) head="{heads["1001"]}" ;;
                    1002) head="{heads["1002"]}" ;;
                    1003) head="{heads["1003"]}" ;;
                    *) echo "unexpected PR view: $*" >&2; exit 2 ;;
                  esac
                  echo "{{\\"state\\":\\"OPEN\\",\\"isDraft\\":false,\\"mergeable\\":\\"MERGEABLE\\",\\"labels\\":[],\\"headRefOid\\":\\"$head\\",\\"baseRefName\\":\\"main\\",\\"body\\":\\"\\"}}"
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ "$2" == *"/commits/"*"/status"* ]]; then
                    echo '{{"statuses":[]}}'
                    exit 0
                  fi
                  if [[ " $* " == *" -X POST "* && " $* " == *"/statuses/"* ]]; then
                    exit 0
                  fi
                  # Merge-group churn is unknown in this isolated admission test.
                  exit 1
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    f"DRAIN_ADMISSION_PR=1001 DRAIN_ADMISSION_HEAD={heads['1001']} "
                    "DRAIN_RECONCILE_MISSED_ADMISSION=1 "
                    "DRAIN_QUEUE_REENTRY_MAX_PER_RUN=2 "
                    "GITHUB_RUN_ID=78 GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\\nstderr={result.stderr}"
        assert "bounded exact-head native admission" in result.stdout
        assert "exact missed admission at " + heads["1002"] in result.stdout
        assert "reached total exact admission cap (2)" in result.stdout
        assert "exact missed admission at " + heads["1001"] not in result.stdout
        assert "exact missed admission at " + heads["1003"] not in result.stdout
        assert enrolled.read_text(encoding="utf-8").splitlines() == ["1001", "1002"]

    def test_missed_admission_recovery_refuses_a_head_that_moved(
        self, tmp_path: Path
    ) -> None:
        """A green snapshot cannot authorize the PR's newer untested head."""
        snapshot_head = "1" * 40
        live_head = "2" * 40
        enrolled = tmp_path / "enrolled"
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  list-state) echo '{{"1001":{{"headRefOid":"{snapshot_head}","queued":false}}}}' ;;
                  enroll) touch "{enrolled}"; exit 99 ;;
                  max-queue-depth) echo 16 ;;
                  --classify-queue) echo '[]' ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":1001,"t":"Head moved","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/moved","headOid":"{snapshot_head}","headOwner":"JovieInc","cross":false,"base":"main","body":"","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{live_head}","baseRefName":"main","body":""}}'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then exit 1; fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env="DRAIN_RECONCILE_MISSED_ADMISSION=1",
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\\nstderr={result.stderr}"
        assert "event admission scope no longer matches #1001" in result.stdout
        assert not enrolled.exists(), "recovery mutated the newer PR head"

    def test_clean_unowned_auto_merge_is_preserved_without_controller_adoption(
        self, tmp_path: Path
    ) -> None:
        head = "3" * 40
        mutated = tmp_path / "mutated"
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  list-state) echo '{{"1004":{{"headRefOid":"{head}","queued":false,"autoMergeEnabled":true}}}}' ;;
                  enroll|dequeue) touch "{mutated}"; exit 99 ;;
                  max-queue-depth) echo 16 ;;
                  --classify-queue) echo '[]' ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":1004,"t":"Human auto merge","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"human/auto","headOid":"{head}","headOwner":"JovieInc","cross":false,"base":"main","body":"","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then exit 1; fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(_drain_command(tmp_path, backend="native"))

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert not mutated.exists(), "controller adopted or removed unowned auto-merge"
        assert "orphan auto-merge" not in result.stdout

    def test_missed_admission_recovery_rejects_an_unbounded_cap_before_gh(
        self, tmp_path: Path
    ) -> None:
        called = tmp_path / "called"
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            f"#!/usr/bin/env bash\\ntouch '{called}'\\nexit 99\\n",
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "DRAIN_RECONCILE_MISSED_ADMISSION=1 "
                    "DRAIN_QUEUE_REENTRY_MAX_PER_RUN=3"
                ),
            )
        )

        assert result.returncode == 2
        assert "must be an integer from 1 through 2" in result.stderr
        assert not called.exists(), "drain invoked gh before bounded-cap preflight"

    def test_constrained_mode_refuses_missing_receipt_before_calling_gh(
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
                extra_env="DRY_RUN=1 DRAIN_PROMOTION_MODE=isolated-only",
            )
        )

        assert result.returncode == 2
        assert "fresh typed fleet receipt" in result.stderr
        assert not called.exists(), "drain invoked gh before receipt preflight"

    def test_blocked_receipt_dry_run_preserves_clean_queued_pr(
        self, tmp_path: Path
    ) -> None:
        queued_head = "9" * 40
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "promotionMode": "blocked",
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "signals": {
                "main": {"status": "unknown"},
                "production": {"status": "unknown"},
                "controller": {"status": "unknown"},
                "queue": {"status": "unknown"},
                "integrity": {"status": "clear"},
            },
            "promotionAdmission": {"allowed": False},
            "isolatedPromotionAdmission": {
                "allowed": False,
                "deploymentsAllowed": False,
            },
            "productionUnboundRepairAdmission": {
                "allowed": False,
                "condition": None,
                "mainSha": None,
                "deployedSha": None,
                "maxConcurrent": 1,
                "deploymentsAllowed": False,
            },
            "alreadyAdmittedCohort": {
                "preserve": False,
                "newIntakeAllowed": False,
                "semantics": "dequeue-until-exact-production-recovers",
            },
        }
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":909,"t":"Ordinary queued PR","draft":false,"m":"MERGEABLE","head":"codex/jov-909","headOid":"{queued_head}","base":"main","L":["merge-queue"],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=blocked "
                    f"DRAIN_FLEET_GATE_B64={encoded}"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "fleet promotion constraint" not in result.stdout
        assert "would record jovie-fleet-queue-hold/v1" not in result.stdout
        assert "[dry-run] would -merge-queue on #909" not in result.stdout
        assert "queue depth: 1/" in result.stdout
        assert "(0 slots)" in result.stdout
        assert "would +merge-queue" not in result.stdout

    def test_hold_intake_preserves_queued_ordinary_pr_and_allows_implementation_intake(
        self, tmp_path: Path
    ) -> None:
        queued_head = "8" * 40
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "promotionMode": "hold-intake",
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "signals": {
                "main": {"status": "green", "sha": "a" * 40},
                "production": {"status": "green", "deployedSha": "b" * 40},
                "controller": {"status": "green"},
                "queue": {
                    "status": "known",
                    "eligiblePrs": 1,
                    "greenReadyPrs": 1,
                    "target": 15,
                },
                "integrity": {"status": "clear"},
            },
            "promotionAdmission": {"allowed": False},
            "isolatedPromotionAdmission": {
                "allowed": False,
                "deploymentsAllowed": False,
            },
            "productionUnboundRepairAdmission": {
                "allowed": True,
                "condition": "production-deployment-unbound",
                "mainSha": "a" * 40,
                "deployedSha": "b" * 40,
                "maxConcurrent": 1,
                "deploymentsAllowed": False,
            },
            "alreadyAdmittedCohort": {
                "preserve": True,
                "newIntakeAllowed": True,
                "semantics": "preserve-cohort-and-continue-isolated-implementation",
            },
        }
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":901,"t":"Already admitted green PR","draft":false,"m":"MERGEABLE","head":"codex/jov-901","headOid":"{queued_head}","base":"main","L":["merge-queue"],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=hold-intake "
                    f"DRAIN_FLEET_GATE_B64={encoded}"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "fleet promotion constraint" not in result.stdout
        assert "would -merge-queue on #901" not in result.stdout
        assert "would dequeue #901" not in result.stdout
        assert "would +merge-queue" not in result.stdout
        assert "queue depth: 1/" in result.stdout
        assert "(15 slots)" in result.stdout

    @pytest.mark.parametrize(
        "body",
        [
            "Ordinary source-green PR",
            (
                "<!-- production-unbound-repair:production-deployment-unbound:"
                + "a" * 40
                + " -->"
            ),
            (
                "<!-- jovie-production-unbound-repair-attestation/v1 -->\n"
                "```json\n"
                + json.dumps(
                    {
                        "schema": "jovie-production-unbound-repair-attestation/v1",
                        "kind": "production-release-repair",
                        "condition": "production-deployment-unbound",
                        "pr": 904,
                        "head": "f" * 40,
                        "mainSha": "a" * 40,
                        "deploymentsAllowed": False,
                    }
                )
                + "\n```"
            ),
            (
                "<!-- jovie-production-unbound-repair-attestation/v1 -->\n"
                "```json\n"
                + json.dumps(
                    {
                        "schema": "jovie-production-unbound-repair-attestation/v1",
                        "kind": "production-release-repair",
                        "condition": "production-deployment-unbound",
                        "pr": 904,
                        "head": "e" * 40,
                        "mainSha": "a" * 40,
                        "deploymentsAllowed": False,
                    }
                )
                + "\n```"
            ),
        ],
    )
    def test_hold_intake_enrolls_clean_unrelated_prs(
        self, tmp_path: Path, body: str
    ) -> None:
        head = "f" * 40
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "promotionMode": "hold-intake",
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "signals": {
                "main": {"status": "green", "sha": "a" * 40},
                "production": {"status": "green", "deployedSha": "b" * 40},
                "controller": {"status": "green"},
                "queue": {
                    "status": "known",
                    "eligiblePrs": 1,
                    "greenReadyPrs": 1,
                    "target": 15,
                },
                "integrity": {"status": "clear"},
            },
            "promotionAdmission": {"allowed": False},
            "isolatedPromotionAdmission": {
                "allowed": False,
                "deploymentsAllowed": False,
            },
            "productionUnboundRepairAdmission": {
                "allowed": True,
                "condition": "production-deployment-unbound",
                "mainSha": "a" * 40,
                "deployedSha": "b" * 40,
                "maxConcurrent": 1,
                "deploymentsAllowed": False,
            },
            "alreadyAdmittedCohort": {
                "preserve": True,
                "newIntakeAllowed": True,
                "semantics": "preserve-cohort-and-continue-isolated-implementation",
            },
        }
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()
        body_json = json.dumps(body)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":904,"t":"Candidate","body":{body_json},"draft":false,"m":"MERGEABLE","head":"codex/jov-904","headOid":"{head}","base":"main","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{head}","baseRefName":"main","body":{body_json}}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=hold-intake "
                    "DRAIN_ADMISSION_PR=904 "
                    f"DRAIN_ADMISSION_HEAD={head} DRAIN_FLEET_GATE_B64={encoded}"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "[dry-run] would +merge-queue on #904" in result.stdout
        assert "would record jovie-fleet-queue-hold/v1 on #904" not in result.stdout

    def test_draft_only_never_enrolls_clean_unrelated_pr(self, tmp_path: Path) -> None:
        head = "c" * 40
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "promotionMode": "draft-only",
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "signals": {
                "main": {"status": "red", "sha": "a" * 40},
                "production": {"status": "green", "deployedSha": "b" * 40},
                "controller": {"status": "green"},
                "queue": {
                    "status": "known",
                    "eligiblePrs": 1,
                    "greenReadyPrs": 1,
                    "target": 15,
                },
                "integrity": {"status": "clear"},
            },
            "promotionAdmission": {"allowed": False},
            "isolatedPromotionAdmission": {
                "allowed": False,
                "deploymentsAllowed": False,
            },
            "productionUnboundRepairAdmission": {
                "allowed": False,
                "condition": None,
                "mainSha": None,
                "deployedSha": None,
                "maxConcurrent": 1,
                "deploymentsAllowed": False,
            },
            "alreadyAdmittedCohort": {
                "preserve": False,
                "newIntakeAllowed": False,
                "semantics": "draft-only",
            },
        }
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":907,"t":"Clean unrelated","draft":false,"m":"MERGEABLE","head":"codex/jov-907","headOid":"{head}","base":"main","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{head}","baseRefName":"main","body":"ordinary PR"}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=draft-only "
                    "DRAIN_ADMISSION_PR=907 "
                    f"DRAIN_ADMISSION_HEAD={head} DRAIN_FLEET_GATE_B64={encoded}"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "[dry-run] would +merge-queue on #907" not in result.stdout
        assert "would record jovie-fleet-queue-hold/v1" not in result.stdout

    def test_stale_pending_fleet_hold_refreshes_while_fleet_still_blocks(
        self, tmp_path: Path
    ) -> None:
        head = "d" * 40
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "promotionMode": "isolated-only",
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "signals": {
                "main": {"status": "green", "sha": "a" * 40},
                "production": {"status": "red"},
                "controller": {"status": "green"},
                "queue": {
                    "status": "known",
                    "eligiblePrs": 1,
                    "greenReadyPrs": 1,
                    "target": 15,
                },
                "integrity": {"status": "clear"},
            },
            "promotionAdmission": {"allowed": False},
            "isolatedPromotionAdmission": {
                "allowed": True,
                "deploymentsAllowed": False,
            },
            "productionUnboundRepairAdmission": {
                "allowed": False,
                "condition": None,
                "mainSha": None,
                "deployedSha": None,
                "maxConcurrent": 1,
                "deploymentsAllowed": False,
            },
            "alreadyAdmittedCohort": {
                "preserve": False,
                "newIntakeAllowed": True,
                "semantics": "isolated-only",
            },
        }
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()
        stale = (datetime.now(timezone.utc) - timedelta(minutes=20)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":908,"t":"Stale held clean PR","draft":false,"m":"MERGEABLE","head":"codex/jov-908","headOid":"{head}","base":"main","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1" == "api" && " $* " == *"/commits/{head}/status "* ]]; then
                  echo '{{"statuses":[{{"context":"jovie-fleet-queue-hold/v1","state":"pending","creator":{{"type":"Bot","login":"jovie-bot[bot]"}},"target_url":"https://github.com/JovieInc/Jovie/actions/runs/77","updated_at":"{stale}"}}]}}'
                  exit 0
                fi
                if [[ "$1 $2" == "api repos/JovieInc/Jovie/actions/runs/77" ]]; then
                  echo '{{"id":77,"name":"Merge Queue Auto-Enroll","path":".github/workflows/merge-queue-autoenroll.yml","html_url":"https://github.com/JovieInc/Jovie/actions/runs/77","repository":{{"full_name":"JovieInc/Jovie"}},"head_repository":{{"full_name":"JovieInc/Jovie"}},"head_sha":"{head}","workflow_id":99,"run_attempt":1}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=isolated-only "
                    f"DRAIN_FLEET_GATE_B64={encoded} "
                    "FLEET_HOLD_TTL_SECONDS=60 GITHUB_RUN_ID=77 "
                    "GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "terminal fleet-queue-hold" in result.stdout
        assert "fleet still blocks clean enrollment; refreshing exact hold selector" in result.stdout
        assert "would record jovie-fleet-queue-hold/v1 on #908" in result.stdout
        assert "would close jovie-fleet-queue-hold/v1" not in result.stdout

    @pytest.mark.parametrize(
        ("workflow_name", "run_head_matches", "mergeable", "expect_refresh"),
        [
            ("Merge Queue Auto-Enroll", True, "MERGEABLE", True),
            ("Unrelated Workflow", True, "MERGEABLE", False),
            ("Merge Queue Auto-Enroll", False, "MERGEABLE", False),
            ("Merge Queue Auto-Enroll", True, "UNKNOWN", False),
        ],
    )
    def test_null_creator_fleet_hold_requires_exact_app_and_run_provenance(
        self,
        tmp_path: Path,
        workflow_name: str,
        run_head_matches: bool,
        mergeable: str,
        expect_refresh: bool,
    ) -> None:
        head = "f" * 40
        run_head = head if run_head_matches else "e" * 40
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "promotionMode": "isolated-only",
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "signals": {
                "main": {"status": "green", "sha": "a" * 40},
                "production": {"status": "red"},
                "controller": {"status": "green"},
                "queue": {
                    "status": "known",
                    "eligiblePrs": 1,
                    "greenReadyPrs": 1,
                    "target": 15,
                },
                "integrity": {"status": "clear"},
            },
            "promotionAdmission": {"allowed": False},
            "isolatedPromotionAdmission": {
                "allowed": True,
                "deploymentsAllowed": False,
            },
            "productionUnboundRepairAdmission": {
                "allowed": False,
                "condition": None,
                "mainSha": None,
                "deployedSha": None,
                "maxConcurrent": 1,
                "deploymentsAllowed": False,
            },
            "alreadyAdmittedCohort": {
                "preserve": False,
                "newIntakeAllowed": True,
                "semantics": "isolated-only",
            },
        }
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()
        stale = (datetime.now(timezone.utc) - timedelta(minutes=20)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        avatar_url = "https://avatars.githubusercontent.com/in/2934433?v=4"
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":911,"t":"Null creator held PR","draft":false,"m":"{mergeable}","head":"codex/jov-911","headOid":"{head}","base":"main","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1" == "api" && " $* " == *"/commits/{head}/status "* ]]; then
                  echo '{{"statuses":[{{"url":"https://api.github.com/repos/JovieInc/Jovie/statuses/{head}","avatar_url":"{avatar_url}","context":"jovie-fleet-queue-hold/v1","state":"pending","creator":null,"target_url":"https://github.com/JovieInc/Jovie/actions/runs/77","updated_at":"{stale}"}}]}}'
                  exit 0
                fi
                if [[ "$1 $2" == "api users/jovie-bot%5Bbot%5D" ]]; then
                  echo '{{"login":"jovie-bot[bot]","type":"Bot","avatar_url":"{avatar_url}"}}'
                  exit 0
                fi
                if [[ "$1 $2" == "api repos/JovieInc/Jovie/actions/runs/77" ]]; then
                  echo '{{"id":77,"name":"{workflow_name}","path":".github/workflows/merge-queue-autoenroll.yml","head_sha":"{run_head}","html_url":"https://github.com/JovieInc/Jovie/actions/runs/77","repository":{{"full_name":"JovieInc/Jovie"}},"head_repository":{{"full_name":"JovieInc/Jovie"}},"workflow_id":299216194,"run_attempt":1}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=isolated-only "
                    f"DRAIN_FLEET_GATE_B64={encoded} "
                    "FLEET_HOLD_TTL_SECONDS=60 GITHUB_RUN_ID=77 "
                    "GITHUB_SERVER_URL=https://github.com "
                    "GITHUB_API_URL=https://api.github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        close_message = "would close jovie-fleet-queue-hold/v1 on #911"
        if expect_refresh:
            assert "fleet still blocks clean enrollment; refreshing exact hold selector" in result.stdout
            assert "would record jovie-fleet-queue-hold/v1 on #911" in result.stdout
            assert close_message not in result.stdout
        else:
            assert close_message not in result.stdout
            if mergeable == "UNKNOWN" and workflow_name == "Merge Queue Auto-Enroll":
                assert "preserving pending exact hold after transient" in result.stdout
                assert "would close jovie-fleet-queue-hold/v1" not in result.stdout

    def test_hold_intake_closes_fresh_pending_hold_without_waiting_for_ttl(
        self, tmp_path: Path
    ) -> None:
        head = "e" * 40
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "promotionMode": "hold-intake",
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "signals": {
                "main": {"status": "green", "sha": "a" * 40},
                "production": {"status": "green", "deployedSha": "b" * 40},
                "controller": {"status": "green"},
                "queue": {
                    "status": "known",
                    "eligiblePrs": 1,
                    "greenReadyPrs": 1,
                    "target": 15,
                },
                "integrity": {"status": "clear"},
            },
            "promotionAdmission": {"allowed": False},
            "isolatedPromotionAdmission": {
                "allowed": False,
                "deploymentsAllowed": False,
            },
            "productionUnboundRepairAdmission": {
                "allowed": True,
                "condition": "production-deployment-unbound",
                "mainSha": "a" * 40,
                "deployedSha": "b" * 40,
                "maxConcurrent": 1,
                "deploymentsAllowed": False,
            },
            "alreadyAdmittedCohort": {
                "preserve": True,
                "newIntakeAllowed": True,
                "semantics": "preserve-cohort-and-continue-isolated-implementation",
            },
        }
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()
        fresh = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":910,"t":"Fresh held clean PR","draft":false,"m":"MERGEABLE","head":"codex/jov-910","headOid":"{head}","base":"main","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{head}","baseRefName":"main","body":"ordinary PR"}}'
                  exit 0
                fi
                if [[ "$1" == "api" && " $* " == *"/commits/{head}/status "* ]]; then
                  echo '{{"statuses":[{{"context":"jovie-fleet-queue-hold/v1","state":"pending","creator":{{"type":"Bot","login":"jovie-bot[bot]"}},"target_url":"https://github.com/JovieInc/Jovie/actions/runs/77","updated_at":"{fresh}"}}]}}'
                  exit 0
                fi
                if [[ "$1 $2" == "api repos/JovieInc/Jovie/actions/runs/77" ]]; then
                  echo '{{"id":77,"name":"Merge Queue Auto-Enroll","path":".github/workflows/merge-queue-autoenroll.yml","html_url":"https://github.com/JovieInc/Jovie/actions/runs/77","repository":{{"full_name":"JovieInc/Jovie"}},"head_repository":{{"full_name":"JovieInc/Jovie"}},"head_sha":"{head}","workflow_id":99,"run_attempt":1}}'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=hold-intake "
                    "DRAIN_ADMISSION_PR=910 "
                    f"DRAIN_ADMISSION_HEAD={head} DRAIN_FLEET_GATE_B64={encoded} "
                    "FLEET_HOLD_TTL_SECONDS=3600 GITHUB_RUN_ID=77 "
                    "GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "would close jovie-fleet-queue-hold/v1 on #910 -> success" in result.stdout
        assert "waiting-lane" in result.stdout
        assert "[dry-run] would +merge-queue on #910" in result.stdout

    def test_hold_intake_dequeues_deterministic_failing_member_and_keeps_green_sibling(
        self, tmp_path: Path
    ) -> None:
        green_head = "c" * 40
        fail_head = "d" * 40
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "promotionMode": "hold-intake",
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "signals": {
                "main": {"status": "green", "sha": "a" * 40},
                "production": {"status": "green", "deployedSha": "b" * 40},
                "controller": {"status": "green"},
                "queue": {
                    "status": "known",
                    "eligiblePrs": 2,
                    "greenReadyPrs": 1,
                    "target": 15,
                },
                "integrity": {"status": "clear"},
            },
            "promotionAdmission": {"allowed": False},
            "isolatedPromotionAdmission": {
                "allowed": False,
                "deploymentsAllowed": False,
            },
            "productionUnboundRepairAdmission": {
                "allowed": True,
                "condition": "production-deployment-unbound",
                "mainSha": "a" * 40,
                "deployedSha": "b" * 40,
                "maxConcurrent": 1,
                "deploymentsAllowed": False,
            },
            "alreadyAdmittedCohort": {
                "preserve": True,
                "newIntakeAllowed": True,
                "semantics": "preserve-cohort-and-continue-isolated-implementation",
            },
        }
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":901,"t":"Green sibling","draft":false,"m":"MERGEABLE","head":"codex/jov-901","headOid":"{green_head}","base":"main","L":["merge-queue"],"fail":[]}},{{"n":902,"t":"Deterministic fail","draft":false,"m":"MERGEABLE","head":"codex/jov-902","headOid":"{fail_head}","base":"main","L":["merge-queue"],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  if [[ "$*" == *"902"* ]]; then
                    echo '[{{"name":"PR Ready","bucket":"fail","state":"FAILURE"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                    exit 0
                  fi
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=hold-intake "
                    f"DRAIN_FLEET_GATE_B64={encoded}"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "would -merge-queue on #902" in result.stdout
        assert "would -merge-queue on #901" not in result.stdout
        assert "fleet promotion constraint" not in result.stdout

    def test_production_recovery_reenrolls_only_a_previously_exact_held_head(
        self, tmp_path: Path
    ) -> None:
        """A hold-intake CI candidate resumes automatically after production binds."""
        head = "a" * 40
        state = tmp_path / "state"
        state.write_text("unqueued", encoding="utf-8")
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\\
                #!/usr/bin/env bash
                set -euo pipefail
                phase_file={state}
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":905,"t":"Exact held candidate","body":"ordinary PR","draft":false,"m":"MERGEABLE","head":"codex/jov-905","headOid":"{head}","base":"main","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  if [[ "$(cat "$phase_file")" == "queued" ]]; then labels='[{{"name":"merge-queue"}}]'; else labels='[]'; fi
                  printf '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":%s,"headRefOid":"{head}","baseRefName":"main","body":"ordinary PR"}}\\n' "$labels"
                  exit 0
                fi
                if [[ "$1 $2" == "pr edit" ]]; then
                  printf queued >"$phase_file"
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ " $* " == *"/commits/{head}/status "* ]]; then
                    echo '{{"statuses":[{{"context":"jovie-fleet-queue-hold/v1","state":"pending","creator":{{"type":"Bot","login":"jovie-bot[bot]"}},"target_url":"https://github.com/JovieInc/Jovie/actions/runs/77","updated_at":"2026-08-15T12:00:00Z"}}]}}'
                    exit 0
                  fi
                  if [[ " $* " == *"/statuses/{head} "* ]]; then exit 0; fi
                  if [[ "$2" == "repos/JovieInc/Jovie/actions/runs/77" ]]; then
                    echo '{{"id":77,"name":"Merge Queue Auto-Enroll","path":".github/workflows/merge-queue-autoenroll.yml","html_url":"https://github.com/JovieInc/Jovie/actions/runs/77","repository":{{"full_name":"JovieInc/Jovie"}},"head_repository":{{"full_name":"JovieInc/Jovie"}},"head_sha":"{head}","workflow_id":99,"run_attempt":1}}'
                    exit 0
                  fi
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRAIN_RECOVER_FLEET_HOLDS=1 "
                    "GITHUB_RUN_ID=77 GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\\nstderr={result.stderr}"
        assert "exact fleet recovery at " + head in result.stdout
        assert "+merge-queue on #905" in result.stdout
        assert "-jovie-fleet-queue-hold/v1 on #905" in result.stdout
        assert state.read_text(encoding="utf-8").strip() == "queued"

    def test_native_fleet_hold_recovery_requires_positioned_exact_head_receipt(
        self, tmp_path: Path
    ) -> None:
        head = "f" * 40
        enroll_calls = tmp_path / "enroll-calls"
        queue_state = tmp_path / "queue-state"
        enroll_calls.write_text("0", encoding="utf-8")
        queue_state.write_text("unqueued", encoding="utf-8")
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  list-state)
                    state=$(<"${{FAKE_QUEUE_STATE:?}}")
                    if [[ "$state" == "queued" ]]; then
                      echo '{{"906":{{"headRefOid":"{head}","queued":true,"autoMergeEnabled":false}}}}'
                    else
                      echo '{{"906":{{"headRefOid":"{head}","queued":false,"autoMergeEnabled":false}}}}'
                    fi
                    ;;
                  enroll)
                    count=$(<"${{FAKE_ENROLL_CALLS:?}}")
                    echo "$((count + 1))" >"${{FAKE_ENROLL_CALLS:?}}"
                    printf queued >"${{FAKE_QUEUE_STATE:?}}"
                    echo '{{"changed":true,"state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}","mergeQueueEntry":{{"id":"MQE_906","state":"AWAITING_CHECKS","position":1}}}}}}'
                    ;;
                  dequeue) echo '{{"state":{{"queued":false}}}}' ;;
                  max-queue-depth) echo 16 ;;
                  --classify-queue) echo '[]' ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":906,"t":"Native held candidate","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/native-hold","headOid":"{head}","headOwner":"JovieInc","cross":false,"base":"main","body":"","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{head}","baseRefName":"main","body":""}}'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ " $* " == *"/commits/{head}/status "* ]]; then
                    echo '{{"statuses":[{{"context":"jovie-fleet-queue-hold/v1","state":"pending","creator":{{"type":"Bot","login":"jovie-bot[bot]"}},"target_url":"https://github.com/JovieInc/Jovie/actions/runs/77","updated_at":"2026-08-15T12:00:00Z"}}]}}'
                    exit 0
                  fi
                  if [[ " $* " == *"/statuses/{head} "* ]]; then
                    echo '{{}}'; exit 0
                  fi
                  if [[ "$2" == "repos/JovieInc/Jovie/actions/runs/77" ]]; then
                    echo '{{"id":77,"name":"Merge Queue Auto-Enroll","path":".github/workflows/merge-queue-autoenroll.yml","html_url":"https://github.com/JovieInc/Jovie/actions/runs/77","repository":{{"full_name":"JovieInc/Jovie"}},"head_repository":{{"full_name":"JovieInc/Jovie"}},"head_sha":"{head}","workflow_id":99,"run_attempt":1}}'
                    exit 0
                  fi
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)

        result = _run_bash(
            _drain_command(
                tmp_path,
                backend="native",
                extra_env=(
                    "DRAIN_RECOVER_FLEET_HOLDS=1 "
                    f"FAKE_ENROLL_CALLS={enroll_calls} FAKE_QUEUE_STATE={queue_state} "
                    "GITHUB_RUN_ID=77 "
                    "GITHUB_SERVER_URL=https://github.com"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "exact fleet recovery at " + head in result.stdout
        assert "+native-queue on #906" in result.stdout
        assert "-jovie-fleet-queue-hold/v1 on #906" in result.stdout
        assert enroll_calls.read_text(encoding="utf-8").strip() == "1"

    def test_queued_exact_head_closes_pending_fleet_hold_once_without_reenroll(
        self, tmp_path: Path
    ) -> None:
        head = "9" * 40
        hold_state = tmp_path / "hold-state"
        enroll_calls = tmp_path / "enroll-calls"
        status_writes = tmp_path / "status-writes"
        hold_state.write_text("pending", encoding="utf-8")
        enroll_calls.write_text("0", encoding="utf-8")
        status_writes.write_text("0", encoding="utf-8")
        fake_node = tmp_path / "node"
        fake_node.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                case "${{2:-}}" in
                  preflight) exit 0 ;;
                  list-state) echo '{{"907":{{"headRefOid":"{head}","queued":true,"autoMergeEnabled":true}}}}' ;;
                  enroll)
                    count=$(<"${{FAKE_ENROLL_CALLS:?}}")
                    echo "$((count + 1))" >"${{FAKE_ENROLL_CALLS:?}}"
                    echo '{{"changed":false,"state":{{"state":"OPEN","isDraft":false,"headRefOid":"{head}","mergeQueueEntry":{{"id":"MQE_907","state":"AWAITING_CHECKS","position":1}}}}}}'
                    ;;
                  dequeue) echo '{{"state":{{"queued":false}}}}' ;;
                  max-queue-depth) echo 16 ;;
                  --classify-queue) echo '[]' ;;
                  *) echo "unexpected node args: $*" >&2; exit 2 ;;
                esac
                """
            ),
            encoding="utf-8",
        )
        fake_node.chmod(fake_node.stat().st_mode | stat.S_IXUSR)
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":907,"t":"Queued held candidate","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/queued-hold","headOid":"{head}","headOwner":"JovieInc","cross":false,"base":"main","body":"","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{head}","baseRefName":"main","body":""}}'
                  exit 0
                fi
                if [[ "$1" == "api" ]]; then
                  if [[ " $* " == *"/commits/{head}/status "* ]]; then
                    state=$(<"${{FAKE_HOLD_STATE:?}}")
                    printf '{{"statuses":[{{"context":"jovie-fleet-queue-hold/v1/pr-907","description":"PR #907: fleet hold","state":"%s","creator":{{"type":"Bot","login":"jovie-bot[bot]"}},"target_url":"https://github.com/JovieInc/Jovie/actions/runs/77","updated_at":"2026-08-15T12:00:00Z"}},{{"context":"jovie-queue-reentry/v1/pr-907","description":"PR #907: Native queue admission recorded at exact head","state":"success","creator":{{"type":"Bot","login":"jovie-bot[bot]"}},"target_url":"https://github.com/JovieInc/Jovie/actions/runs/77","updated_at":"2026-08-15T12:00:01Z"}}]}}\n' "$state"
                    exit 0
                  fi
                  if [[ " $* " == *"/statuses/{head} "* ]]; then
                    count=$(<"${{FAKE_STATUS_WRITES:?}}")
                    echo "$((count + 1))" >"${{FAKE_STATUS_WRITES:?}}"
                    printf success >"${{FAKE_HOLD_STATE:?}}"
                    echo '{{}}'; exit 0
                  fi
                  if [[ "$2" == "repos/JovieInc/Jovie/actions/runs/77" ]]; then
                    echo '{{"id":77,"name":"Merge Queue Auto-Enroll","path":".github/workflows/merge-queue-autoenroll.yml","html_url":"https://github.com/JovieInc/Jovie/actions/runs/77","repository":{{"full_name":"JovieInc/Jovie"}},"head_repository":{{"full_name":"JovieInc/Jovie"}},"head_sha":"{head}","workflow_id":99,"run_attempt":1}}'
                    exit 0
                  fi
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)
        command = _drain_command(
            tmp_path,
            backend="native",
            extra_env=(
                "DRAIN_RECOVER_FLEET_HOLDS=1 "
                f"FAKE_HOLD_STATE={hold_state} FAKE_ENROLL_CALLS={enroll_calls} "
                f"FAKE_STATUS_WRITES={status_writes} GITHUB_RUN_ID=77 "
                "GITHUB_SERVER_URL=https://github.com"
            ),
        )

        first = _run_bash(command)
        second = _run_bash(command)

        assert first.returncode == 0, f"stdout={first.stdout}\nstderr={first.stderr}"
        assert second.returncode == 0, f"stdout={second.stdout}\nstderr={second.stderr}"
        assert "validating queued exact head before closing stale fleet hold" in first.stdout
        assert "validating queued exact head before closing stale fleet hold" not in second.stdout
        assert enroll_calls.read_text(encoding="utf-8").strip() == "1"
        # The prior queue-reentry receipt is reused; only the terminal hold
        # status is written and the second maintenance pass is idempotent.
        assert status_writes.read_text(encoding="utf-8").strip() == "1"

    def test_hold_intake_does_not_dequeue_transient_unknown_mergeable(
        self, tmp_path: Path
    ) -> None:
        queued_head = "e" * 40
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "promotionMode": "hold-intake",
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "signals": {
                "main": {"status": "green", "sha": "a" * 40},
                "production": {"status": "green", "deployedSha": "b" * 40},
                "controller": {"status": "green"},
                "queue": {
                    "status": "known",
                    "eligiblePrs": 1,
                    "greenReadyPrs": 1,
                    "target": 15,
                },
                "integrity": {"status": "clear"},
            },
            "promotionAdmission": {"allowed": False},
            "isolatedPromotionAdmission": {
                "allowed": False,
                "deploymentsAllowed": False,
            },
            "productionUnboundRepairAdmission": {
                "allowed": True,
                "condition": "production-deployment-unbound",
                "mainSha": "a" * 40,
                "deployedSha": "b" * 40,
                "maxConcurrent": 1,
                "deploymentsAllowed": False,
            },
            "alreadyAdmittedCohort": {
                "preserve": True,
                "newIntakeAllowed": True,
                "semantics": "preserve-cohort-and-continue-isolated-implementation",
            },
        }
        encoded = base64.b64encode(json.dumps(receipt).encode()).decode()
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":903,"t":"Transient unknown mergeable","draft":false,"m":"UNKNOWN","head":"codex/jov-903","headOid":"{queued_head}","base":"main","L":["merge-queue"],"fail":[]}}]'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_PROMOTION_MODE=hold-intake "
                    f"DRAIN_FLEET_GATE_B64={encoded}"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "would -merge-queue on #903" not in result.stdout
        assert "fleet promotion constraint" not in result.stdout
        assert "queue depth: 1/" in result.stdout

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
            "return f'{env_prefix}bash \"{_RELEASE_SCRIPT}\"'",
        ]
        assert 'DRAIN_EXPECT_GH="{fake_gh}"' in source
        assert "DRAIN_MUTATION_AUTHORIZATION=test-fixture" in source

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
                [{"n":123,"t":"Red CI PR","draft":false,"m":"MERGEABLE","head":"codex/jov-123-red","base":"main","L":[],"fail":[]}]
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
        admitted_head = "a" * 40
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  cat <<'JSON'
                [{{"n":456,"t":"Taste approved PR","draft":false,"m":"MERGEABLE","head":"codex/jov-456-taste","base":"main","L":["needs-human","approved:taste"],"fail":[]}},{{"n":789,"t":"Human gated PR","draft":false,"m":"MERGEABLE","head":"codex/jov-789-human","base":"main","L":["needs-human","merge-queue"],"fail":[]}},{{"n":102,"t":"Deferred PR","draft":false,"m":"MERGEABLE","head":"codex/jov-102-deferred","base":"main","L":["queue-deferred","merge-queue"],"fail":[]}},{{"n":103,"t":"Draft PR","draft":true,"m":"MERGEABLE","head":"codex/jov-103-draft","base":"main","L":["merge-queue"],"fail":[]}},{{"n":101,"t":"Target clean PR","draft":false,"m":"MERGEABLE","head":"codex/jov-101-clean","base":"main","L":[],"fail":[]}},{{"n":104,"t":"Unrelated clean PR","draft":false,"m":"MERGEABLE","head":"codex/jov-104-clean","base":"main","L":[],"fail":[]}}]
JSON
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  [[ "$3" == "101" || "$3" == "104" ]]
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  [[ "$3" == "101" ]]
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{admitted_head}","baseRefName":"main"}}'
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
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_ADMISSION_PR=101 "
                    f"DRAIN_ADMISSION_HEAD={admitted_head}"
                ),
            )
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
        assert "[dry-run] would +merge-queue on #104" not in result.stdout
        assert "=== SURFACE (human decision; not touched) ===" in result.stdout
        assert "#456" in result.stdout
        assert "#789" in result.stdout

    def test_maintenance_only_run_cannot_admit_a_clean_pr(self, tmp_path: Path) -> None:
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{"n":105,"t":"Clean PR","draft":false,"m":"MERGEABLE","head":"codex/jov-105-clean","L":[],"fail":[]}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}]'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        result = _run_bash(_drain_command(tmp_path, extra_env="DRY_RUN=1"))

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "admission scope: maintenance-only" in result.stdout
        assert "would +merge-queue" not in result.stdout

    def test_exact_head_mismatch_refuses_targeted_admission(self, tmp_path: Path) -> None:
        live_head = "a" * 40
        event_head = "b" * 40
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{{"n":106,"t":"Head moved","draft":false,"m":"MERGEABLE","head":"codex/jov-106-moved","base":"main","L":[],"fail":[]}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr checks" ]]; then
                  echo '[{{"name":"PR Ready","bucket":"pass","state":"SUCCESS"}},{{"name":"Migration Guard","bucket":"pass","state":"SUCCESS"}},{{"name":"Fork PR Gate","bucket":"pass","state":"SUCCESS"}},{{"name":"PR Size Guard","bucket":"pass","state":"SUCCESS"}}]'
                  exit 0
                fi
                if [[ "$1 $2" == "pr view" ]]; then
                  echo '{{"state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","labels":[],"headRefOid":"{live_head}","baseRefName":"main"}}'
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
            _drain_command(
                tmp_path,
                extra_env=(
                    "DRY_RUN=1 DRAIN_ADMISSION_PR=106 "
                    f"DRAIN_ADMISSION_HEAD={event_head}"
                ),
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "event admission scope no longer matches #106" in result.stdout
        assert "would +merge-queue" not in result.stdout

    def test_main_push_preserves_queue_deferred_without_typed_provenance(
        self, tmp_path: Path
    ) -> None:
        """Main maintenance cannot infer that an explicit hold is temporary."""
        fake_gh = tmp_path / "gh"
        fake_gh.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1 $2" == "pr list" ]]; then
                  echo '[{"n":700,"t":"Repair hold","draft":false,"m":"MERGEABLE","ms":"CLEAN","head":"codex/repair-hold","base":"main","L":["queue-deferred"],"fail":[]}]'
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 2
                """
            ),
            encoding="utf-8",
        )
        fake_gh.chmod(
            fake_gh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
        )

        result = _run_bash(
            _drain_command(
                tmp_path,
                extra_env="DRY_RUN=1 DRAIN_RECONCILE_QUEUE_DEFERRED=1",
            )
        )

        assert result.returncode == 0, f"stdout={result.stdout}\\nstderr={result.stderr}"
        assert "RECONCILE (disabled; preserving queue-deferred holds)" in result.stdout
        assert "no typed pressure-deferral provenance" in result.stdout
        assert "would -queue-deferred" not in result.stdout
        assert "#700" in result.stdout
        assert "{queue-deferred}" in result.stdout


# ---------------------------------------------------------------------------
# Queue-deferred release (JOV-5054): mechanical `jovie-queue-deferral/v1`
# provenance plus untyped ready holds may be lifted under a fresh GREEN
# fleet receipt. Human-policy holds (taste, net-new, outbound) stay held.
# The scanner covers every queue-deferred PR, not only agent branches.
# ---------------------------------------------------------------------------

_RELEASE_SCRIPT = _REPO_ROOT / "scripts" / "release-queue-deferred.sh"
_RELEASE_WORKFLOW = _REPO_ROOT / ".github" / "workflows" / "queue-deferred-release.yml"
_FLEET_GATE_REFRESH_WORKFLOW = (
    _REPO_ROOT / ".github" / "workflows" / "fleet-gate-refresh.yml"
)


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
    deferred_minutes: int = 120,
    pr: int = 900,
    author: str = "itstimwhite",
    reason: str = "symphony-birth-hold",
    source: str = "symphony",
) -> None:
    deferred = datetime.now(timezone.utc) - timedelta(minutes=deferred_minutes)
    receipt = {
        "schema": "jovie-queue-deferral/v1",
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
        # CI and Production Controller are upstream semantic inputs to Fleet
        # Gate Refresh. Queue-Deferred Release consumes only the resulting
        # fresh gate receipt, so the controllers cannot recursively wake each
        # other without a new upstream capacity signal.
        assert "workflows: [CI, Production Controller]" in fleet_gate_refresh
        assert "Queue-Deferred Release]" not in fleet_gate_refresh
        assert "workflows: ['Fleet Gate Refresh']" in workflow
        assert "workflows: ['CI', 'Production Controller', 'Fleet Gate Refresh']" not in workflow
        assert "pull_request:" in fleet_gate_refresh
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

    def test_untyped_hold_with_taste_stays_held(self, tmp_path: Path) -> None:
        head = "c" * 40
        result = _run_single_candidate_release(
            tmp_path,
            head=head,
            labels=["queue-deferred", "needs:taste"],
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "human-policy-hold:needs:taste" in result.stdout
        assert "would remove" not in result.stdout

    def test_untyped_hold_with_net_new_stays_held(self, tmp_path: Path) -> None:
        head = "c" * 40
        result = _run_single_candidate_release(
            tmp_path,
            head=head,
            labels=["queue-deferred", "net-new"],
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "human-policy-hold:net-new" in result.stdout
        assert "would remove" not in result.stdout

    def test_untyped_hold_with_outbound_stays_held(self, tmp_path: Path) -> None:
        head = "c" * 40
        result = _run_single_candidate_release(
            tmp_path,
            head=head,
            labels=["queue-deferred", "outbound"],
        )

        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        assert "human-policy-hold:outbound" in result.stdout
        assert "would remove" not in result.stdout

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
