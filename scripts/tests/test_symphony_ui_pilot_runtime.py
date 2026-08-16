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

import json
import os
import re
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / "scripts/hermes/WORKFLOW.jovie-ui-pilot.md"
UNIT = ROOT / "scripts/hermes/systemd/symphony-ui-pilot.service"
GUARD = ROOT / "scripts/hermes/symphony-lease-guard"
RECONCILER = ROOT / "scripts/hermes/symphony-reconciler.py"
MODEL_ROUTER = ROOT / "scripts/hermes/model-router.py"
MODEL_REGISTRY = ROOT / "scripts/hermes/config/model-registry.json"
RECONCILER_SERVICE = ROOT / "scripts/hermes/systemd/symphony-reconciler.service"
RECONCILER_TIMER = ROOT / "scripts/hermes/systemd/symphony-reconciler.timer"
INSTALLER = ROOT / "scripts/hermes/install-symphony-ui-pilot.sh"
FLEET_INSTALLER = ROOT / "scripts/hermes/install-gem-fleet-controller.sh"
INTAKE_WORKFLOW = ROOT / ".github/workflows/jovie-intake-controller.yml"
ACTIVATION_WORKFLOW = ROOT / ".github/workflows/gem-delivery-controller-activation.yml"


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
            elif line.strip() and not line.lstrip().startswith("#"):
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
    # The only selector is a controller-derived lease marker. Plan and
    # admission labels are evidence, not manual runtime admission switches;
    # `before_run` independently verifies the routing receipt.
    assert _list_items(tracker, "required_labels") == ["symphony"]
    # JOV-4973: In Review is deliberately NOT implementation-active. An issue
    # transitioned to In Review stops its agent, releases its slot, and is
    # never redispatched; Gem/GitHub own review, promotion, queue, merge,
    # deploy, and receipts from there.
    assert _list_items(tracker, "active_states") == ["Todo", "In Progress"]
    for state in ("Done", "Canceled"):
        assert state in _list_items(tracker, "terminal_states")


def test_workflow_uses_event_wake_with_slow_poll_backstop() -> None:
    polling = _section(_front_matter_lines(), "polling")
    assert int(_scalar(polling, "interval_ms")) >= 300_000
    intake = INTAKE_WORKFLOW.read_text()
    assert "Wake the local lease executor for an admitted event" in intake
    assert "steps.admission.outputs.admitted == 'true'" in intake
    assert "-X POST http://127.0.0.1:4041/api/v1/refresh" in intake
    assert 'any(.teams[]; .status == "admitted"' in intake


def test_activation_requires_exact_production_revision_and_attestation() -> None:
    installer = FLEET_INSTALLER.read_text()
    assert "GEM_CONTROLLER_EXPECTED_REVISION" in installer
    assert "refusing controller install" in installer
    activation = ACTIVATION_WORKFLOW.read_text()
    assert "workflow_run:" in activation
    assert 'workflows: ["Production Controller"]' in activation
    assert "ref: ${{ github.event.workflow_run.head_sha }}" in activation
    assert 'test "$(id -un)" = timwhite' in activation
    assert "git ls-remote origin refs/heads/main" in activation
    assert "GEM_CONTROLLER_EXPECTED_REVISION" in activation
    assert 'gem-service-attestation/v1' in activation


def test_workflow_server_and_workspace() -> None:
    lines = _front_matter_lines()
    assert _scalar(_section(lines, "server"), "port") == "4041"
    assert (
        _scalar(_section(lines, "workspace"), "root")
        == "/home/timwhite/symphony-workspaces"
    )


def test_workflow_before_run_enforces_lease_guard() -> None:
    # JOV-5031: before any codex session seizes a provider account, the hook
    # must run the lease guard against the workspace-derived issue identifier
    # so stale tracker snapshots cannot redispatch a tombstoned issue.
    hooks = _section(_front_matter_lines(), "hooks")
    before_run: list[str] = []
    inside = False
    for line in hooks:
        if re.match(r"^\s+before_run:\s*\|", line):
            inside = True
            continue
        if inside:
            if re.match(r"^\s+[a-z_]+:", line):
                break
            before_run.append(line)
    body = "\n".join(before_run)
    assert "symphony-lease-guard" in body
    assert 'check "${PWD##*/}"' in body
    # The existing workspace bootstrap must survive the guard addition.
    assert "git clone" in body


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
    guard = tmp_path / ".local/bin/symphony-lease-guard"
    reconciler = tmp_path / ".local/bin/symphony-reconciler"
    model_router = tmp_path / ".local/lib/symphony-reconciler/model-router.py"
    model_registry = tmp_path / ".local/lib/symphony-reconciler/model-registry.json"
    reconciler_service = tmp_path / ".config/systemd/user/symphony-reconciler.service"
    reconciler_timer = tmp_path / ".config/systemd/user/symphony-reconciler.timer"
    assert workflow.read_text() == WORKFLOW.read_text()
    assert unit.read_text() == UNIT.read_text()
    # JOV-5031: the lease guard installs executable so the before_run hook can
    # enforce the monotonic tombstone before a provider account is seized.
    assert guard.read_text() == GUARD.read_text()
    assert guard.stat().st_mode & 0o111
    assert reconciler.read_text() == RECONCILER.read_text()
    assert reconciler.stat().st_mode & 0o111
    assert model_router.read_text() == MODEL_ROUTER.read_text()
    assert model_router.stat().st_mode & 0o111
    assert model_registry.read_text() == MODEL_REGISTRY.read_text()
    assert reconciler_service.read_text() == RECONCILER_SERVICE.read_text()
    assert reconciler_timer.read_text() == RECONCILER_TIMER.read_text()
    # Freshly installed state must pass drift detection.
    check = _run_installer(tmp_path, "--check")
    assert check.returncode == 0, check.stdout
    assert check.stdout.count("OK") == 8


def test_reconciler_records_exact_first_failure_without_escalating(tmp_path: Path) -> None:
    workspace_root = tmp_path / "workspaces"
    workspace = workspace_root / "JOV-1"
    workspace.mkdir(parents=True)
    subprocess.run(["git", "init", "-q"], cwd=workspace, check=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=workspace, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=workspace, check=True)
    (workspace / "proof.txt").write_text("base\n")
    subprocess.run(["git", "add", "proof.txt"], cwd=workspace, check=True)
    subprocess.run(["git", "commit", "-qm", "base"], cwd=workspace, check=True)
    subprocess.run(["git", "remote", "add", "origin", "."], cwd=workspace, check=True)
    subprocess.run(["git", "update-ref", "refs/remotes/origin/main", "HEAD"], cwd=workspace, check=True)
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=workspace, text=True).strip()

    payload = {
        "retrying": [{
            "issue_identifier": "JOV-1",
            "issue_id": "linear-id",
            "issue_url": "https://linear.app/example/JOV-1",
            "workspace_path": str(workspace),
            "attempt": 1,
            "error": "normal model failed",
            "due_at": "2030-01-01T00:00:00Z",
        }],
        "blocked": [],
    }

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            body = json.dumps(payload).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args: object) -> None:
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    env = dict(
        os.environ,
        SYMPHONY_STATE_URL=f"http://127.0.0.1:{server.server_port}/api/v1/state",
        SYMPHONY_WORKSPACE_ROOT=str(workspace_root),
        SYMPHONY_RECONCILER_STATE=str(tmp_path / "state"),
    )
    try:
        result = subprocess.run(["python3", str(RECONCILER)], env=env, capture_output=True, text=True, check=False)
    finally:
        server.shutdown()
        thread.join()
    assert result.returncode == 0, result.stderr
    receipt = json.loads((tmp_path / "state/receipts/JOV-1.json").read_text())
    assert receipt["schema"] == "symphony-reconciliation-receipt/v1"
    assert receipt["headBaseCurrent"]["head"] == head
    assert receipt["headBaseCurrent"]["base"] == head
    assert receipt["attemptedRepairs"][0]["kind"] == "normal_model_bounded_retry"
    assert receipt["alternateModel"]["nominatedModel"] == "qwen-coder-local"
    assert receipt["nextAutomatedAction"] == "normal_model_retry"
    assert "transition=normal_retry_scheduled" in result.stdout


def test_reconciler_hands_repeated_failure_to_local_model_then_returns_to_normal_loop(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspaces"
    workspace = workspace_root / "JOV-2"
    workspace.mkdir(parents=True)
    subprocess.run(["git", "init", "-q"], cwd=workspace, check=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=workspace, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=workspace, check=True)
    (workspace / "proof.txt").write_text("base\n")
    subprocess.run(["git", "add", "proof.txt"], cwd=workspace, check=True)
    subprocess.run(["git", "commit", "-qm", "base"], cwd=workspace, check=True)
    subprocess.run(["git", "remote", "add", "origin", "."], cwd=workspace, check=True)
    subprocess.run(["git", "update-ref", "refs/remotes/origin/main", "HEAD"], cwd=workspace, check=True)

    fake_ollama = tmp_path / "ollama"
    fake_ollama.write_text("#!/bin/sh\necho 'qwen3-coder:30b latest'\n")
    fake_ollama.chmod(0o755)
    fake_agent = tmp_path / "hermes"
    fake_agent.write_text("#!/bin/sh\nprintf 'repaired by local model\\n' > repair.txt\necho repair-complete\n")
    fake_agent.chmod(0o755)
    fake_systemctl_state = tmp_path / "systemctl-state"
    fake_systemctl_state.write_text("active\n")
    fake_systemctl = tmp_path / "systemctl"
    fake_systemctl.write_text(
        "#!/bin/sh\n"
        f"state='{fake_systemctl_state}'\n"
        "case \"$2\" in\n"
        "  stop) echo inactive > \"$state\"; exit 0;;\n"
        "  start) echo active > \"$state\"; exit 0;;\n"
        "  is-active) grep -qx active \"$state\";;\n"
        "  *) exit 2;;\n"
        "esac\n"
    )
    fake_systemctl.chmod(0o755)

    payload = {
        "retrying": [{
            "issue_identifier": "JOV-2",
            "issue_id": "linear-id-2",
            "issue_url": "https://linear.app/example/JOV-2",
            "workspace_path": str(workspace),
            "attempt": 3,
            "error": "repeated source repair failure",
            "due_at": "2030-01-01T00:00:00Z",
        }],
        "blocked": [],
    }

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            body = json.dumps(payload).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args: object) -> None:
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    env = dict(
        os.environ,
        SYMPHONY_STATE_URL=f"http://127.0.0.1:{server.server_port}/api/v1/state",
        SYMPHONY_WORKSPACE_ROOT=str(workspace_root),
        SYMPHONY_RECONCILER_STATE=str(tmp_path / "state"),
        GEM_PR_DRAIN_QWEN=str(fake_ollama),
        GEM_QWEN_AGENT_EXECUTABLE=str(fake_agent),
        GEM_MODEL_ROUTER_STATE=str(tmp_path / "router-state.json"),
        SYMPHONY_SYSTEMCTL=str(fake_systemctl),
    )
    try:
        result = subprocess.run(["python3", str(RECONCILER)], env=env, capture_output=True, text=True, check=False)
        first_receipt = json.loads((tmp_path / "state/receipts/JOV-2.json").read_text())
        subprocess.run(["git", "add", "repair.txt"], cwd=workspace, check=True)
        subprocess.run(["git", "commit", "-qm", "alternate handoff"], cwd=workspace, check=True)
        changed_head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=workspace, text=True).strip()
        fake_agent.write_text("#!/bin/sh\nsleep 2\n")
        env["SYMPHONY_ALTERNATE_TIMEOUT_SECONDS"] = "1"
        timeout_result = subprocess.run(
            ["python3", str(RECONCILER)], env=env, capture_output=True, text=True, check=False
        )
        timeout_receipt = json.loads((tmp_path / "state/receipts/JOV-2.json").read_text())
        waiting_result = subprocess.run(
            ["python3", str(RECONCILER)], env=env, capture_output=True, text=True, check=False
        )
        waiting_receipt = json.loads((tmp_path / "state/receipts/JOV-2.json").read_text())
    finally:
        server.shutdown()
        thread.join()
    assert result.returncode == 0, result.stderr
    assert (workspace / "repair.txt").read_text() == "repaired by local model\n"
    assert first_receipt["alternateModel"]["status"] == "repair_handoff_ready"
    assert first_receipt["transition"] == "returned_to_normal_loop"
    assert first_receipt["nextAutomatedAction"] == "normal_model_update_test_ready_native_merge"
    assert first_receipt["headBaseCurrent"]["dirty"] is True
    assert first_receipt["authoritativeOwner"] == "symphony-reconciler"
    assert first_receipt["attemptedRepairs"][1]["result"] == "acquired"
    assert "transition=alternate_local_repair_started" in result.stdout
    assert "transition=returned_to_normal_loop" in result.stdout
    assert "transition=normal_owner_restored" in result.stdout
    assert timeout_result.returncode == 0, timeout_result.stderr
    assert timeout_receipt["generation"] != first_receipt["generation"]
    assert timeout_receipt["headBaseCurrent"]["head"] == changed_head
    assert timeout_receipt["alternateModel"]["status"] == "repair_timed_out"
    assert timeout_receipt["nextAutomatedAction"] == "retry_alternate_local_model"
    assert "transition=alternate_local_repair_deferred" in timeout_result.stdout
    assert waiting_result.returncode == 0, waiting_result.stderr
    assert waiting_receipt["nextRetryAt"] == timeout_receipt["nextRetryAt"]
    assert waiting_receipt["nextAutomatedAction"] == "retry_scheduler_handoff_then_alternate_local_model"
    assert fake_systemctl_state.read_text() == "active\n"


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


def test_installer_restores_only_lease_guard_atomically(tmp_path: Path) -> None:
    workflow = tmp_path / "symphony-runtime/elixir/WORKFLOW.jovie-ui-pilot.md"
    unit = tmp_path / ".config/systemd/user/symphony-ui-pilot.service"
    workflow.parent.mkdir(parents=True)
    unit.parent.mkdir(parents=True)
    workflow.write_text("preserve workflow drift\n")
    unit.write_text("preserve unit drift\n")

    result = _run_installer(tmp_path, "--lease-guard-only")
    assert result.returncode == 0, result.stderr
    guard = tmp_path / ".local/bin/symphony-lease-guard"
    assert guard.read_text() == GUARD.read_text()
    assert guard.stat().st_mode & 0o111
    assert workflow.read_text() == "preserve workflow drift\n"
    assert unit.read_text() == "preserve unit drift\n"
    assert not list(guard.parent.glob(".symphony-lease-guard.tmp.*"))
    assert "DAEMON_RELOADED" not in result.stdout

    check = _run_installer(tmp_path, "--check", "--lease-guard-only")
    assert check.returncode == 0, check.stdout
    assert check.stdout.splitlines() == [f"OK {guard}"]
