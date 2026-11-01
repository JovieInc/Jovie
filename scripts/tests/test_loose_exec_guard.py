"""
Regression tests for scripts/hostops/loose_exec_guard.py.

The guard flags launchd agents, systemd user units, crontab lines and PATH
directories that execute files outside a CI-tracked JovieInc checkout, a
package-manager prefix or the hostops install receipt.

Run with:
    python -m pytest scripts/tests/test_loose_exec_guard.py -v
"""
from __future__ import annotations

import importlib.util
import json
import plistlib
import subprocess
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[2]
_GUARD = _REPO_ROOT / "scripts" / "hostops" / "loose_exec_guard.py"


@pytest.fixture()
def guard(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LOOSE_EXEC_HOME", str(tmp_path))
    spec = importlib.util.spec_from_file_location("loose_exec_guard_under_test", _GUARD)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    monkeypatch.setattr(mod.platform, "system", lambda: "Linux")  # skip launchctl
    return mod


def script(path: Path, body: str = "#!/bin/sh\necho hi\n") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body)
    path.chmod(0o755)
    return path


def write_plist(home: Path, label: str, argv: list[str]) -> None:
    agents = home / "Library/LaunchAgents"
    agents.mkdir(parents=True, exist_ok=True)
    (agents / f"{label}.plist").write_bytes(plistlib.dumps({"Label": label, "ProgramArguments": argv}))


def git_checkout(root: Path, remote: str) -> None:
    root.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "init", "-q", str(root)], check=True)
    subprocess.run(["git", "-C", str(root), "remote", "add", "origin", remote], check=True)


def test_loose_launchd_script_is_flagged(guard, tmp_path: Path) -> None:
    loose = script(tmp_path / ".hermes/scripts/serve.sh")
    write_plist(tmp_path, "com.example.serve", [str(loose)])
    report = guard.scan(path_env="", cron_text="")
    assert [(v["id"], v["reason"]) for v in report["violations"]] == [("com.example.serve", "loose")]


def test_shell_c_body_is_parsed(guard, tmp_path: Path) -> None:
    loose = script(tmp_path / "bin/job.mjs")
    write_plist(tmp_path, "co.example.job", ["/bin/zsh", "-c", f'exec /usr/bin/node "{loose}"'])
    report = guard.scan(path_env="", cron_text="")
    assert [v["file"] for v in report["violations"]] == [str(loose)]


def test_missing_target_is_reported(guard, tmp_path: Path) -> None:
    write_plist(tmp_path, "co.example.gone", ["/usr/bin/node", str(tmp_path / "wt/gone/scripts/x.mjs")])
    report = guard.scan(path_env="", cron_text="")
    assert report["violations"][0]["reason"] == "missing"


def test_system_and_package_manager_paths_are_allowed(guard, tmp_path: Path) -> None:
    node = script(tmp_path / ".nvm/versions/node/v24/bin/node")
    write_plist(tmp_path, "co.example.ok", ["/usr/bin/python3", str(node)])
    assert guard.scan(path_env="", cron_text="")["violations"] == []


def test_tracked_file_in_jovie_checkout_is_allowed(guard, tmp_path: Path) -> None:
    repo = tmp_path / "wt/jovie"
    git_checkout(repo, "https://github.com/JovieInc/Jovie.git")
    tracked = script(repo / "scripts/probe.sh")
    untracked = script(repo / "scripts/scratch.sh")
    subprocess.run(["git", "-C", str(repo), "add", "scripts/probe.sh"], check=True)
    cron = f"*/5 * * * * {tracked}\n0 * * * * {untracked} >> /tmp/x.log 2>&1\n"
    report = guard.scan(path_env="", cron_text=cron)
    assert [v["file"] for v in report["violations"]] == [str(untracked)]


def test_non_jovie_remote_is_loose(guard, tmp_path: Path) -> None:
    repo = tmp_path / "src/other"
    git_checkout(repo, "https://github.com/someone/else.git")
    f = script(repo / "run.sh")
    subprocess.run(["git", "-C", str(repo), "add", "run.sh"], check=True)
    report = guard.scan(path_env="", cron_text=f"@reboot {f}\n")
    assert report["violations"][0]["reason"] == "loose"


def test_receipt_allows_installed_copy_until_hand_edited(guard, tmp_path: Path) -> None:
    installed = script(tmp_path / ".local/share/jovie-hostops/bin/codex")
    guard.record(str(installed), "scripts/hostops/codex-launcher.sh")
    cron = f"0 * * * * {installed}\n"
    assert guard.scan(path_env="", cron_text=cron)["violations"] == []
    installed.write_text("#!/bin/sh\necho edited by hand\n")
    assert guard.scan(path_env="", cron_text=cron)["violations"][0]["reason"] == "receipt-sha-mismatch"


def test_systemd_execstart_and_home_specifier(guard, tmp_path: Path) -> None:
    script(tmp_path / ".local/bin/worker.py")
    unit = tmp_path / ".config/systemd/user/worker.service"
    unit.parent.mkdir(parents=True)
    unit.write_text("[Service]\nExecStart=-/usr/bin/python3 %h/.local/bin/worker.py --loop\n")
    report = guard.scan(path_env="", cron_text="")
    assert [(v["source"], v["file"]) for v in report["violations"]] == [
        ("systemd", str(tmp_path / ".local/bin/worker.py"))
    ]


def test_path_dir_with_loose_executables(guard, tmp_path: Path) -> None:
    script(tmp_path / ".hermes/bin/codex")
    script(tmp_path / ".nvm/versions/node/v24/bin/node")
    path_env = f"{tmp_path / '.hermes/bin'}:{tmp_path / '.nvm/versions/node/v24/bin'}:/usr/bin"
    report = guard.scan(path_env=path_env, cron_text="")
    assert [(v["source"], v["files"]) for v in report["violations"]] == [("PATH", ["codex"])]


def test_cli_strict_exit_and_report_ledger(tmp_path: Path) -> None:
    script(tmp_path / ".hermes/bin/codex")
    env = {"LOOSE_EXEC_HOME": str(tmp_path), "PATH": f"{tmp_path / '.hermes/bin'}:/usr/bin:/bin", "HOME": str(tmp_path)}
    report_path = tmp_path / "state/report.json"
    res = subprocess.run(
        ["python3", str(_GUARD), "scan", "--strict", "--report", str(report_path)],
        capture_output=True, text=True, env=env, timeout=60,
    )
    assert res.returncode == 1
    assert json.loads(report_path.read_text())["violationCount"] >= 1
    ledger = (tmp_path / "state/ledger.jsonl").read_text().splitlines()
    assert json.loads(ledger[-1])["violationCount"] >= 1


def test_compiled_vendor_binary_is_not_a_script(guard, tmp_path: Path) -> None:
    binary = tmp_path / ".local/bin/vendor-tool"
    binary.parent.mkdir(parents=True)
    binary.write_bytes(b"\x7fELF" + b"\x00" * 60)
    binary.chmod(0o755)
    script(tmp_path / ".local/bin/handmade.sh")
    report = guard.scan(path_env=str(tmp_path / ".local/bin"), cron_text="")
    assert report["violations"][0]["files"] == ["handmade.sh"]
