#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import os
import pathlib
import subprocess
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
HELPER = ROOT / "scripts/hermes/jovie-symphony-workspace"
WRAPPER = ROOT / "scripts/hermes/jovie-symphony-workspace-create"


class JovieSymphonyWorkspaceTests(unittest.TestCase):
    def test_declared_roots_and_known_bucket_mapping(self) -> None:
        source = HELPER.read_text()
        prefix = source.split("\nrequire_root\ninit_state\n", 1)[0]
        expected = {
            "JOV-9900000": 0,
            "JOV-9900001": 1,
            "JOV-9900008": 2,
            "JOV-9900002": 3,
        }
        for issue, bucket in expected.items():
            result = subprocess.run(
                ["bash", "-c", f"{prefix}\nbucket_for_issue {issue}"],
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertEqual(int(result.stdout.strip()), bucket)
            digest_bucket = int(hashlib.sha256(issue.encode()).hexdigest()[:8], 16) % 4
            self.assertEqual(bucket, digest_bucket)
        for root in (
            "/srv/worktrees/symphony-shards/jovie",
            "/srv/models/symphony-worktrees/jovie",
            "/srv/cache/symphony-worktrees/jovie",
            "/srv/scratch/symphony-worktrees/jovie",
        ):
            self.assertIn(root, source)

    def _wrapper_fixture(self, cache_exit: int = 0) -> tuple[tempfile.TemporaryDirectory[str], pathlib.Path, pathlib.Path]:
        temp = tempfile.TemporaryDirectory()
        root = pathlib.Path(temp.name)
        bin_dir = root / "bin"
        bin_dir.mkdir()
        log = root / "events.log"
        helper = root / "helper"
        clone = root / "clone"
        wrapper = root / "wrapper"

        (bin_dir / "node").write_text("#!/usr/bin/env bash\nprintf 'v22.23.2\\n'\n")
        (bin_dir / "pnpm").write_text("#!/usr/bin/env bash\nprintf '9.15.4\\n'\n")
        (bin_dir / "realpath").write_text(
            "#!/usr/bin/env bash\n"
            "[ \"${1:-}\" = -m ] && shift\n"
            "python3 -c 'import pathlib,sys; print(pathlib.Path(sys.argv[1]).resolve())' \"$1\"\n"
        )
        (bin_dir / "sudo").write_text("#!/usr/bin/env bash\n[ \"$1\" = -n ] && shift\nexec \"$@\"\n")
        helper.write_text("#!/usr/bin/env bash\nprintf '%s\\n' \"$1\" >> \"$EVENT_LOG\"\n")
        clone.write_text(
            "#!/usr/bin/env bash\n"
            "printf 'clone\\n' >> \"$EVENT_LOG\"\n"
            "mkdir -p \"$1/.git\" \"$1/scripts/hermes\"\n"
            "cat > \"$1/scripts/hermes/symphony-nvme-package-cache.sh\" <<'EOF'\n"
            "#!/usr/bin/env bash\n"
            "printf 'cache:%s:%s\\n' \"$SYMPHONY_TRUSTED_HOOK_PHASE\" \"$SYMPHONY_ISSUE_IDENTIFIER\" >> \"$EVENT_LOG\"\n"
            f"exit {cache_exit}\n"
            "EOF\n"
        )
        wrapper_source = WRAPPER.read_text()
        wrapper_source = wrapper_source.replace('/usr/local/sbin/jovie-symphony-workspace', str(helper))
        wrapper_source = wrapper_source.replace('/home/timwhite/.local/bin/jovie-workspace-clone', str(clone))
        wrapper_source = wrapper_source.replace('/home/timwhite/.nvm/versions/node/v22.23.2/bin', str(bin_dir))
        wrapper.write_text(wrapper_source)
        for path in (bin_dir / "node", bin_dir / "pnpm", bin_dir / "realpath", bin_dir / "sudo", helper, clone, wrapper):
            path.chmod(0o755)
        return temp, wrapper, log

    def test_wrapper_orders_prepare_clone_cache_activate(self) -> None:
        temp, wrapper, log = self._wrapper_fixture()
        self.addCleanup(temp.cleanup)
        workspace = pathlib.Path(temp.name) / "JOV-9900000"
        workspace.mkdir()
        result = subprocess.run(
            [str(wrapper), str(workspace)],
            env={**os.environ, "PATH": f"{pathlib.Path(temp.name) / 'bin'}:{os.environ['PATH']}", "EVENT_LOG": str(log)},
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            log.read_text().splitlines(),
            ["prepare", "clone", "cache:after_create:JOV-9900000", "activate"],
        )

    def test_cache_failure_aborts_without_activation(self) -> None:
        temp, wrapper, log = self._wrapper_fixture(cache_exit=78)
        self.addCleanup(temp.cleanup)
        workspace = pathlib.Path(temp.name) / "JOV-9900001"
        workspace.mkdir()
        result = subprocess.run(
            [str(wrapper), str(workspace)],
            env={**os.environ, "PATH": f"{pathlib.Path(temp.name) / 'bin'}:{os.environ['PATH']}", "EVENT_LOG": str(log)},
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(
            log.read_text().splitlines(),
            ["prepare", "clone", "cache:after_create:JOV-9900001", "abort"],
        )


if __name__ == "__main__":
    unittest.main()
