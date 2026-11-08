"""Tests for the lane-host Git floor (JOV-11391): scripts/lanes/host_git.py probe and
scripts/hostops/install-lane-host-git.sh.

Run with:
    python3 -m pytest scripts/tests/test_host_git.py -q
"""
from __future__ import annotations

import importlib.util
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
INSTALLER = ROOT / "scripts/hostops/install-lane-host-git.sh"


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/lanes/{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


host_git = load("host_git")


def fake_git(version, lazy_ok=True):
    def run(argv, **_):
        if "--no-lazy-fetch" in argv and not lazy_ok:
            return SimpleNamespace(returncode=129, stdout="", stderr="unknown option")
        return SimpleNamespace(returncode=0, stdout=f"git version {version}\n", stderr="")
    return run


class Probe(unittest.TestCase):
    def test_gem_git_2_43_is_named_below_minimum(self):
        found = host_git.probe(run=fake_git("2.43.0", lazy_ok=False))
        self.assertIs(found["ok"], False)
        self.assertIn("host-git-below-minimum", found["detail"])
        self.assertIn("install-lane-host-git.sh", found["detail"])

    def test_floor_version_passes(self):
        self.assertIs(host_git.probe(run=fake_git("2.44.0"))["ok"], True)
        self.assertIs(host_git.probe(run=fake_git("2.51.2"))["ok"], True)
        self.assertIs(host_git.probe(run=fake_git("3.0.1"))["ok"], True)

    def test_new_version_that_rejects_the_flag_is_red(self):
        found = host_git.probe(run=fake_git("2.50.0", lazy_ok=False))
        self.assertIs(found["ok"], False)
        self.assertIn("host-git-below-minimum", found["detail"])

    def test_missing_git_is_red(self):
        def boom(*_a, **_k):
            raise FileNotFoundError("git")
        found = host_git.probe(run=boom)
        self.assertIs(found["ok"], False)
        self.assertIn("host-git-below-minimum", found["detail"])

    def test_registered_as_integration_probe_with_registry_row(self):
        probes = load("integration_probes")
        self.assertIn("gem:host-git", probes.PROBES)


class Installer(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.bin = Path(self.tmp.name)
        self.log = self.bin / "calls.log"
        self.state = self.bin / "installed"

    def tearDown(self):
        self.tmp.cleanup()

    def stub(self, name, body):
        path = self.bin / name
        path.write_text("#!/usr/bin/env bash\n" + body)
        path.chmod(path.stat().st_mode | stat.S_IEXEC)

    def setup_host(self, old=True):
        # git reports 2.43 (rejecting the flag) until apt-get install git has run.
        self.stub("git", f'''if [[ -e "{self.state}" ]]; then
  echo "git version 2.47.1"; exit 0
fi
[[ "$1" == "--no-lazy-fetch" ]] && exit 129
echo "git version 2.43.0"
''' if old else 'echo "git version 2.47.1"\n')
        self.stub("id", 'echo 1000\n')
        self.stub("sudo", f'echo "sudo $*" >> "{self.log}"\nif [[ "$1" == "-n" ]]; then shift; fi\n[[ "$1" == "true" ]] && exit 0\nexec "$@"\n')
        self.stub("apt-get", f'echo "apt-get $*" >> "{self.log}"\n[[ "$*" == *"install -y -qq git" ]] && touch "{self.state}"\nexit 0\n')
        self.stub("add-apt-repository", f'echo "add-apt-repository $*" >> "{self.log}"\n')

    def run_installer(self, *args):
        env = {"PATH": f"{self.bin}:/usr/bin:/bin", "HOME": self.tmp.name}
        return subprocess.run(["bash", str(INSTALLER), *args], capture_output=True, text=True, env=env)

    def calls(self):
        return self.log.read_text() if self.log.exists() else ""

    def test_installs_from_git_core_ppa_and_verifies(self):
        self.setup_host()
        done = self.run_installer()
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertIn("add-apt-repository -y ppa:git-core/ppa", self.calls())
        self.assertIn("install -y -qq git", self.calls())
        self.assertIn("git installed: git version 2.47.1", done.stdout)

    def test_idempotent_when_already_at_floor(self):
        self.setup_host(old=False)
        done = self.run_installer()
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertEqual(self.calls(), "")
        self.assertIn("git ok", done.stdout)

    def test_check_mode_fails_with_named_reason_and_changes_nothing(self):
        self.setup_host()
        done = self.run_installer("--check")
        self.assertEqual(done.returncode, 1)
        self.assertIn("host-git-below-minimum", done.stderr)
        self.assertEqual(self.calls(), "")

    def test_no_sudo_stops_with_exit_2(self):
        self.setup_host()
        self.stub("sudo", "exit 1\n")
        done = self.run_installer()
        self.assertEqual(done.returncode, 2)
        self.assertIn("passwordless sudo", done.stderr)


if __name__ == "__main__":
    unittest.main()
