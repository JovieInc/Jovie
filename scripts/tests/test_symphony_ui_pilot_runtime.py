"""Deterministic install/runtime regression coverage for the supervised
Symphony UI pilot on gem (JOV-4962).

Guards the contract that the orphan beam.smp incident violated:
- the versioned workflow carries the approved throughput posture
  (a fail-closed boot value with a 40-agent policy ceiling) and the expected admission/server shape;
- the versioned systemd user unit owns the runtime with a bounded restart
  policy, a clean stop (beam exits 1 on SIGTERM), and a single-listener guard
  for 127.0.0.1:4041;
- the install script materializes both onto a target home idempotently, keeps
  timestamped backups, and detects drift in --check mode except the bounded
  runtime overlay on agent.max_concurrent_agents (0..40);
- the legacy pilot installer cannot activate the official concurrency controller.

No network, no systemd, no host state: everything runs against the repo
checkout and a tmp_path target home. CI's pytest lane has no PyYAML, so the
workflow front matter is parsed with a minimal indentation-aware reader for
exactly the keys this contract depends on.
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / "scripts/symphony/WORKFLOW.jovie-ui-pilot.md"
UNIT = ROOT / "scripts/symphony/systemd/symphony-ui-pilot.service"
GUARD = ROOT / "scripts/symphony/symphony-lease-guard"
RECONCILER = ROOT / "scripts/symphony/symphony-reconciler.py"
MODEL_ROUTER = ROOT / "scripts/symphony/model-router.py"
MODEL_REGISTRY = ROOT / "scripts/symphony/config/model-registry.json"
CAPABILITY_MANIFEST = ROOT / "scripts/symphony/config/symphony-reconciler-capabilities.json"
RECONCILER_SERVICE = ROOT / "scripts/symphony/systemd/symphony-reconciler.service"
RECONCILER_TIMER = ROOT / "scripts/symphony/systemd/symphony-reconciler.timer"
DISK_RECLAIM = ROOT / "scripts/symphony/gem-disk-reclaim.py"
DISK_RECLAIM_SERVICE = ROOT / "scripts/symphony/systemd/gem-disk-reclaim.service"
DISK_RECLAIM_TIMER = ROOT / "scripts/symphony/systemd/gem-disk-reclaim.timer"
CONTROLLER = ROOT / "scripts/symphony/symphony-concurrency-controller.py"
CONTROLLER_SERVICE = ROOT / "scripts/symphony/systemd/symphony-concurrency-controller.service"
CONTROLLER_TIMER = ROOT / "scripts/symphony/systemd/symphony-concurrency-controller.timer"
INSTALLER = ROOT / "scripts/symphony/install-symphony-ui-pilot.sh"
FLEET_INSTALLER = ROOT / "scripts/symphony/install-gem-fleet-controller.sh"
REHAB_INSTALLER = ROOT / "scripts/symphony/install-gem-pr-rehabilitation.sh"
USER_SYSTEMD_LIB = ROOT / "scripts/symphony/lib/user-systemd-context.sh"
FLEET_WORKFLOW = ROOT / ".github/workflows/fleet-gate-refresh.yml"
ACTIVATION_WORKFLOW = ROOT / ".github/workflows/gem-delivery-controller-activation.yml"
ACTIONLINT_CONFIG = ROOT / ".github/actionlint.yaml"


def _load_reconciler_module():
    spec = importlib.util.spec_from_file_location("symphony_reconciler", RECONCILER)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


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


def test_workflow_boots_fail_closed_until_capacity_is_proven() -> None:
    agent = _section(_front_matter_lines(), "agent")
    assert _scalar(agent, "max_concurrent_agents") == "0"


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


def test_activation_requires_exact_production_revision_and_attestation() -> None:
    installer = FLEET_INSTALLER.read_text()
    assert "GEM_CONTROLLER_EXPECTED_REVISION" in installer
    assert "refusing controller install" in installer
    activation = ACTIVATION_WORKFLOW.read_text()
    assert "workflow_run:" in activation
    assert 'workflows: ["Production Controller"]' in activation
    assert "ref: ${{ github.event.workflow_run.head_sha }}" in activation
    assert 'test "$(id -un)" = timwhite' in activation
    assert "git ls-remote origin refs/heads/main" not in activation
    assert "immutable successful" in activation
    assert "GEM_CONTROLLER_EXPECTED_REVISION" in activation
    assert 'gem-service-attestation/v1' in activation
    assert "ss -ltnp 'sport = :4041'" in installer
    assert "LISTENER_PID" in installer
    assert '"boundToService": True' in installer
    assert '"wrapperPid": int(os.environ["SERVICE_PID"])' in installer
    assert ".listener.boundToService == true" in activation
    assert ".listener.wrapperPid > 0" in activation


def test_activation_uses_the_provisioned_gem_host_runner_contract() -> None:
    activation = ACTIVATION_WORKFLOW.read_text()
    assert "runs-on: [self-hosted, Linux, X64, jovie-fixed]" in activation
    assert "runs-on: [self-hosted, Linux, X64, jovie-fixed, gem]" not in activation
    assert "\n    - gem\n" not in ACTIONLINT_CONFIG.read_text()


def _run_fleet_systemd_preflight(
    tmp_path: Path, systemctl_returncode: int
) -> tuple[subprocess.CompletedProcess[str], Path]:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake_id = bin_dir / "id"
    fake_id.write_text(
        "#!/usr/bin/env bash\n"
        "if [[ \"${1:-}\" == -u ]]; then printf '4242\\n'; else /usr/bin/id \"$@\"; fi\n"
    )
    fake_id.chmod(0o755)
    log = tmp_path / "systemctl.log"
    fake_systemctl = bin_dir / "systemctl"
    fake_systemctl.write_text(
        "#!/usr/bin/env bash\n"
        "printf 'command=%s\\n' \"$*\" > \"$FLEET_PREFLIGHT_LOG\"\n"
        "printf 'XDG_RUNTIME_DIR=%s\\n' \"${XDG_RUNTIME_DIR:-}\" >> \"$FLEET_PREFLIGHT_LOG\"\n"
        "printf 'DBUS_SESSION_BUS_ADDRESS=%s\\n' \"${DBUS_SESSION_BUS_ADDRESS:-}\" >> \"$FLEET_PREFLIGHT_LOG\"\n"
        "exit \"$FLEET_SYSTEMCTL_RETURNCODE\"\n"
    )
    fake_systemctl.chmod(0o755)
    env = dict(os.environ)
    env.pop("XDG_RUNTIME_DIR", None)
    env.pop("DBUS_SESSION_BUS_ADDRESS", None)
    env.update(
        {
            "FLEET_INSTALL_PREFLIGHT_ONLY": "true",
            "FLEET_PREFLIGHT_LOG": str(log),
            "FLEET_SYSTEMCTL_RETURNCODE": str(systemctl_returncode),
            "GEM_WORKSPACE": str(tmp_path / "gem-workspace"),
            "PATH": f"{bin_dir}:{env['PATH']}",
            "SYMPHONY_RUNTIME": str(tmp_path / "symphony-runtime"),
        }
    )
    result = subprocess.run(
        ["bash", str(FLEET_INSTALLER)],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    return result, log


def test_fleet_installer_establishes_user_systemd_context_before_writes(
    tmp_path: Path,
) -> None:
    result, log = _run_fleet_systemd_preflight(tmp_path, 0)
    assert result.returncode == 0, result.stderr
    assert "Gem user systemd preflight passed" in result.stdout
    assert log.read_text().splitlines() == [
        "command=--user show-environment",
        "XDG_RUNTIME_DIR=/run/user/4242",
        "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/4242/bus",
    ]
    assert not (tmp_path / "gem-workspace/state/backups").exists()


def test_fleet_installer_fails_visible_before_writes_without_user_systemd(
    tmp_path: Path,
) -> None:
    result, _ = _run_fleet_systemd_preflight(tmp_path, 1)
    assert result.returncode == 4
    assert "Gem user systemd preflight failed; refusing controller writes" in result.stderr
    assert not (tmp_path / "gem-workspace/state/backups").exists()


def _run_rehab_systemd_preflight(
    tmp_path: Path, systemctl_returncode: int, *, require_socket: bool = False
) -> tuple[subprocess.CompletedProcess[str], Path]:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake_id = bin_dir / "id"
    fake_id.write_text(
        "#!/usr/bin/env bash\n"
        "if [[ \"${1:-}\" == -u ]]; then printf '4242\\n'; else /usr/bin/id \"$@\"; fi\n"
    )
    fake_id.chmod(0o755)
    log = tmp_path / "systemctl.log"
    fake_systemctl = bin_dir / "systemctl"
    fake_systemctl.write_text(
        "#!/usr/bin/env bash\n"
        "printf 'command=%s\\n' \"$*\" > \"$FLEET_PREFLIGHT_LOG\"\n"
        "printf 'XDG_RUNTIME_DIR=%s\\n' \"${XDG_RUNTIME_DIR:-}\" >> \"$FLEET_PREFLIGHT_LOG\"\n"
        "printf 'DBUS_SESSION_BUS_ADDRESS=%s\\n' \"${DBUS_SESSION_BUS_ADDRESS:-}\" >> \"$FLEET_PREFLIGHT_LOG\"\n"
        "exit \"$FLEET_SYSTEMCTL_RETURNCODE\"\n"
    )
    fake_systemctl.chmod(0o755)
    env = dict(os.environ)
    env.pop("XDG_RUNTIME_DIR", None)
    env.pop("DBUS_SESSION_BUS_ADDRESS", None)
    env.pop("GEM_SYSTEMD_REQUIRE_BUS_SOCKET", None)
    env.update(
        {
            "GEM_REHABILITATION_PREFLIGHT_ONLY": "true",
            "FLEET_PREFLIGHT_LOG": str(log),
            "FLEET_SYSTEMCTL_RETURNCODE": str(systemctl_returncode),
            "GEM_WORKSPACE": str(tmp_path / "gem-workspace"),
            "PATH": f"{bin_dir}:{env['PATH']}",
        }
    )
    if require_socket:
        env["GEM_SYSTEMD_REQUIRE_BUS_SOCKET"] = "1"
    result = subprocess.run(
        ["bash", str(REHAB_INSTALLER)],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    return result, log


def test_rehab_installer_establishes_user_systemd_context_before_writes(
    tmp_path: Path,
) -> None:
    result, log = _run_rehab_systemd_preflight(tmp_path, 0)
    assert result.returncode == 0, result.stderr
    assert "Gem user systemd preflight passed" in result.stdout
    assert log.read_text().splitlines() == [
        "command=--user show-environment",
        "XDG_RUNTIME_DIR=/run/user/4242",
        "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/4242/bus",
    ]
    assert not (tmp_path / "gem-workspace/state/backups").exists()


def test_rehab_installer_fails_visible_before_writes_without_user_systemd(
    tmp_path: Path,
) -> None:
    result, _ = _run_rehab_systemd_preflight(tmp_path, 1)
    assert result.returncode == 4
    assert "Gem user systemd preflight failed; refusing controller writes" in result.stderr
    assert not (tmp_path / "gem-workspace/state/backups").exists()


def test_user_systemd_lib_fail_closes_on_missing_bus_socket(tmp_path: Path) -> None:
    result, _ = _run_rehab_systemd_preflight(tmp_path, 0, require_socket=True)
    assert result.returncode == 4
    assert "missing bus socket" in result.stderr
    assert not (tmp_path / "gem-workspace/state/backups").exists()


def test_activation_exports_user_systemd_before_both_installers() -> None:
    activation = ACTIVATION_WORKFLOW.read_text()
    establish = activation.index("Establish lingering user-systemd session")
    official = activation.index(
        "update-symphony-burrito.sh --skip-binary"
    )
    install = activation.index("bash scripts/symphony/install-gem-fleet-controller.sh")
    rehab = activation.index("bash scripts/symphony/install-gem-pr-rehabilitation.sh")
    assert establish < official < install < rehab
    assert "GITHUB_ENV" in activation
    assert "XDG_RUNTIME_DIR" in activation
    assert "DBUS_SESSION_BUS_ADDRESS" in activation
    assert "GEM_SYSTEMD_REQUIRE_BUS_SOCKET=1" in activation
    assert "test -S" in activation
    assert "systemctl --user show-environment" in activation
    lib = USER_SYSTEMD_LIB.read_text()
    assert "prepare_user_systemd_context" in lib
    fleet = FLEET_INSTALLER.read_text()
    rehab_src = REHAB_INSTALLER.read_text()
    assert "lib/user-systemd-context.sh" in fleet
    assert "lib/user-systemd-context.sh" in rehab_src
    assert "prepare_user_systemd_context" in rehab_src
    # 4041 health remains the post-install attestation, not a skipped stub.
    assert "http://127.0.0.1:4041/api/v1/state" in activation
    assert 'has("running") and has("retrying") and has("blocked")' in activation


def test_activation_requires_official_runtime_and_retires_custom_automation() -> None:
    activation = ACTIVATION_WORKFLOW.read_text()
    assert "symphony-elixir.service" in activation
    assert 'DEFAULT_WORKSPACES = "~/symphony-elixir-workspaces"' in RECONCILER.read_text()
    assert (
        "update-symphony-burrito.sh --skip-binary"
        in activation
    )
    assert "--no-restart --retire-legacy" not in activation
    assert 'test "$main_pid" = "$after_pid"' not in activation
    assert "install-symphony-ui-pilot.sh" not in activation
    assert "runtime-preflight" not in activation
    assert "LoadState --value" in activation
    assert "symphony-ui-pilot.service" in activation
    assert "symphony-reconciler.timer" in activation
    # The grok/kimi sidecar is the active coding lane, not a legacy unit;
    # the activation mask-check must not retire it.
    assert "symphony-grok-sidecar.service" not in activation
    assert "symphony-grok-sidecar.timer" not in activation
    assert "ControlGroup --value" in activation
    assert "listener_pid" in activation
    assert "/proc/${listener_pid}/cgroup" in activation
    assert "ss -H -ltn 'sport = :4043'" in activation
    assert "is-enabled --quiet gem-disk-reclaim.timer" in activation
    assert "is-active --quiet gem-disk-reclaim.timer" in activation
    assert "$HOME/.local/bin/gem-disk-reclaim" in activation
    installer = INSTALLER.read_text()
    assert "enable --now gem-disk-reclaim.timer" in installer
    assert "restart symphony-ui-pilot.service" not in installer

def test_disk_reclaim_systemd_unit_is_bounded_and_source_owned() -> None:
    service = DISK_RECLAIM_SERVICE.read_text()
    timer = DISK_RECLAIM_TIMER.read_text()
    assert "%h/.local/bin/gem-disk-reclaim --apply --timeout-seconds 540" in service
    assert "/usr/bin/flock -n /tmp/gem-disk-reclaim.lock" in service
    assert "TimeoutStartSec=10min" in service
    assert "ACTIONS_RUNNER_HOOK_JOB_STARTED" not in service
    assert "ACTIONS_RUNNER_HOOK_JOB_COMPLETED" not in service
    assert "OnUnitActiveSec=15min" in timer
    assert "Persistent=true" in timer
    assert "Unit=gem-disk-reclaim.service" in timer



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


def _rewrite_installed_concurrency(workflow: Path, value: str) -> None:
    def replace(match: re.Match[str]) -> str:
        return f"{match.group(1)}{value}{match.group(3)}"

    updated, count = re.subn(
        r"^(\s*max_concurrent_agents:\s*)([0-9]+)(\s*)$",
        replace,
        workflow.read_text(),
        count=1,
        flags=re.MULTILINE,
    )
    assert count == 1, "installed workflow must contain one concurrency scalar"
    workflow.write_text(updated)


def test_installer_deploys_workflow_and_unit(tmp_path: Path) -> None:
    result = _run_installer(tmp_path, "--no-daemon-reload")
    assert result.returncode == 0, result.stderr
    workflow = tmp_path / "symphony-runtime/elixir/WORKFLOW.jovie-ui-pilot.md"
    unit = tmp_path / ".config/systemd/user/symphony-ui-pilot.service"
    guard = tmp_path / ".local/bin/symphony-lease-guard"
    reconciler = tmp_path / ".local/bin/symphony-reconciler"
    model_router = tmp_path / ".local/lib/symphony-reconciler/model-router.py"
    model_registry = tmp_path / ".local/lib/symphony-reconciler/model-registry.json"
    capability_manifest = tmp_path / ".local/lib/symphony-reconciler/symphony-reconciler-capabilities.json"
    runtime_receipt = tmp_path / ".local/lib/symphony-reconciler/runtime-receipt.json"
    reconciler_service = tmp_path / ".config/systemd/user/symphony-reconciler.service"
    reconciler_timer = tmp_path / ".config/systemd/user/symphony-reconciler.timer"
    disk_reclaim = tmp_path / ".local/bin/gem-disk-reclaim"
    disk_reclaim_service = tmp_path / ".config/systemd/user/gem-disk-reclaim.service"
    disk_reclaim_timer = tmp_path / ".config/systemd/user/gem-disk-reclaim.timer"
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
    assert capability_manifest.read_text() == CAPABILITY_MANIFEST.read_text()
    assert disk_reclaim.read_text() == DISK_RECLAIM.read_text()
    assert disk_reclaim.stat().st_mode & 0o111
    stored_receipt = json.loads(runtime_receipt.read_text())
    assert stored_receipt["schema"] == "symphony-runtime-receipt/v1"
    assert stored_receipt["installedAt"]
    assert stored_receipt["runtimeHashes"] == stored_receipt["files"]
    assert stored_receipt["sourceHashes"] == stored_receipt["files"]
    assert reconciler_service.read_text() == RECONCILER_SERVICE.read_text()
    assert reconciler_timer.read_text() == RECONCILER_TIMER.read_text()
    assert disk_reclaim_service.read_text() == DISK_RECLAIM_SERVICE.read_text()
    assert disk_reclaim_timer.read_text() == DISK_RECLAIM_TIMER.read_text()
    assert not (tmp_path / ".local/bin/symphony-concurrency-controller").exists()
    # Freshly installed state must pass drift detection.
    check = _run_installer(tmp_path, "--check")
    assert check.returncode == 0, check.stdout
    assert check.stdout.count("OK") == 13


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


def test_deterministic_launcher_failure_is_parked_without_retry(tmp_path: Path, monkeypatch) -> None:
    reconciler = _load_reconciler_module()
    for error in (
        "bwrap: setting up uid map: Permission denied",
        "Linear MCP interactive input despite approval never completed",
        "launcher configuration missing approval policy",
    ):
        assert reconciler.classify_launcher_failure(error)["retryable"] is False
    assert reconciler.classify_launcher_failure("CAPACITY_UNAVAILABLE account_busy")["retryable"] is True
    workspace_root = tmp_path / "workspaces"
    workspace = workspace_root / "JOV-DET"
    workspace.mkdir(parents=True)
    subprocess.run(["git", "init", "-q"], cwd=workspace, check=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=workspace, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=workspace, check=True)
    (workspace / "proof.txt").write_text("base\n")
    subprocess.run(["git", "add", "proof.txt"], cwd=workspace, check=True)
    subprocess.run(["git", "commit", "-qm", "base"], cwd=workspace, check=True)
    subprocess.run(["git", "remote", "add", "origin", "."], cwd=workspace, check=True)
    subprocess.run(["git", "update-ref", "refs/remotes/origin/main", "HEAD"], cwd=workspace, check=True)
    monkeypatch.setenv("SYMPHONY_WORKSPACE_ROOT", str(workspace_root))
    monkeypatch.setenv("SYMPHONY_RECONCILER_STATE", str(tmp_path / "state"))

    item = {
        "issue_identifier": "JOV-DET",
        "workspace_path": str(workspace),
        "attempt": 1,
        "error": "bwrap: setting up uid map: Permission denied",
        "due_at": "2030-01-01T00:00:00Z",
    }
    reconciler._reconcile_item(item, "retrying", False)
    receipt_path = tmp_path / "state/receipts/JOV-DET.json"
    receipt = json.loads(receipt_path.read_text())
    assert receipt["launcherFailure"] == {
        "class": "deterministic-launcher",
        "code": "deterministic-launcher-failure",
        "maxAttempts": 1,
        "retryable": False,
        "schema": "symphony-launcher-failure/v1",
    }
    assert receipt["retryPolicy"] == {"maxAttempts": 1, "retryable": False}
    assert receipt["nextRetryAt"] is None
    assert receipt["deadline"] is None
    assert receipt["transition"] == "deterministic_launcher_blocked"
    assert receipt["nextAutomatedAction"] == "manual_or_environment_repair"
    # A later reconciler tick observes the same generation but does not create
    # another attempt or reopen the timer.
    before = receipt_path.read_text()
    reconciler._reconcile_item(item, "retrying", False)
    assert receipt_path.read_text() == before


def test_reconciler_never_stops_main_service_or_takes_alternate_ownership(
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

    systemctl_log = tmp_path / "systemctl.log"
    fake_systemctl = tmp_path / "systemctl"
    fake_systemctl.write_text(
        "#!/bin/sh\n"
        f"printf '%s\\n' \"$*\" >> '{systemctl_log}'\n"
        "exit 99\n"
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
        SYMPHONY_FLEET_GATE_RECEIPT=str(tmp_path / "missing-gate.json"),
        GEM_FLEET_GATE_RECEIPT=str(tmp_path / "missing-fleet-gate.json"),
        SYMPHONY_SYSTEMCTL=str(fake_systemctl),
    )
    try:
        result = subprocess.run(["python3", str(RECONCILER)], env=env, capture_output=True, text=True, check=False)
        receipt = json.loads((tmp_path / "state/receipts/JOV-2.json").read_text())
    finally:
        server.shutdown()
        thread.join()
    assert result.returncode == 0, result.stderr
    assert not systemctl_log.exists()
    assert not (workspace / "repair.txt").exists()
    assert receipt["controllerState"] == "blocked"
    assert receipt["retryPolicy"] == {"maxAttempts": 3, "retryable": False}
    assert receipt["nextRetryAt"] is None
    assert receipt["alternateModel"]["status"] == "not_due"
    assert receipt["authoritativeOwner"] == "symphony-elixir"
    assert "alternate_owner" not in result.stdout
    assert "normal_owner_restored" not in result.stdout


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


def test_installer_accepts_only_the_bounded_runtime_concurrency_overlay(tmp_path: Path) -> None:
    assert _run_installer(tmp_path, "--no-daemon-reload").returncode == 0
    workflow = tmp_path / "symphony-runtime/elixir/WORKFLOW.jovie-ui-pilot.md"
    source = WORKFLOW.read_text()

    for target in (0, 1, 2, 8, 40):
        _rewrite_installed_concurrency(workflow, str(target))
        accepted = _run_installer(tmp_path, "--check")
        assert accepted.returncode == 0, accepted.stdout
        assert f"OK {workflow}" in accepted.stdout
        assert f"runtime max_concurrent_agents={target}" in accepted.stdout

    for invalid in ("41", "01", "08", "040", "not-a-number"):
        workflow.write_text(
            source.replace("  max_concurrent_agents: 0", f"  max_concurrent_agents: {invalid}", 1)
        )
        rejected = _run_installer(tmp_path, "--check")
        assert rejected.returncode == 1, invalid
        assert f"DRIFT {workflow}" in rejected.stdout

    for malformed in (
        source.replace("  max_concurrent_agents: 0\n", ""),
        source.replace("  max_concurrent_agents: 0", "  max_concurrent_workers: 40", 1),
        source.replace(
            "  max_concurrent_agents: 0",
            "  max_concurrent_agents: 0\n  max_concurrent_agents: 40",
            1,
        ),
    ):
        workflow.write_text(malformed)
        rejected = _run_installer(tmp_path, "--check")
        assert rejected.returncode == 1
        assert f"DRIFT {workflow}" in rejected.stdout

    runtime = source.replace("  max_concurrent_agents: 0", "  max_concurrent_agents: 1", 1)
    workflow.write_text(runtime.replace("  max_turns: 24", "  max_turns: 25", 1))
    other_drift = _run_installer(tmp_path, "--check")
    assert other_drift.returncode == 1
    assert f"DRIFT {workflow}" in other_drift.stdout


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


def test_installer_check_fails_closed_for_each_missing_reconciler_artifact(
    tmp_path: Path,
) -> None:
    assert _run_installer(tmp_path, "--no-daemon-reload").returncode == 0
    artifacts = (
        tmp_path / ".local/bin/symphony-reconciler",
        tmp_path / ".local/lib/symphony-reconciler/model-router.py",
        tmp_path / ".local/lib/symphony-reconciler/model-registry.json",
        tmp_path / ".local/lib/symphony-reconciler/symphony-reconciler-capabilities.json",
        tmp_path / ".local/lib/symphony-reconciler/runtime-receipt.json",
        tmp_path / ".config/systemd/user/symphony-reconciler.service",
        tmp_path / ".config/systemd/user/symphony-reconciler.timer",
        tmp_path / ".local/bin/gem-disk-reclaim",
        tmp_path / ".config/systemd/user/gem-disk-reclaim.service",
        tmp_path / ".config/systemd/user/gem-disk-reclaim.timer",
    )
    for path in artifacts:
        original = path.read_bytes()
        mode = path.stat().st_mode
        path.unlink()
        check = _run_installer(tmp_path, "--check")
        assert check.returncode == 1, path
        assert "MISSING" in check.stdout
        path.write_bytes(original)
        path.chmod(mode)
        assert _run_installer(tmp_path, "--check").returncode == 0
        path.write_bytes(original + b"\n# drift\n")
        drift = _run_installer(tmp_path, "--check")
        assert drift.returncode == 1, path
        assert "DRIFT" in drift.stdout
        path.write_bytes(original)
        path.chmod(mode)


def test_installer_enables_reconciler_timer_without_restarting_main_service(
    tmp_path: Path,
) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    log = tmp_path / "systemctl.log"
    fake_systemctl = bin_dir / "systemctl"
    fake_systemctl.write_text(
        "#!/usr/bin/env bash\n"
        "printf 'command=%s\\n' \"$*\" >> \"$SYMPHONY_SYSTEMCTL_LOG\"\n"
        "exit 0\n"
    )
    fake_systemctl.chmod(0o755)
    env = dict(
        os.environ,
        SYMPHONY_UI_PILOT_HOME=str(tmp_path),
        SYMPHONY_SYSTEMCTL_LOG=str(log),
        PATH=f"{bin_dir}:{os.environ['PATH']}",
        XDG_RUNTIME_DIR=str(tmp_path / "run"),
    )
    result = subprocess.run(
        ["bash", str(INSTALLER)],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    commands = log.read_text().splitlines()
    assert "command=--user daemon-reload" in commands
    assert "command=--user enable --now symphony-reconciler.timer" in commands
    assert "command=--user enable --now gem-disk-reclaim.timer" in commands
    assert all("symphony-ui-pilot.service" not in line for line in commands)
    assert "TIMER_ENABLED symphony-reconciler.timer" in result.stdout
    assert "TIMER_ENABLED gem-disk-reclaim.timer" in result.stdout
    assert "symphony-concurrency-controller.timer" not in commands
    assert all("symphony-ui-pilot.service" not in line for line in commands)
    assert "TIMER_ENABLED symphony-reconciler.timer" in result.stdout
    assert "TIMER_ENABLED symphony-concurrency-controller.timer" not in result.stdout
    check = _run_installer(tmp_path, "--check")
    assert check.returncode == 0, check.stdout
