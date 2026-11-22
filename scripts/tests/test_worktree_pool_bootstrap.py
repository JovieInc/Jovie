"""Real Git regression for a bare Gem common store; no external install."""
import io
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import lane_runner
import worktree_pool as pool


def git(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()


class BarePoolBootstrapTest(unittest.TestCase):
    def fill_fixture(self, shared_hook, *, node_pin="24.22.3", node_actual="v24.22.3",
                     manager="pnpm@9.15.9", manager_actual="9.15.9", ready=True, failure=None):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw).resolve()
            source, bare, bins = root / "source", root / "mirror.git", root / "bin"
            source.mkdir()
            bins.mkdir()
            git(source, "init", "-q", "-b", "main")
            hooks, installers = source / ".husky", source / "scripts/hooks"
            hooks.mkdir()
            installers.mkdir(parents=True)
            for name in ("pre-commit", "pre-push"):
                (hooks / name).write_text("#!/bin/sh\nexit 0\n")
                (hooks / name).chmod(0o755)
            for name in ("configure-git-hooks.sh", "verify-git-hooks.sh"):
                (installers / name).write_bytes((ROOT / "scripts/hooks" / name).read_bytes())
            if node_pin is not None:
                (source / ".nvmrc").write_text(node_pin)
            (source / "package.json").write_text('{"packageManager":"' + manager + '"}')
            for name, result in (("node", node_actual), ("pnpm", manager_actual)):
                shim = bins / name
                shim.write_text(f"#!/bin/sh\n[ \"$1\" = --version ] || exit 19\nprintf '%s\\n' '{result}'\n")
                shim.chmod(0o700)
            git(source, "add", ".")
            git(source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                "-c", "commit.gpgsign=false", "commit", "-qm", "fixture")
            git(source, "clone", "-q", "--bare", str(source), str(bare))
            git(bare, "config", "extensions.worktreeConfig", "true")
            if shared_hook is not None:
                git(bare, "config", "core.hooksPath", shared_hook)
            before = (bare / "config").read_bytes()
            # The install fixture calls the real prepare hook, as pnpm does.
            with patch.object(pool, "INSTALL", ["bash", "scripts/hooks/configure-git-hooks.sh"]), \
                 patch.object(pool, "node_env", return_value={**os.environ, "PATH": f"{bins}:{os.environ['PATH']}"}):
                actions = pool.fill(bare, 1, "main", warm=False, root=root / "cache", min_free_gb=0, log=io.StringIO())
            slots = pool.ready_slots(pool.pool_dir(bare, root / "cache"))
            self.assertEqual((bare / "config").read_bytes(), before)
            self.assertEqual(git(bare, "rev-parse", "--is-bare-repository"), "true")
            self.assertEqual(len(slots), int(ready), actions)
            if not ready:
                self.assertIn(failure, " ".join(actions))
                return
            slot = slots[0]
            self.assertEqual(git(slot, "rev-parse", "--show-toplevel"), str(slot))
            self.assertEqual(git(slot, "config", "--worktree", "--get", "core.bare"), "false")
            self.assertEqual(git(slot, "config", "--worktree", "--get", "core.hooksPath"), ".husky")
            subprocess.run(["bash", "scripts/hooks/verify-git-hooks.sh"], cwd=slot, check=True)
            self.assertEqual(git(slot, "status", "--porcelain"), "")
            sibling = root / "untouched-sibling"
            git(bare, "worktree", "add", "--detach", "--quiet", str(sibling), "main")
            self.assertEqual(git(sibling, "rev-parse", "--is-inside-work-tree"), "false")

    def test_new_slot_preserves_nondefault_or_missing_common_hook_setting(self):
        for shared in ("custom-hooks", None):
            with self.subTest(shared=shared):
                self.fill_fixture(shared)

    def test_runtime_pins_fail_closed_before_install_or_ready_marker(self):
        for kwargs, failure in (
            ({"node_pin": None}, "pins unavailable"),
            ({"node_actual": "v22.23.2"}, "Node version differs"),
            ({"manager": "yarn@9.15.9"}, "pins invalid"),
            ({"manager_actual": "9.15.4"}, "pnpm version differs"),
        ):
            with self.subTest(kwargs=kwargs):
                self.fill_fixture("custom-hooks", ready=False, failure=failure, **kwargs)

    def test_updater_does_not_clear_refusal_for_failed_refill(self):
        p = lane_runner.worktree_pool
        stderr = io.StringIO()
        with patch.object(p, "enabled", return_value=True), \
             patch.object(p, "pool_dir", return_value=Path("/pool")), \
             patch.object(p, "ready_slots", return_value=[]), \
             patch.object(p, "fill", return_value=["failed slot-a: pin check failed"]), \
             patch("sys.stderr", stderr):
            self.assertFalse(lane_runner.ensure_dependency_pool(SimpleNamespace(repo=Path("/repo"))))
        self.assertIn("refill left no ready slot", stderr.getvalue())
        self.assertIn("failed slot-a: pin check failed", stderr.getvalue())
