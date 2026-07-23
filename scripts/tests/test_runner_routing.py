"""Regression tests for exact, conservative per-run CI runner routing."""

from __future__ import annotations

import json
import os
import stat
import subprocess
import textwrap
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

_REPO_ROOT = Path(__file__).resolve().parents[2]
_WORKFLOWS = _REPO_ROOT / ".github" / "workflows"
_QUERY_SCRIPT = _REPO_ROOT / ".github" / "scripts" / "query-runner-heartbeat.sh"
_AWAIT_SCRIPT = _REPO_ROOT / ".github" / "scripts" / "await-runner-heartbeat.sh"
_FIXTURE_GH = (
    _REPO_ROOT / "scripts" / "tests" / "fixtures" / "runner-heartbeat-gh" / "gh"
)


def _job_block(workflow: str, job_name: str) -> str:
    content = (_WORKFLOWS / workflow).read_text(encoding="utf-8")
    marker = f"  {job_name}:\n"
    assert marker in content
    remainder = content.split(marker, 1)[1]
    lines: list[str] = []
    for line in remainder.splitlines():
        if line.startswith("  ") and not line.startswith("    "):
            break
        lines.append(line)
    return "\n".join(lines)


def _step_run_script(workflow: str, job_name: str, step_name: str) -> str:
    job = _job_block(workflow, job_name)
    marker = f"      - name: {step_name}\n"
    assert marker in job
    step = job.split(marker, 1)[1]
    run_marker = "        run: |\n"
    assert run_marker in step
    body = step.split(run_marker, 1)[1]
    lines: list[str] = []
    for line in body.splitlines():
        if line.startswith("      - "):
            break
        if not line:
            lines.append("")
            continue
        if not line.startswith("          "):
            break
        lines.append(line[10:])
    return "\n".join(lines) + "\n"


def _fake_gh(tmp_path: Path) -> Path:
    fake = tmp_path / "gh"
    fake.write_text(
        textwrap.dedent(
            """\
            #!/usr/bin/env bash
            set -euo pipefail
            endpoint=''
            for argument in "$@"; do
              if [[ "$argument" == repos/* ]]; then
                endpoint="$argument"
              fi
            done
            if [[ -n "${FAKE_GH_SLEEP_SECONDS:-}" ]]; then
              sleep "$FAKE_GH_SLEEP_SECONDS"
            fi
            if [[ -n "${FAKE_GH_INVOCATION_MARKER:-}" ]]; then
              printf 'invoked\n' >> "$FAKE_GH_INVOCATION_MARKER"
            fi
            if [[ -n "${FAKE_GH_ERROR:-}" ]]; then
              echo "$FAKE_GH_ERROR" >&2
              exit 1
            fi
            if [[ "$endpoint" == *'/jobs?per_page=100' ]]; then
              printf '%s\n' "${FAKE_JOBS_JSON:?}"
            else
              printf '%s\n' "${FAKE_RUNS_JSON:?}"
            fi
            """
        ),
        encoding="utf-8",
    )
    fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
    return fake


def _exact_evidence(
    *,
    observed_at: Optional[str] = None,
    run_updates: Optional[dict[str, Any]] = None,
    job_updates: Optional[dict[str, Any]] = None,
) -> tuple[str, str]:
    if observed_at is None:
        observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    head_sha = "a" * 40
    run: dict[str, Any] = {
        "id": 29672288797,
        "run_attempt": 1,
        "name": "Runner Heartbeat",
        "path": ".github/workflows/runner-heartbeat.yml",
        "head_branch": "main",
        "head_sha": head_sha,
        "head_repository": {"full_name": "JovieInc/Jovie"},
        "event": "schedule",
        "status": "completed",
        "conclusion": "success",
        "updated_at": observed_at,
        "html_url": "https://github.com/JovieInc/Jovie/actions/runs/29672288797",
    }
    if run_updates:
        run.update(run_updates)
    job: dict[str, Any] = {
        "id": 843137,
        "run_id": run["id"],
        "run_attempt": run["run_attempt"],
        "head_sha": run.get("head_sha", head_sha),
        "name": "Self-hosted runner heartbeat",
        "status": "completed",
        "conclusion": "success",
        "runner_id": 55,
        "runner_name": "gem-linux-2",
        # Live API proof returns requested job labels, not all registration labels.
        "labels": ["jovie-runner"],
    }
    if job_updates:
        job.update(job_updates)
    return json.dumps({"workflow_runs": [run]}), json.dumps([{"jobs": [job]}])


def _run_query(
    tmp_path: Path,
    *,
    runs_json: Optional[str] = None,
    jobs_json: Optional[str] = None,
    api_error: str = "",
    sleep_seconds: str = "",
    timeout_seconds: str = "20",
    expected_event: str = "",
    expected_sha: str = "",
    github_actions_context: bool = False,
    invocation_marker: Optional[Path] = None,
) -> tuple[subprocess.CompletedProcess[str], dict[str, str]]:
    tmp_path.mkdir(parents=True, exist_ok=True)
    fake_gh = _fake_gh(tmp_path)
    if runs_json is None or jobs_json is None:
        exact_runs, exact_jobs = _exact_evidence()
        runs_json = exact_runs if runs_json is None else runs_json
        jobs_json = exact_jobs if jobs_json is None else jobs_json
    output = tmp_path / "github-output"
    env = os.environ.copy()
    # Fixture injection is deliberately unavailable to production Actions
    # invocations. The test subprocess opts out of that parent context and
    # passes the exact helper path instead of relying on PATH resolution.
    env.pop("GITHUB_ACTIONS", None)
    env.update(
        {
            "GH_REPO": "JovieInc/Jovie",
            "GITHUB_OUTPUT": str(output),
            "HEARTBEAT_GH_TEST_HELPER": str(fake_gh),
            "HEARTBEAT_GH_TEST_MODE": "1",
            "HEARTBEAT_MAX_AGE_SECONDS": "900",
            "HEARTBEAT_API_TIMEOUT_SECONDS": timeout_seconds,
            "HEARTBEAT_EXPECTED_EVENT": expected_event,
            "HEARTBEAT_EXPECTED_SHA": expected_sha,
            "FAKE_RUNS_JSON": runs_json,
            "FAKE_JOBS_JSON": jobs_json,
            "FAKE_GH_ERROR": api_error,
            "FAKE_GH_SLEEP_SECONDS": sleep_seconds,
            "FAKE_GH_INVOCATION_MARKER": (
                str(invocation_marker) if invocation_marker is not None else ""
            ),
        }
    )
    if github_actions_context:
        env["GITHUB_ACTIONS"] = "true"
    result = subprocess.run(
        ["bash", str(_QUERY_SCRIPT)],
        cwd=_REPO_ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )
    outputs: dict[str, str] = {}
    if output.exists():
        for line in output.read_text(encoding="utf-8").splitlines():
            key, value = line.split("=", 1)
            outputs[key] = value
    return result, outputs


def _run_fixture_query(
    tmp_path: Path,
    scenario: str,
    *,
    attempts: int = 3,
) -> tuple[subprocess.CompletedProcess[str], dict[str, str], int]:
    tmp_path.mkdir(parents=True, exist_ok=True)
    state_dir = tmp_path / "fixture-state"
    output = tmp_path / "github-output"
    fake_sleep = tmp_path / "sleep"
    fake_sleep.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    fake_sleep.chmod(fake_sleep.stat().st_mode | stat.S_IXUSR)
    env = os.environ.copy()
    env.pop("GITHUB_ACTIONS", None)
    env.update(
        {
            "PATH": f"{tmp_path}:{env['PATH']}",
            "GH_REPO": "JovieInc/Jovie",
            "GITHUB_OUTPUT": str(output),
            "HEARTBEAT_GH_TEST_HELPER": str(_FIXTURE_GH),
            "HEARTBEAT_GH_TEST_MODE": "1",
            "HEARTBEAT_MAX_AGE_SECONDS": "900",
            "HEARTBEAT_API_TIMEOUT_SECONDS": "5",
            "HEARTBEAT_JOB_POLL_ATTEMPTS": str(attempts),
            "HEARTBEAT_JOB_POLL_INTERVAL_SECONDS": "1",
            "HEARTBEAT_FIXTURE_SCENARIO": scenario,
            "HEARTBEAT_FIXTURE_STATE_DIR": str(state_dir),
        }
    )
    result = subprocess.run(
        ["bash", str(_QUERY_SCRIPT)],
        cwd=_REPO_ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )
    outputs: dict[str, str] = {}
    if output.exists():
        for line in output.read_text(encoding="utf-8").splitlines():
            key, value = line.split("=", 1)
            outputs[key] = value
    jobs_count_file = state_dir / "jobs-count"
    jobs_count = int(jobs_count_file.read_text(encoding="utf-8"))
    return result, outputs, jobs_count


def _run_await(
    tmp_path: Path,
    states: list[tuple[str, str, str]],
    *,
    attempts: int,
) -> tuple[subprocess.CompletedProcess[str], dict[str, str], int]:
    tmp_path.mkdir(parents=True, exist_ok=True)
    state_file = tmp_path / "states"
    state_file.write_text(
        "\n".join("|".join(state) for state in states) + "\n", encoding="utf-8"
    )
    count_file = tmp_path / "count"
    query = tmp_path / "query"
    query.write_text(
        textwrap.dedent(
            """\
            #!/usr/bin/env bash
            set -euo pipefail
            count=0
            [[ ! -f "$FAKE_QUERY_COUNT" ]] || count="$(cat "$FAKE_QUERY_COUNT")"
            count=$((count + 1))
            echo "$count" > "$FAKE_QUERY_COUNT"
            record="$(sed -n "${count}p" "$FAKE_QUERY_STATES")"
            if [[ -z "$record" ]]; then
              record="$(tail -n 1 "$FAKE_QUERY_STATES")"
            fi
            IFS='|' read -r health probe_state evidence <<< "$record"
            {
              echo "health=$health"
              echo "probe_state=$probe_state"
              echo "evidence=$evidence"
            } >> "$GITHUB_OUTPUT"
            """
        ),
        encoding="utf-8",
    )
    query.chmod(query.stat().st_mode | stat.S_IXUSR)
    fake_sleep = tmp_path / "sleep"
    fake_sleep.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    fake_sleep.chmod(fake_sleep.stat().st_mode | stat.S_IXUSR)
    output = tmp_path / "github-output"
    env = os.environ.copy()
    env.update(
        {
            "PATH": f"{tmp_path}:{env['PATH']}",
            "GITHUB_OUTPUT": str(output),
            "RUNNER_HEARTBEAT_QUERY_HELPER": str(query),
            "HEARTBEAT_POLL_ATTEMPTS": str(attempts),
            "HEARTBEAT_POLL_INTERVAL_SECONDS": "1",
            "FAKE_QUERY_COUNT": str(count_file),
            "FAKE_QUERY_STATES": str(state_file),
        }
    )
    result = subprocess.run(
        ["bash", str(_AWAIT_SCRIPT)],
        cwd=_REPO_ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )
    outputs: dict[str, str] = {}
    if output.exists():
        for line in output.read_text(encoding="utf-8").splitlines():
            key, value = line.split("=", 1)
            outputs[key] = value
    count = int(count_file.read_text(encoding="utf-8")) if count_file.exists() else 0
    return result, outputs, count


def test_exact_fresh_run_and_job_prove_fixed_runner_health(tmp_path: Path) -> None:
    result, outputs = _run_query(tmp_path)

    assert result.returncode == 0, result.stderr
    assert outputs["health"] == "up", outputs
    assert outputs["probe_state"] == "healthy"
    assert "run 29672288797 attempt 1" in outputs["evidence"]


def test_terminal_run_with_lagging_job_polls_same_attempt_to_settled_success(
    tmp_path: Path,
) -> None:
    result, outputs, jobs_count = _run_fixture_query(
        tmp_path, "lagging-then-settled"
    )

    assert result.returncode == 0, result.stderr
    assert jobs_count == 2
    assert outputs["health"] == "up", outputs
    assert outputs["probe_state"] == "healthy"
    assert "run 29989764821 attempt 1" in outputs["evidence"]


def test_persistent_lag_times_out_fail_closed_after_bounded_job_polls(
    tmp_path: Path,
) -> None:
    result, outputs, jobs_count = _run_fixture_query(
        tmp_path, "persistent-lag", attempts=3
    )

    assert result.returncode == 0, result.stderr
    assert jobs_count == 3
    assert outputs["health"] == "down"
    assert outputs["probe_state"] == "unhealthy"
    assert "remained unsettled after 3 observations" in outputs["evidence"]


def test_job_identity_drift_missing_label_and_non_success_fail_closed(
    tmp_path: Path,
) -> None:
    cases = (
        ("wrong-identity", "uncertain"),
        ("changed-evidence", "uncertain"),
        ("missing-label", "uncertain"),
        ("failed", "unhealthy"),
    )

    for scenario, expected_state in cases:
        result, outputs, _ = _run_fixture_query(tmp_path / scenario, scenario)

        assert result.returncode == 0, result.stderr
        assert outputs["health"] == "down"
        assert outputs["probe_state"] == expected_state, outputs


def test_production_actions_context_cannot_authorize_test_gh_helper(
    tmp_path: Path,
) -> None:
    marker = tmp_path / "fake-gh-invoked"
    result, outputs = _run_query(
        tmp_path,
        github_actions_context=True,
        invocation_marker=marker,
    )

    assert result.returncode == 0, result.stderr
    assert outputs == {
        "health": "down",
        "probe_state": "uncertain",
        "evidence": "heartbeat gh test helper is not authorized",
    }
    assert not marker.exists()


def test_current_exact_queued_or_in_progress_probe_is_the_only_retryable_state(
    tmp_path: Path,
) -> None:
    head_sha = "a" * 40
    for status in ("queued", "in_progress"):
        runs_json, jobs_json = _exact_evidence(
            run_updates={
                "event": "push",
                "status": status,
                "conclusion": None,
            }
        )
        result, outputs = _run_query(
            tmp_path / status,
            runs_json=runs_json,
            jobs_json=jobs_json,
            expected_event="push",
            expected_sha=head_sha,
        )

        assert result.returncode == 0, result.stderr
        assert outputs["health"] == "down"
        assert outputs["probe_state"] == "pending", outputs
        assert f"status={status}" in outputs["evidence"]


def test_current_merge_group_probe_requires_exact_queue_ref_and_sha(
    tmp_path: Path,
) -> None:
    head_sha = "a" * 40
    exact_runs, exact_jobs = _exact_evidence(
        run_updates={
            "event": "merge_group",
            "head_branch": "gh-readonly-queue/main/pr-14469-c3d181de6800",
        }
    )
    accepted, accepted_outputs = _run_query(
        tmp_path / "accepted",
        runs_json=exact_runs,
        jobs_json=exact_jobs,
        expected_event="merge_group",
        expected_sha=head_sha,
    )
    wrong_sha, wrong_sha_outputs = _run_query(
        tmp_path / "wrong-sha",
        runs_json=exact_runs,
        jobs_json=exact_jobs,
        expected_event="merge_group",
        expected_sha="b" * 40,
    )

    assert accepted.returncode == 0, accepted.stderr
    assert accepted_outputs["health"] == "up", accepted_outputs
    assert accepted_outputs["probe_state"] == "healthy"
    assert wrong_sha.returncode == 0, wrong_sha.stderr
    assert wrong_sha_outputs["health"] == "down"
    assert wrong_sha_outputs["probe_state"] == "uncertain"


def test_stale_success_failed_probe_and_api_uncertainty_never_poll(
    tmp_path: Path,
) -> None:
    head_sha = "a" * 40
    stale_at = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat().replace(
        "+00:00", "Z"
    )
    stale_runs, stale_jobs = _exact_evidence(
        observed_at=stale_at,
        run_updates={"event": "push"},
    )
    failed_runs, failed_jobs = _exact_evidence(
        run_updates={"event": "push", "conclusion": "failure"}
    )
    cases = (
        (stale_runs, stale_jobs, "", "unhealthy"),
        (failed_runs, failed_jobs, "", "unhealthy"),
        (None, None, "HTTP 503: unavailable", "uncertain"),
    )

    for index, (runs_json, jobs_json, api_error, expected_state) in enumerate(cases):
        case_dir = tmp_path / str(index)
        case_dir.mkdir()
        result, outputs = _run_query(
            case_dir,
            runs_json=runs_json,
            jobs_json=jobs_json,
            api_error=api_error,
            expected_event="push",
            expected_sha=head_sha,
        )
        assert result.returncode == 0, result.stderr
        assert outputs["health"] == "down"
        assert outputs["probe_state"] == expected_state, outputs


def test_bounded_observer_polls_pending_then_accepts_exact_success(
    tmp_path: Path,
) -> None:
    result, outputs, count = _run_await(
        tmp_path,
        [
            ("down", "pending", "current exact heartbeat is status=in_progress"),
            ("up", "healthy", "current exact heartbeat succeeded"),
        ],
        attempts=3,
    )

    assert result.returncode == 0, result.stderr
    assert count == 2
    assert outputs["health"] == "up"
    assert outputs["probe_state"] == "healthy"


def test_offline_pending_probe_falls_back_after_exact_observation_bound(
    tmp_path: Path,
) -> None:
    result, outputs, count = _run_await(
        tmp_path,
        [("down", "pending", "current exact heartbeat is status=queued")],
        attempts=3,
    )

    assert result.returncode == 0, result.stderr
    assert count == 3
    assert outputs["health"] == "down"
    assert outputs["probe_state"] == "unhealthy"
    assert "remained pending after 3 observations" in outputs["evidence"]


def test_uncertain_or_failed_probe_selects_hosted_without_retry(
    tmp_path: Path,
) -> None:
    for index, state in enumerate(("uncertain", "unhealthy")):
        result, outputs, count = _run_await(
            tmp_path / str(index),
            [("down", state, f"{state} evidence")],
            attempts=10,
        )
        assert result.returncode == 0, result.stderr
        assert count == 1
        assert outputs["health"] == "down"
        assert outputs["probe_state"] == state
        assert "using hosted capacity" in outputs["evidence"]


def test_missing_stale_or_incomplete_evidence_degrades_to_hosted(
    tmp_path: Path,
) -> None:
    stale_at = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat().replace(
        "+00:00", "Z"
    )
    stale_runs, stale_jobs = _exact_evidence(observed_at=stale_at)
    queued_runs, queued_jobs = _exact_evidence(
        run_updates={"status": "queued", "conclusion": None}
    )
    cases = (
        (json.dumps({"workflow_runs": []}), json.dumps([])),
        (stale_runs, stale_jobs),
        (queued_runs, queued_jobs),
    )

    for index, (runs_json, jobs_json) in enumerate(cases):
        case_dir = tmp_path / str(index)
        case_dir.mkdir()
        result, outputs = _run_query(
            case_dir,
            runs_json=runs_json,
            jobs_json=jobs_json,
        )
        assert result.returncode == 0, result.stderr
        assert outputs["health"] == "down"


def test_api_error_timeout_and_malformed_schema_degrade_without_raw_leak(
    tmp_path: Path,
) -> None:
    cases = (
        {"api_error": "HTTP 403: secret diagnostic"},
        {"sleep_seconds": "2", "timeout_seconds": "1"},
        {"runs_json": json.dumps({"workflow_runs": "not-an-array"})},
    )

    for index, case in enumerate(cases):
        case_dir = tmp_path / str(index)
        case_dir.mkdir()
        result, outputs = _run_query(case_dir, **case)
        assert result.returncode == 0, result.stderr
        assert outputs["health"] == "down"
        assert "secret diagnostic" not in result.stdout
        assert "secret diagnostic" not in result.stderr


def test_wrong_run_identity_or_job_attestation_degrades_to_hosted(
    tmp_path: Path,
) -> None:
    wrong_repo = _exact_evidence(
        run_updates={"head_repository": {"full_name": "attacker/fork"}}
    )
    wrong_run_id = _exact_evidence(job_updates={"run_id": 42})
    wrong_head = _exact_evidence(job_updates={"head_sha": "b" * 40})
    missing_label = _exact_evidence(job_updates={"labels": ["ubuntu-latest"]})
    missing_runner = _exact_evidence(job_updates={"runner_id": 0, "runner_name": ""})

    for index, (runs_json, jobs_json) in enumerate(
        (wrong_repo, wrong_run_id, wrong_head, missing_label, missing_runner)
    ):
        case_dir = tmp_path / str(index)
        case_dir.mkdir()
        result, outputs = _run_query(
            case_dir,
            runs_json=runs_json,
            jobs_json=jobs_json,
        )
        assert result.returncode == 0, result.stderr
        assert outputs["health"] == "down"


def _run_route_select(
    tmp_path: Path, health: str
) -> tuple[subprocess.CompletedProcess[str], str]:
    tmp_path.mkdir(parents=True, exist_ok=True)
    output = tmp_path / "github-output"
    env = os.environ.copy()
    env.update(
        {
            "GITHUB_OUTPUT": str(output),
            "HEARTBEAT_HEALTH": health,
            "HEARTBEAT_EVIDENCE": "bounded test evidence",
        }
    )
    script = _step_run_script(
        "ci.yml", "ci-unit-runner-route", "Select conservative unit runner route"
    )
    result = subprocess.run(
        ["bash", "-c", script],
        cwd=_REPO_ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )
    runner_class = ""
    if output.exists():
        runner_class = output.read_text(encoding="utf-8").strip().split("=", 1)[1]
    return result, runner_class


def test_route_emits_only_non_sensitive_fixed_or_hosted_class(tmp_path: Path) -> None:
    fixed_result, fixed = _run_route_select(tmp_path / "fixed", "up")
    hosted_dir = tmp_path / "hosted"
    hosted_dir.mkdir()
    hosted_result, hosted = _run_route_select(hosted_dir, "down")
    missing_dir = tmp_path / "missing"
    missing_dir.mkdir()
    missing_result, missing = _run_route_select(missing_dir, "")

    assert fixed_result.returncode == 0, fixed_result.stderr
    assert hosted_result.returncode == 0, hosted_result.stderr
    assert missing_result.returncode == 0, missing_result.stderr
    assert fixed == "fixed"
    assert hosted == "hosted"
    assert missing == "hosted"


def test_prelanding_missing_trusted_helper_routes_hosted(tmp_path: Path) -> None:
    output = tmp_path / "query-output"
    env = os.environ.copy()
    env.update(
        {
            "GITHUB_OUTPUT": str(output),
            "RUNNER_TEMP": str(tmp_path),
            "GH_TOKEN": "read-only-test-token",
            "GH_REPO": "JovieInc/Jovie",
        }
    )
    script = _step_run_script(
        "ci.yml", "ci-unit-runner-route", "Query exact runner heartbeat"
    )
    result = subprocess.run(
        ["bash", "-c", script],
        cwd=tmp_path,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )
    outputs = dict(
        line.split("=", 1)
        for line in output.read_text(encoding="utf-8").splitlines()
    )

    assert result.returncode == 0, result.stderr
    assert outputs["health"] == "down"
    assert "trusted heartbeat helper unavailable" in outputs["evidence"]
    route_result, route = _run_route_select(tmp_path / "route", outputs["health"])
    assert route_result.returncode == 0, route_result.stderr
    assert route == "hosted"


def test_ci_route_is_trusted_secretless_bounded_and_nonblocking() -> None:
    route = _job_block("ci.yml", "ci-unit-runner-route")
    units = _job_block("ci.yml", "ci-unit-tests")
    query = _QUERY_SCRIPT.read_text(encoding="utf-8")
    awaiter = _AWAIT_SCRIPT.read_text(encoding="utf-8")

    assert "runs-on: ubuntu-latest" in route
    assert "ref: main" in route
    assert "persist-credentials: false" in route
    assert ".github/scripts/await-runner-heartbeat.sh" in route
    assert ".github/scripts/query-runner-heartbeat.sh" in route
    assert route.count("continue-on-error: true") == 2
    assert (
        "name: Checkout trusted runner routing policy\n"
        "        continue-on-error: true"
    ) in route
    assert (
        "name: Query exact runner heartbeat\n"
        "        id: heartbeat\n"
        "        continue-on-error: true"
    ) in route
    assert 'if [ ! -x "$helper" ]' in route
    assert "secrets." not in route
    assert "GH_TOKEN: ${{ github.token }}" in route
    assert "HEARTBEAT_API_TIMEOUT_SECONDS: '5'" in route
    assert "HEARTBEAT_JOB_POLL_ATTEMPTS: '3'" in route
    assert "HEARTBEAT_JOB_POLL_INTERVAL_SECONDS: '2'" in route
    assert "HEARTBEAT_POLL_ATTEMPTS: '10'" in route
    assert "HEARTBEAT_POLL_INTERVAL_SECONDS: '5'" in route
    assert "HEARTBEAT_EXPECTED_EVENT:" in route
    assert "HEARTBEAT_EXPECTED_SHA:" in route
    assert 'timeout 60s "$helper"' in route
    assert "fixed|hosted" in route
    assert "runner_class='hosted'" in route
    assert "runner: ${{ steps.route.outputs.runner }}" not in route
    assert 'GH_API_COMMAND=(gh api)' in query
    assert 'GH_API_COMMAND=(bash "$HEARTBEAT_GH_TEST_HELPER" api)' in query
    assert query.count("heartbeat_gh_api") == 3
    assert "eval " not in query
    assert '"${GITHUB_ACTIONS:-}" == "true"' in query
    assert 'head_repository.full_name == $repo' in query
    assert '.[0].run_id == $run_id' in query
    assert '.[0].head_sha == $head_sha' in query
    assert 'index("jovie-runner") != null' in query
    assert 'jobs_endpoint="repos/$GH_REPO/actions/runs/$run_id/attempts/$run_attempt/jobs?per_page=100"' in query
    assert '.[0].run_attempt == $run_attempt' in query
    assert "HEARTBEAT_JOB_POLL_ATTEMPTS" in query
    assert 'degrade pending "current exact heartbeat' in query
    assert "for ((attempt = 1; attempt <= POLL_ATTEMPTS; attempt++))" in awaiter
    assert 'if [[ "$probe_state" != "pending" ]]' in awaiter
    assert "needs: [ci-path-changes, ci-merge-group-admission]" in units
    assert "ci-unit-runner-route" not in units
    assert "runs-on: ubuntu-latest" in units
    assert "runs-on: jovie-runner" not in units
    assert "vars.CI_UNIT_RUNNER" not in units
    assert "max-parallel: 120" in units
    assert "all five named" in units


def test_merge_group_allocates_no_fixed_runner_probe() -> None:
    heartbeat = (_WORKFLOWS / "runner-heartbeat.yml").read_text(encoding="utf-8")
    route = _job_block("ci.yml", "ci-unit-runner-route")

    assert "push:" in heartbeat
    assert "branches: [main]" in heartbeat
    assert "merge_group:" not in heartbeat
    assert "schedule:" in heartbeat
    assert "workflow_dispatch:" in heartbeat
    assert "pull_request:" not in heartbeat
    assert "workflow_run:" not in heartbeat
    assert "repository_dispatch:" not in heartbeat
    assert heartbeat.count("runs-on: jovie-runner") == 1
    assert "group: runner-heartbeat" in heartbeat
    assert "cancel-in-progress: true" in heartbeat
    assert "matrix:" not in heartbeat
    assert "if: github.event_name == 'workflow_dispatch'" in route
    assert "github.event_name == 'merge_group'" not in route
    assert "actions: write" not in route
    assert "/dispatches" not in route
    assert "gh workflow run" not in route


def test_observers_are_hosted_and_never_mutate_routing_or_fail_on_api_state() -> None:
    standalone = _job_block("runner-health-monitor.yml", "monitor")
    for observer in (_job_block("agent-tick.yml", "runner-health"), standalone):
        assert "runs-on: ubuntu-latest" in observer
        assert "actions: read" in observer
        assert "actions: write" not in observer
        assert "GH_TOKEN: ${{ github.token }}" in observer
        assert ".github/scripts/query-runner-heartbeat.sh" in observer
        assert "continue-on-error: true" in observer
        assert "no routing mutation attempted" in observer
        assert "actions/create-github-app-token" not in observer
        assert "actions/variables" not in observer
        assert "update-runner-routing" not in observer
        assert "reconcile-runner-routing" not in observer

    assert "Open one fixed-runner degradation incident" in standalone
    assert standalone.count("continue-on-error: true") >= 2


def test_legacy_variable_mutators_are_removed_and_query_is_executable() -> None:
    assert not (_REPO_ROOT / ".github/scripts/update-runner-routing.sh").exists()
    assert not (_REPO_ROOT / ".github/scripts/reconcile-runner-routing.sh").exists()
    assert os.access(_QUERY_SCRIPT, os.X_OK)
