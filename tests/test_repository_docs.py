import importlib.util
import json
import subprocess
import tempfile
import runpy
from unittest.mock import patch
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("repository_docs", Path(__file__).resolve().parents[1] / "scripts/repository_docs.py")
docs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(docs)


class DocumentationParity(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "README.md").write_text("Local owner instructions\n")
        (self.root / "package.json").write_text(json.dumps({"packageManager": "pnpm@9.15.4", "engines": {"node": ">=24"}, "scripts": {"test": "vitest run"}, "dependencies": {"eve": "0.47.7"}}))
        self.config = {"schemaVersion": 1, "repository": "example/app", "entrypoints": ["README.md"], "sources": [{"path": "package.json", "purpose": "Actual runtime"}], "imports": [], "output": "docs/SOURCES.md"}
        self.save()

    def save(self):
        (self.root / "repository-docs.json").write_text(json.dumps(self.config))

    def test_source_change_detected_and_regeneration_preserves_local_instructions(self):
        self.assertTrue(docs.run(self.root))
        self.assertEqual(docs.run(self.root, True), [])
        self.assertEqual(docs.run(self.root), [])
        before = (self.root / "README.md").read_bytes()
        (self.root / "package.json").write_text('{"dependencies":{"eve":"1.0.0"}}')
        self.assertTrue(docs.run(self.root))
        docs.run(self.root, True)
        self.assertIn('"eve": "1.0.0"', (self.root / "docs/SOURCES.md").read_text())
        self.assertEqual((self.root / "README.md").read_bytes(), before)

    def test_missing_entrypoint_and_invalid_registry_fail(self):
        (self.root / "README.md").unlink()
        with self.assertRaises(ValueError): docs.run(self.root, True)
        self.config["schemaVersion"] = 2
        self.save()
        with self.assertRaises(ValueError): docs.run(self.root)

    def test_traversal_and_symlink_escape_rejected(self):
        for name in ("../escape", "/tmp/escape", ""):
            with self.assertRaises(ValueError): docs.local(self.root, name)
        (self.root / "escape").symlink_to(self.root.parent, target_is_directory=True)
        with self.assertRaises(ValueError): docs.local(self.root, "escape/out")

    def test_pinned_update_drift_and_independent_rollback(self):
        upstream = self.root / "upstream"
        upstream.mkdir()
        def git(*args):
            return subprocess.run(["git", "-C", str(upstream), *args], check=True, capture_output=True).stdout.decode().strip()
        git("init")
        git("config", "user.email", "test@example.invalid")
        git("config", "user.name", "Test")
        (upstream / "policy.md").write_text("first")
        git("add", ".")
        git("commit", "-m", "first")
        first = git("rev-parse", "HEAD")
        item = {"repository": "example/canon", "revision": first, "path": "policy.md", "destination": "company/policy.md", "sha256": docs.digest(b"first")}
        self.config["imports"] = [item]
        self.save()
        self.assertTrue(docs.run(self.root))
        mapping = {"example/canon": upstream}
        self.assertTrue(docs.run(self.root, upstreams=mapping))
        docs.run(self.root, True, mapping)
        self.assertEqual(docs.run(self.root, upstreams=mapping), [])
        (upstream / "policy.md").write_text("second")
        git("commit", "-am", "second")
        # An upstream change leaves the pinned consumer unchanged.
        self.assertEqual(docs.run(self.root, upstreams=mapping), [])
        item["revision"] = git("rev-parse", "HEAD")
        self.save()
        with self.assertRaises(ValueError): docs.run(self.root, True, mapping)
        self.assertEqual((self.root / "company/policy.md").read_text(), "first")
        item["sha256"] = docs.digest(b"second")
        self.save()
        docs.run(self.root, True, mapping)
        self.assertEqual((self.root / "company/policy.md").read_text(), "second")
        item.update(revision=first, sha256=docs.digest(b"first"))
        self.save()
        docs.run(self.root, True, mapping)
        self.assertEqual((self.root / "company/policy.md").read_text(), "first")
        item["revision"] = "main"
        self.save()
        with self.assertRaises(ValueError): docs.run(self.root)

    def test_duplicate_destinations_and_source_overwrite_rejected(self):
        item = {"repository": "x/y", "revision": "a" * 40, "path": "p", "destination": "copy", "sha256": docs.digest(b"ok")}
        (self.root / "copy").write_bytes(b"ok")
        self.config["imports"] = [item, item]
        self.save()
        with self.assertRaises(ValueError): docs.run(self.root, True)
        self.config["imports"] = []
        self.config["output"] = "package.json"
        self.save()
        with self.assertRaises(ValueError): docs.run(self.root, True)

    def test_entrypoints_and_aliases_cannot_be_overwritten(self):
        original = (self.root / "README.md").read_bytes()
        (self.root / "readme-alias").symlink_to("README.md")
        for destination in ("README.md", "readme-alias"):
            with self.subTest(destination=destination):
                self.config["imports"] = []
                self.config["output"] = destination
                self.save()
                with self.assertRaises(ValueError): docs.run(self.root, True)
                self.config["output"] = "docs/SOURCES.md"
                self.config["imports"] = [{"repository": "x/y", "revision": "a" * 40, "path": "p", "destination": destination, "sha256": docs.digest(original)}]
                self.save()
                with self.assertRaises(ValueError): docs.run(self.root, True)
                self.assertEqual((self.root / "README.md").read_bytes(), original)
                self.assertFalse((self.root / "docs/SOURCES.md").exists())

    def test_symlinked_registry_cannot_be_overwritten(self):
        registry = self.root / "repository-docs.json"
        registry.rename(self.root / "config.json")
        registry.symlink_to("config.json")
        (self.root / "config-alias").symlink_to("config.json")
        for destination in ("repository-docs.json", "config.json", "config-alias"):
            for writer in ("output", "import"):
                with self.subTest(destination=destination, writer=writer):
                    self.config["output"] = destination if writer == "output" else "docs/SOURCES.md"
                    self.config["imports"] = [] if writer == "output" else [{"repository": "x/y", "revision": "a" * 40, "path": "p", "destination": destination, "sha256": docs.digest(b"replacement")}]
                    self.save()
                    before = registry.read_bytes()
                    with self.assertRaises(ValueError): docs.run(self.root, True)
                    self.assertEqual(registry.read_bytes(), before)
                    self.assertTrue(registry.is_symlink())
                    self.assertFalse((self.root / "docs/SOURCES.md").exists())

    def test_imported_sources_use_pending_bytes_before_any_mutation(self):
        upstream = self.root / "upstream"
        upstream.mkdir()
        def git(*args):
            return subprocess.run(["git", "-C", str(upstream), *args], check=True, capture_output=True).stdout.decode().strip()
        git("init")
        git("config", "user.email", "test@example.invalid")
        git("config", "user.name", "Test")
        old = (self.root / "package.json").read_bytes()
        (upstream / "package.json").write_bytes(old)
        git("add", ".")
        git("commit", "-m", "old manifest")
        first = git("rev-parse", "HEAD")
        item = {"repository": "x/y", "revision": first, "path": "package.json", "destination": "package.json", "sha256": docs.digest(old)}
        self.config["imports"] = [item]
        self.save()
        mapping = {"x/y": upstream}
        docs.run(self.root, True, mapping)
        original_projection = (self.root / "docs/SOURCES.md").read_bytes()
        for content in (b'{"dependencies":{"eve":"2.0.0"}}', b'{'):
            (upstream / "package.json").write_bytes(content)
            git("commit", "-am", "update manifest")
            item.update(revision=git("rev-parse", "HEAD"), sha256=docs.digest(content))
            self.save()
            before = (self.root / "package.json").read_bytes()
            projection = (self.root / "docs/SOURCES.md").read_bytes()
            if content == b'{':
                with self.assertRaises(ValueError): docs.run(self.root, True, mapping)
                self.assertEqual((self.root / "package.json").read_bytes(), before)
                self.assertEqual((self.root / "docs/SOURCES.md").read_bytes(), projection)
            else:
                self.assertEqual(docs.run(self.root, True, mapping), [])
                self.assertEqual(docs.run(self.root), [])
                self.assertIn('"eve": "2.0.0"', (self.root / "docs/SOURCES.md").read_text())
        item.update(revision=first, sha256=docs.digest(old))
        self.save()
        self.assertEqual(docs.run(self.root, True, mapping), [])
        self.assertEqual(docs.run(self.root), [])
        self.assertEqual((self.root / "docs/SOURCES.md").read_bytes(), original_projection)

    def test_cli_entrypoint_and_non_json_source_are_measured(self):
        self.config["sources"].append({"path": "README.md", "purpose": "Local guidance"})
        self.save()
        argv = [str(Path(docs.__file__)), "--root", str(self.root)]
        with patch("sys.argv", argv):
            self.assertEqual(docs.main(), 1)
        with patch("sys.argv", argv + ["--write"]):
            self.assertEqual(docs.main(), 0)
        with patch("sys.argv", argv):
            with self.assertRaises(SystemExit) as result:
                runpy.run_path(docs.__file__, run_name="__main__")
            self.assertEqual(result.exception.code, 0)
        with patch("sys.argv", argv + ["--upstream", "malformed"]):
            with self.assertRaises(SystemExit) as result:
                docs.main()
            self.assertEqual(result.exception.code, 1)

    def test_cli_success_drift_and_malformed_config(self):
        script = str(Path(docs.__file__))
        def cli(*args):
            return subprocess.run(["python3", script, "--root", str(self.root), *args], capture_output=True)
        self.assertEqual(cli().returncode, 1)
        self.assertEqual(cli("--write").returncode, 0)
        self.assertEqual(cli().returncode, 0)
        (self.root / "repository-docs.json").write_text("{")
        self.assertEqual(cli().returncode, 1)


if __name__ == "__main__":
    unittest.main()
