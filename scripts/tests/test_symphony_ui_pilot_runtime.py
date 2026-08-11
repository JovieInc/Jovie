"""Deterministic install/runtime regression coverage for the supervised
Symphony UI pilot on gem (JOV-4962).

Guards the contract that the orphan beam.smp incident violated:
- the versioned workflow carries the approved throughput posture
  (max_concurrent_agents: 4) and the expected admission/server shape;
- the versioned systemd user unit owns the runtime with a bounded restart
  policy, a clean stop (beam exits 1 on SIGTERM), and a single-listener guard
  for 127.0.0.1:4041;
- the install script materializes both onto a target home idempotently, keeps
  timestamped backups, and detects drift in --check mode.

No network, no systemd, no host state: everything runs against the repo
checkout and a tmp_path target home. CI's pytest lane has no PyYAML, so the
workflow front matter is parsed with a minimal indentation-aware reader for
exactly the keys this contract depends on.
"""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / "scripts/hermes/WORKFLOW.jovie-ui-pilot.md"
UNIT = ROOT / "scripts/hermes/systemd/symphony-ui-pilot.service"
INSTALLER = ROOT / "scripts/hermes/install-symphony-ui-pilot.sh"


def _front_matter_lines() -> list[str]:
    text = WORKFLOW.read_text()
    assert text.startswith("---\n"), "workflow must start with front matter"
    end = text.index("\n---", 4)
    return text[4:end].splitlines()


def _section(lines: list[str], name: str) -> list[str]:
    """Return the indented body lines of a top-level front matter key."""
    out: list[str] = []
    inside = False
    for line in lines:
        if re.match(rf"^{re.escape(name)}:\s*$", line):
            inside = True
            continue
        if inside:
            if line and not line.startswith(" "):
                break
            out.append(line)
    return out


def _scalar(body: list[str], key: str) -> str:
    for line in body:
        m = re.match(rf"^\s+{re.escape(key)}:\s*(.+?)\s*$", line)
        if m:
            return m.group(1).strip('"').strip("'")
    raise AssertionError(f"missing scalar {key!r}")


def _list_items(body: list[str], key: str) -> list[str]:
    items: list[str] = []
    inside = False
    for line in body:
        if re.match(rf"^\s+{re.escape(key)}:\s*$", line):
            inside = True
            continue
        if inside:
            m = re.match(r"^\s+-\s*(.+?)\s*$", line)
            if m:
                items.append(m.group(1))
            elif line.strip():
                break
    return items


def _unit_sections() -> dict[str, dict[str, str]]:
    sections: dict[str, dict[str, str]] = {}
    current: dict[str, str] | None = None
    for raw in UNIT.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"^\[(.+)\]$", line)
        if m:
            current = sections.setdefault(m.group(1), {})
            continue
        if current is not None and "=" in line:
            key, value = line.split("=", 1)
            current[key.strip()] = value.strip()
    return sections


def test_workflow_restores_approved_concurrency_posture() -> None:
    agent = _section(_front_matter_lines(), "agent")
    assert _scalar(agent, "max_concurrent_agents") == "4", (
        "approved throughput posture is 4 concurrent agents; 1 was a "
        "temporary lease-repair fallback, not a stability target"
    )


def test_workflow_admission_contract() -> None:
    lines = _front_matter_lines()
    tracker = _section(lines, "tracker")
    assert _list_items(tracker, "required_labels") == [
        "symphony",
        "plan-approved",
        "admission-approved",
    ]
    for state in ("Todo", "In Progress", "In Review"):
        assert state in _list_items(tracker, "active_states")
    for state in ("Done", "Canceled"):
        assert state in _list_items(tracker, "terminal_states")


def test_workflow_server_and_workspace() -> None:
    lines = _front_matter_lines()
    assert _scalar(_section(lines, "server"), "port") == "4041"
    assert (
        _scalar(_section(lines, "workspace"), "root")
        == "/home/timwhite/symphony-workspaces"
    )


def test_unit_bounded_restart_policy() -> None:
    sections = _unit_sections()
    unit = sections["Unit"]
    service = sections["Service"]
    assert int(unit["StartLimitIntervalSec"]) >= 300
    assert 1 <= int(unit["StartLimitBurst"]) <= 10
    assert service["Restart"] == "always"
    assert int(service["RestartSec"]) <= 60


def test_unit_clean_stop_and_single_listener_guard() -> None:
    service = _unit_sections()["Service"]
    # beam.smp exits 1 on SIGTERM; a supervised stop must not record failure.
    statuses = service["SuccessExitStatus"].split()
    assert "0" in statuses and "1" in statuses
    # Exactly one listener may own 127.0.0.1:4041 and it must be this unit's.
    guard = service["ExecStartPre"]
    assert "127.0.0.1:4041/api/v1/state" in guard
    assert guard.startswith("/bin/sh -c")
    exec_start = service["ExecStart"]
    assert "--port 4041" in exec_start
    assert "WORKFLOW.jovie-ui-pilot.md" in exec_start


def test_unit_has_no_unsupported_supervision_patterns() -> None:
    text = UNIT.read_text()
    for pattern in ("setsid", "disown", "nohup", "pkill", "/tmp/symphony"):
        assert pattern not in text, f"unsupported supervision pattern: {pattern}"


def test_workflow_and_unit_port_agree() -> None:
    port = _scalar(_section(_front_matter_lines(), "server"), "port")
    assert f"--port {port}" in _unit_sections()["Service"]["ExecStart"]


def _run_installer(target_home: Path, *args: str) -> subprocess.CompletedProcess:
    env = dict(os.environ, SYMPHONY_UI_PILOT_HOME=str(target_home))
    return subprocess.run(
        ["bash", str(INSTALLER), *args],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def test_installer_deploys_workflow_and_unit(tmp_path: Path) -> None:
    result = _run_installer(tmp_path, "--no-daemon-reload")
    assert result.returncode == 0, result.stderr
    workflow = tmp_path / "symphony-runtime/elixir/WORKFLOW.jovie-ui-pilot.md"
    unit = tmp_path / ".config/systemd/user/symphony-ui-pilot.service"
    assert workflow.read_text() == WORKFLOW.read_text()
    assert unit.read_text() == UNIT.read_text()
    # Freshly installed state must pass drift detection.
    check = _run_installer(tmp_path, "--check")
    assert check.returncode == 0, check.stdout
    assert check.stdout.count("OK") == 2


def test_installer_backs_up_and_detects_drift(tmp_path: Path) -> None:
    assert _run_installer(tmp_path, "--no-daemon-reload").returncode == 0
    workflow = tmp_path / "symphony-runtime/elixir/WORKFLOW.jovie-ui-pilot.md"
    workflow.write_text("drifted\n")
    drift = _run_installer(tmp_path, "--check")
    assert drift.returncode == 1
    assert "DRIFT" in drift.stdout
    # Reinstall repairs drift and preserves the previous content as a backup.
    reinstall = _run_installer(tmp_path, "--no-daemon-reload")
    assert reinstall.returncode == 0, reinstall.stderr
    backups = list(tmp_path.glob("symphony-runtime/elixir/WORKFLOW.jovie-ui-pilot.md.bak.*"))
    assert len(backups) == 1
    assert backups[0].read_text() == "drifted\n"
    assert workflow.read_text() == WORKFLOW.read_text()
    assert _run_installer(tmp_path, "--check").returncode == 0
