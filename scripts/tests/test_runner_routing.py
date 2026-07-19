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
) -> tuple[subprocess.CompletedProcess[str], dict[str, str]]:
    _fake_gh(tmp_path)
    if runs_json is None or jobs_json is None:
        exact_runs, exact_jobs = _exact_evidence()
        runs_json = exact_runs if runs_json is None else runs_json
        jobs_json = exact_jobs if jobs_json is None else jobs_json
    output = tmp_path / "github-output"
    env = os.environ.copy()
    env.update(
        {
            "PATH": f"{tmp_path}:{env['PATH']}",
            "GH_REPO": "JovieInc/Jovie",
            "GITHUB_OUTPUT": str(output),
            "HEARTBEAT_MAX_AGE_SECONDS": "900",
            "HEARTBEAT_API_TIMEOUT_SECONDS": timeout_seconds,
            "FAKE_RUNS_JSON": runs_json,
            "FAKE_JOBS_JSON": jobs_json,
            "FAKE_GH_ERROR": api_error,
            "FAKE_GH_SLEEP_SECONDS": sleep_seconds,
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
    return result, outputs


def test_exact_fresh_run_and_job_prove_fixed_runner_health(tmp_path: Path) -> None:
    result, outputs = _run_query(tmp_path)

    assert result.returncode == 0, result.stderr
    assert outputs["health"] == "up"
    assert "run 29672288797 attempt 1" in outputs["evidence"]


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
    route = ""
    if output.exists():
        route = output.read_text(encoding="utf-8").strip().split("=", 1)[1]
    return result, route


def test_route_selects_only_allowlisted_fixed_or_hosted_labels(tmp_path: Path) -> None:
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
    assert fixed == "jovie-runner"
    assert hosted == "ubuntu-latest"
    assert missing == "ubuntu-latest"


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
    assert route == "ubuntu-latest"


def test_ci_route_is_trusted_secretless_bounded_and_nonblocking() -> None:
    route = _job_block("ci.yml", "ci-unit-runner-route")
    units = _job_block("ci.yml", "ci-unit-tests")
    query = _QUERY_SCRIPT.read_text(encoding="utf-8")

    assert "runs-on: ubuntu-latest" in route
    assert "ref: main" in route
    assert "persist-credentials: false" in route
    assert "sparse-checkout: .github/scripts/query-runner-heartbeat.sh" in route
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
    assert "HEARTBEAT_API_TIMEOUT_SECONDS: '20'" in route
    assert "jovie-runner|ubuntu-latest" in route
    assert "runner='ubuntu-latest'" in route
    assert query.count('timeout "${HEARTBEAT_API_TIMEOUT_SECONDS}s" gh api') == 2
    assert 'head_repository.full_name == $repo' in query
    assert '.[0].run_id == $run_id' in query
    assert '.[0].head_sha == $head_sha' in query
    assert 'index("jovie-runner") != null' in query
    assert "needs: [ci-path-changes, ci-unit-runner-route]" in units
    assert (
        "runs-on: ${{ needs.ci-unit-runner-route.outputs.runner || "
        "'ubuntu-latest' }}"
    ) in units
    assert "vars.CI_UNIT_RUNNER" not in units
    assert "max-parallel: 2" in units


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
