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
from datetime import datetime, timezone
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
        'MERGE_QUEUE_BACKEND=test-label-fixture '
    )
    if extra_env:
        env_prefix += f"{extra_env} "
    return f'{env_prefix}bash "{_DRAIN_SCRIPT}"'



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

    def test_blocked_receipt_dry_run_dequeues_ordinary_native_intent(
        self, tmp_path: Path
    ) -> None:
        queued_head = "9" * 40
        receipt = {
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
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
        assert "fleet promotion constraint" in result.stdout
        assert "would record jovie-fleet-queue-hold/v1" in result.stdout
        assert "[dry-run] would -merge-queue on #909" in result.stdout
        assert "queue depth: 0/0 (0 slots)" in result.stdout
        assert "would +merge-queue" not in result.stdout

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
        assert helper_launches == ["return f'{env_prefix}bash \"{_DRAIN_SCRIPT}\"'"]
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
