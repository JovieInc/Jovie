#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import platform
import subprocess
import tarfile
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts/hermes/symphony-nvme-package-cache.sh"
NODE_VERSION = "22.23.2"
PNPM_VERSION = "9.15.4"
SCHEMA = "symphony-nvme-package-cache/v2"


def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def cache_key(lock_sha: str, workspace_sha: str) -> str:
    payload = {
        "schema": SCHEMA,
        "repo": "JovieInc/Jovie",
        "nodeVersion": NODE_VERSION,
        "pnpmVersion": PNPM_VERSION,
        "lockfileSha256": lock_sha,
        "workspaceFileSha256": workspace_sha,
        "platform": platform.system().lower(),
        "arch": platform.machine(),
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()


class Fixture:
    def __init__(self, root: pathlib.Path):
        self.root = root
        self.workspace = root / "workspace"
        self.cache_root = root / "cache-root"
        self.receipts = root / "receipts"
        self.bin = root / "bin"
        self.pnpm_log = root / "pnpm.log"
        self.workspace.mkdir()
        self.cache_root.mkdir()
        self.receipts.mkdir()
        self.bin.mkdir()
        self.write_workspace()
        self.write_tools()

    def run(self, *args: str, extra_env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
        phase = "before_remove" if args and args[0] in {"before-remove", "before_remove"} else "after_create"
        env = {
            **os.environ,
            "PATH": f"{self.bin}:{os.environ['PATH']}",
            "SYMPHONY_ISSUE_IDENTIFIER": "JOV-5819",
            "SYMPHONY_TRUSTED_HOOK_PHASE": phase,
            "SYMPHONY_NVME_ALLOW_TEST_ROOT": "1",
            "SYMPHONY_NVME_CACHE_ROOT": str(self.cache_root),
            "SYMPHONY_NVME_RECEIPT_DIR": str(self.receipts),
            "SYMPHONY_NVME_RESTORE_LOCK": str(self.root / "restore.lock"),
        }
        if extra_env:
            env.update(extra_env)
        return subprocess.run(
            ["bash", str(SCRIPT), *args],
            cwd=self.workspace,
            env=env,
            capture_output=True,
            text=True,
        )

    def write_workspace(self) -> None:
        (self.workspace / ".nvmrc").write_text(f"{NODE_VERSION}\n")
        (self.workspace / ".node-version").write_text(f"{NODE_VERSION}\n")
        (self.workspace / "package.json").write_text(
            json.dumps(
                {
                    "name": "jovie-monorepo",
                    "private": True,
                    "engines": {
                        "node": f">={NODE_VERSION} <23",
                        "pnpm": PNPM_VERSION,
                    },
                    "packageManager": f"pnpm@{PNPM_VERSION}",
                }
            )
        )
        (self.workspace / "pnpm-lock.yaml").write_text("lockfileVersion: '9.0'\n")
        (self.workspace / "pnpm-workspace.yaml").write_text("packages: []\n")
        subprocess.run(["git", "init", "-b", "main"], cwd=self.workspace, check=True, stdout=subprocess.DEVNULL)
        subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=self.workspace, check=True)
        subprocess.run(["git", "config", "user.name", "Test"], cwd=self.workspace, check=True)
        subprocess.run(["git", "add", "."], cwd=self.workspace, check=True)
        subprocess.run(["git", "commit", "-m", "fixture"], cwd=self.workspace, check=True, stdout=subprocess.DEVNULL)

    def write_tools(self, node_version: str = NODE_VERSION, network_trace: str = "") -> None:
        (self.bin / "node").write_text(f"#!/usr/bin/env bash\nprintf 'v{node_version}\\n'\n")
        (self.bin / "pnpm").write_text(
            "#!/usr/bin/env bash\n"
            "if [ \"${1:-}\" = --version ]; then printf '9.15.4\\n'; exit 0; fi\n"
            "printf '%s\\n' \"$*\" >> \"$PNPM_LOG\"\n"
            "if [ \"${1:-}\" = fetch ]; then\n"
            "  if [ \"${PNPM_FETCH_EXIT:-0}\" -ne 0 ]; then exit \"$PNPM_FETCH_EXIT\"; fi\n"
            "  store=\n"
            "  while [ $# -gt 0 ]; do\n"
            "    if [ \"$1\" = --store-dir ]; then store=\"$2\"; break; fi\n"
            "    shift\n"
            "  done\n"
            "  mkdir -p \"$store/v3/files/ab\"\n"
            "  printf 'cached package bytes\\n' > \"$store/v3/files/ab/pkg\"\n"
            "  exit 0\n"
            "fi\n"
            "if [ \"${npm_config_ignore_scripts:-}\" != true ]; then echo scripts-enabled >&2; exit 42; fi\n"
            "if [ \"${npm_config_offline:-}\" != true ]; then echo offline-disabled >&2; exit 43; fi\n"
            "mkdir -p node_modules apps/web/node_modules/next\n"
            "printf 'layoutVersion: 5\\n' > node_modules/.modules.yaml\n"
        )
        (self.bin / "strace").write_text(
            "#!/usr/bin/env bash\n"
            "out=\n"
            "while [ $# -gt 0 ]; do\n"
            "  case \"$1\" in\n"
            "    -o) out=\"$2\"; shift 2 ;;\n"
            "    -ff) shift ;;\n"
            "    -e) shift 2 ;;\n"
            "    *) break ;;\n"
            "  esac\n"
            "done\n"
            "\"$@\"\n"
            "status=$?\n"
            "printf '%s\\n' " + repr(network_trace) + " > \"${out}.1\"\n"
            "exit $status\n"
        )
        (self.bin / "flock").write_text("#!/usr/bin/env bash\nexit 0\n")
        (self.bin / "date").write_text(
            "#!/usr/bin/env bash\n"
            "if [ \"${1:-}\" = '+%s%3N' ]; then printf '1000\\n'; exit 0; fi\n"
            "exec /bin/date \"$@\"\n"
        )
        os.chmod(self.bin / "node", 0o755)
        os.chmod(self.bin / "pnpm", 0o755)
        os.chmod(self.bin / "strace", 0o755)
        os.chmod(self.bin / "flock", 0o755)
        os.chmod(self.bin / "date", 0o755)

    def build_archive(self, tamper: bool = False, manifest_overrides: dict[str, str] | None = None) -> pathlib.Path:
        source = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=self.workspace, text=True).strip()
        lock_sha = sha256(self.workspace / "pnpm-lock.yaml")
        workspace_sha = sha256(self.workspace / "pnpm-workspace.yaml")
        key = cache_key(lock_sha, workspace_sha)
        archive = self.cache_root / f"node-{NODE_VERSION}-pnpm-{PNPM_VERSION}-lock-{lock_sha[:16]}-cache-{key[:16]}.tar"
        store = self.root / "store"
        (store / "v3/files/ab").mkdir(parents=True)
        (store / "v3/files/ab/pkg").write_text("cached package bytes\n")
        with tarfile.open(archive, "w") as tar:
            tar.add(store / "v3", arcname="v3")
        archive_hash = sha256(archive)
        (archive.with_suffix(archive.suffix + ".sha256")).write_text(f"{archive_hash}  {archive}\n")
        manifest = {
            "schema": SCHEMA,
            "repo": "JovieInc/Jovie",
            "warmedFromSourceSha": source,
            "nodeVersion": NODE_VERSION,
            "pnpmVersion": PNPM_VERSION,
            "lockfileSha256": lock_sha,
            "workspaceFileSha256": workspace_sha,
            "platform": platform.system().lower(),
            "arch": platform.machine(),
            "cacheKey": key,
            "archivePath": str(archive),
            "archiveSha256": archive_hash,
        }
        if manifest_overrides:
            manifest.update(manifest_overrides)
        (archive.with_suffix(archive.suffix + ".json")).write_text(json.dumps(manifest))
        if tamper:
            with archive.open("ab") as handle:
                handle.write(b"tamper")
        return archive


class SymphonyNvmePackageCacheTests(unittest.TestCase):
    def fixture(self) -> Fixture:
        self.tmp = tempfile.TemporaryDirectory()
        return Fixture(pathlib.Path(self.tmp.name))

    def tearDown(self) -> None:
        if hasattr(self, "tmp"):
            self.tmp.cleanup()

    def test_after_create_restores_private_store_offline_and_writes_receipt(self) -> None:
        fx = self.fixture()
        archive = fx.build_archive()
        result = fx.run("after-create", extra_env={"PNPM_LOG": str(fx.pnpm_log)})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("SYMPHONY_NVME_PACKAGE_CACHE_OK", result.stdout)
        self.assertTrue((fx.workspace / ".symphony/package-cache/pnpm-store/v3/files/ab/pkg").is_file())
        self.assertTrue((fx.workspace / "node_modules/.modules.yaml").is_file())
        self.assertIn(
            "install --offline --frozen-lockfile --ignore-scripts --store-dir",
            fx.pnpm_log.read_text(),
        )
        receipt = json.loads((fx.workspace / ".symphony/package-cache/restore-receipt.json").read_text())
        self.assertEqual(receipt["schema"], "symphony-nvme-package-cache-restore/v1")
        self.assertEqual(receipt["archive"]["path"], str(archive))
        self.assertEqual(receipt["restore"]["networkProof"]["afInetEvents"], 0)
        self.assertFalse(receipt["commandPolicy"]["agentInstallOrFetchAllowed"])
        self.assertTrue(list(fx.receipts.glob("*-restore.json")))

    def test_warm_builds_dependency_keyed_archive_then_restore_hits_it(self) -> None:
        fx = self.fixture()
        warm = fx.run(
            "warm",
            extra_env={
                "PNPM_LOG": str(fx.pnpm_log),
                "SYMPHONY_TRUSTED_HOOK_PHASE": "cache_warm",
            },
        )
        self.assertEqual(warm.returncode, 0, warm.stderr)
        self.assertIn("SYMPHONY_NVME_PACKAGE_CACHE_WARM", warm.stdout)
        self.assertFalse((fx.workspace / "node_modules").exists())
        archives = list(fx.cache_root.glob("*.tar"))
        self.assertEqual(len(archives), 1)
        manifest = json.loads(pathlib.Path(f"{archives[0]}.json").read_text())
        self.assertEqual(manifest["schema"], SCHEMA)
        self.assertNotIn("sourceSha", manifest)
        restore = fx.run("after-create", extra_env={"PNPM_LOG": str(fx.pnpm_log)})
        self.assertEqual(restore.returncode, 0, restore.stderr)
        self.assertTrue((fx.workspace / "node_modules/.modules.yaml").is_file())

    def test_failed_warm_removes_only_its_partial_cache_directory(self) -> None:
        fx = self.fixture()
        sibling = fx.cache_root / ".warm-unrelated"
        sibling.mkdir()
        result = fx.run(
            "warm",
            extra_env={
                "PNPM_FETCH_EXIT": "42",
                "PNPM_LOG": str(fx.pnpm_log),
                "SYMPHONY_TRUSTED_HOOK_PHASE": "cache_warm",
            },
        )
        self.assertEqual(result.returncode, 42, result.stderr)
        self.assertEqual(list(fx.cache_root.glob(".warm-*")), [sibling])
        self.assertTrue(sibling.is_dir())
        self.assertFalse(list(fx.cache_root.glob("*.tar")))

    def test_before_remove_deletes_mutable_state_and_preserves_archive(self) -> None:
        fx = self.fixture()
        archive = fx.build_archive()
        result = fx.run("after-create", extra_env={"PNPM_LOG": str(fx.pnpm_log)})
        self.assertEqual(result.returncode, 0, result.stderr)
        sibling = fx.root / "sibling-workspace"
        sibling.mkdir()
        (sibling / "node_modules").mkdir()
        teardown = fx.run("before-remove", extra_env={"PNPM_LOG": str(fx.pnpm_log)})
        self.assertEqual(teardown.returncode, 0, teardown.stderr)
        self.assertFalse((fx.workspace / ".symphony/package-cache/pnpm-store").exists())
        self.assertFalse((fx.workspace / "node_modules").exists())
        self.assertFalse((fx.workspace / "apps/web/node_modules").exists())
        self.assertTrue(archive.exists())
        self.assertTrue((sibling / "node_modules").exists())
        self.assertTrue(list(fx.receipts.glob("*teardown*.json")))

    def test_before_remove_without_restore_receipt_still_writes_teardown_receipt(self) -> None:
        fx = self.fixture()
        (fx.workspace / ".symphony/package-cache/pnpm-store/v3").mkdir(parents=True)
        (fx.workspace / "node_modules/.pnpm").mkdir(parents=True)
        teardown = fx.run("before-remove", extra_env={"PNPM_LOG": str(fx.pnpm_log)})
        self.assertEqual(teardown.returncode, 0, teardown.stderr)
        self.assertIn("SYMPHONY_NVME_PACKAGE_CACHE_TEARDOWN", teardown.stdout)
        self.assertFalse((fx.workspace / ".symphony/package-cache/pnpm-store").exists())
        self.assertFalse((fx.workspace / "node_modules").exists())
        receipt = json.loads((fx.workspace / ".symphony/package-cache/teardown-receipt.json").read_text())
        self.assertEqual(receipt["archive"]["path"], "unknown")
        self.assertIsNone(receipt["archive"]["sha256"])
        self.assertIsNone(receipt["archive"]["ownership"])
        self.assertIsNone(receipt["preserved"]["immutableArchiveExists"])

    def test_before_remove_empty_workspace_still_writes_teardown_receipt(self) -> None:
        fx = self.fixture()
        teardown = fx.run("before-remove", extra_env={"PNPM_LOG": str(fx.pnpm_log)})
        self.assertEqual(teardown.returncode, 0, teardown.stderr)
        receipt = json.loads((fx.workspace / ".symphony/package-cache/teardown-receipt.json").read_text())
        self.assertEqual(receipt["removed"], [])
        self.assertIsNone(receipt["archive"]["sha256"])
        self.assertTrue(receipt["preserved"]["workspaceExists"])

    def test_node_mismatch_fails_before_install(self) -> None:
        fx = self.fixture()
        fx.write_tools(node_version="22.23.1")
        fx.build_archive()
        result = fx.run("after-create", extra_env={"PNPM_LOG": str(fx.pnpm_log)})
        self.assertEqual(result.returncode, 78)
        self.assertIn("node-version-mismatch", result.stderr)
        self.assertFalse(fx.pnpm_log.exists())

    def test_cache_key_mismatch_fails_closed(self) -> None:
        fx = self.fixture()
        fx.build_archive(manifest_overrides={"cacheKey": "0" * 64})
        result = fx.run("after-create", extra_env={"PNPM_LOG": str(fx.pnpm_log)})
        self.assertEqual(result.returncode, 78)
        self.assertIn("cache-key-mismatch", result.stderr)
        self.assertFalse((fx.workspace / "node_modules").exists())

    def test_archive_tamper_fails_closed(self) -> None:
        fx = self.fixture()
        fx.build_archive(tamper=True)
        result = fx.run("after-create", extra_env={"PNPM_LOG": str(fx.pnpm_log)})
        self.assertEqual(result.returncode, 78)
        self.assertIn("archive-checksum-mismatch", result.stderr)
        self.assertFalse((fx.workspace / "node_modules").exists())

    def test_network_attempt_detected_after_offline_install(self) -> None:
        fx = self.fixture()
        fx.write_tools(network_trace='connect(3, {sa_family=AF_INET, sin_port=htons(443)}, 16) = -1')
        fx.build_archive()
        result = fx.run("after-create", extra_env={"PNPM_LOG": str(fx.pnpm_log)})
        self.assertEqual(result.returncode, 78)
        self.assertIn("network-access-detected", result.stderr)

    def test_test_root_override_rejects_workspace_outside_system_temp(self) -> None:
        with tempfile.TemporaryDirectory(dir=pathlib.Path.home()) as root:
            fx = Fixture(pathlib.Path(root))
            fx.build_archive()
            result = fx.run("after-create", extra_env={"PNPM_LOG": str(fx.pnpm_log)})
            self.assertEqual(result.returncode, 78)
            self.assertIn("test-root-override-outside-tmp", result.stderr)
            self.assertFalse(fx.pnpm_log.exists())


if __name__ == "__main__":
    unittest.main()
