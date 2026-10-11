"""Operator lifecycle boundaries, using only private files and mocked proof jobs."""
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "lanes/lifecycle.py"


class OperatorLifecycleTest(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location("fixture_lifecycle", SOURCE)
        self.life = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.life)
        self.tmp = tempfile.TemporaryDirectory(prefix="lifecycle-operator-test-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.state = self.root / "state"
        self.state.mkdir()
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.check = lambda: None
        # Git's independent object implementation provides the fixture identity.
        subprocess.run(["git", "init", "-q", str(self.repo)], check=True)
        source = self.repo / "scripts/lanes"
        source.mkdir(parents=True)
        (source / "lane_runner.py").write_text("# fixture qualified source\n")
        (source / "executable").write_text("#!/bin/sh\nexit 0\n")
        (source / "executable").chmod(0o755)
        (self.repo / "proof-test.py").write_text("# fixture mandatory test\n")
        subprocess.run(["git", "-C", str(self.repo), "add", "."], check=True)
        tree = subprocess.run(["git", "-C", str(self.repo), "write-tree"], check=True,
                              capture_output=True, text=True).stdout.strip()
        objects = {name: subprocess.run(["git", "-C", str(self.repo), "rev-parse", tree + ":" + name],
                                       check=True, capture_output=True, text=True).stdout.strip()
                   for name in ["scripts/lanes", "proof-test.py"]}
        self.manifest = {"schema": "jovie-lane-release-bundle/v1", "sourceCommit": "a" * 40,
                         "objects": objects, "bundleDigest": hashlib.sha256(json.dumps(
                             objects, sort_keys=True, separators=(",", ":")).encode()).hexdigest()}
        self.stage = self.state / "releases" / ("." + self.manifest["bundleDigest"] + ".tmp")
        self.stage.mkdir(parents=True)
        import shutil
        shutil.copytree(self.repo / "scripts", self.stage / "scripts")
        shutil.copy2(self.repo / "proof-test.py", self.stage / "proof-test.py")
        self.environment = patch.dict(os.environ, {"PATH": os.defpath}, clear=True)
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def operator(self, **changes):
        args = {"owner": "fixture-owner", "operation_id": "fixture-op",
                "manifest": self.manifest, "admission_check": self.check}
        args.update(changes)
        return self.life.OperatorGuard(self.state, **args)

    def metadata(self):
        lanes = self.stage / "scripts/lanes"
        (lanes / ".release.json").write_text(json.dumps(self.manifest))
        (lanes / ".bundle").write_text(self.manifest["bundleDigest"])
        (lanes / ".tree").write_text(self.manifest["objects"]["scripts/lanes"])

    def test_natural_shared_writer_blocks_operator_without_unlocking_writer(self):
        with self.life.Guard(self.state):
            with self.assertRaises(self.life.AdmissionHeld):
                self.operator().__enter__()
        # A distinct admitted holder, not this module's nested-ownership guard.
        fd = os.open(self.state / "lifecycle.lock", os.O_RDWR)
        fcntl.flock(fd, fcntl.LOCK_SH | fcntl.LOCK_NB)
        try:
            with self.assertRaises(BlockingIOError):
                self.operator().__enter__()
            self.assertTrue(self.life.draining(self.state))
        finally:
            os.close(fd)
        with self.operator() as operator:
            operator.validate()

    def test_close_and_failure_keep_durable_owned_hold(self):
        with self.assertRaisesRegex(RuntimeError, "fixture failure"):
            with self.operator():
                raise RuntimeError("fixture failure")
        self.assertTrue(self.life.draining(self.state))
        with self.assertRaises(self.life.AdmissionHeld):
            self.life.Guard(self.state).__enter__()
        with self.operator() as operator:
            operator.validate()

    def test_foreign_changed_malformed_and_symlink_drain_refuse(self):
        marker = self.state / "lifecycle-drain.json"
        for data in [b"{}", b"{", b"foreign"]:
            marker.write_bytes(data)
            with self.assertRaises(self.life.AdmissionHeld):
                self.operator().__enter__()
            self.assertEqual(marker.read_bytes(), data)
        marker.unlink()
        marker.symlink_to(self.root / "outside")
        with self.assertRaises(OSError):
            self.operator().__enter__()
        self.assertTrue(marker.is_symlink())

    def test_inherited_or_unverified_admissions_refuse_before_creating_hold(self):
        for inherited in ["3", "bad"]:
            with patch.dict(os.environ, {self.life.FD_ENV: inherited}):
                with self.assertRaises(self.life.AdmissionHeld):
                    self.operator().__enter__()
        for result in [True, False, {}, "accepted"]:
            with self.assertRaises(self.life.AdmissionHeld):
                self.operator(admission_check=lambda: result).__enter__()
        def unknown():
            raise self.life.AdmissionHeld("unguarded route unknown")
        with self.assertRaisesRegex(self.life.AdmissionHeld, "unguarded route unknown"):
            self.operator(admission_check=unknown).__enter__()
        self.assertFalse(self.life.draining(self.state))

    def test_late_or_reversed_checks_and_in_check_mutation_refuse(self):
        for values in [[0, 31], [31, 0], [0, float("nan")], [0, True]]:
            with patch.object(self.life.time, "monotonic", side_effect=values):
                with self.assertRaises(self.life.AdmissionHeld):
                    self.operator().__enter__()
            self.assertFalse(self.life.draining(self.state))
        with self.operator() as operator:
            def changed():
                (self.state / "lifecycle-drain.json").write_text("foreign changed hold")
            operator.admission_check = changed
            with self.assertRaises(self.life.AdmissionHeld):
                operator.validate()
            self.assertEqual((self.state / "lifecycle-drain.json").read_text(), "foreign changed hold")

    def test_changed_inode_owner_mode_or_hold_refuse(self):
        with self.operator() as operator:
            path = self.state / "lifecycle.lock"
            path.rename(path.with_suffix(".old"))
            path.touch()
            with self.assertRaises(self.life.AdmissionHeld):
                operator.validate()
        path.unlink()
        with self.operator() as operator:
            path.chmod(0o644)
            with self.assertRaises(self.life.AdmissionHeld):
                operator.validate()
        with self.operator() as operator:
            (self.state / "lifecycle-drain.json").write_text("changed")
            with self.assertRaises(self.life.AdmissionHeld):
                operator.validate()

    def test_symlink_and_special_canonical_lock_refuse(self):
        path = self.state / "lifecycle.lock"
        path.symlink_to(self.root / "outside")
        with self.assertRaises(OSError):
            self.operator().__enter__()
        path.unlink()
        os.mkfifo(path)
        with self.assertRaises((self.life.AdmissionHeld, OSError)):
            self.operator().__enter__()

    def test_private_proof_is_real_shared_admission_under_continuous_EX(self):
        with self.operator() as operator:
            seen = []
            def proof(args, **kwargs):
                operator.validate()
                self.assertTrue(self.life.active())
                self.assertNotEqual(self.life._active.state, self.state)
                self.assertEqual(self.life._active.state, Path(kwargs["env"]["LANES_STATE"]))
                self.assertEqual(kwargs["env"]["LANES_REPO"], str(self.repo))
                self.assertNotIn(self.life.FD_ENV, kwargs["env"])
                self.assertEqual(kwargs["timeout"], 960)
                self.assertEqual(args[-2:], ["prove-staging", str(self.stage)])
                self.assertEqual(Path(kwargs["env"]["LANES_STATE"]).stat().st_mode & 0o777, 0o700)
                seen.append(args)
                return subprocess.CompletedProcess(args, 0, stdout="", stderr="")
            with patch.object(self.life, "run", side_effect=proof):
                self.assertEqual(operator.prove_staging(self.stage, self.repo, timeout=960).returncode, 0)
            self.assertEqual(len(seen), 1)
            operator.validate()
            with self.assertRaises(self.life.AdmissionHeld):
                self.life.Guard(self.state).__enter__()
        self.assertTrue(self.life.draining(self.state))

    def test_private_proof_target_really_acquires_private_Guard(self):
        program = ("import importlib.util,json,os\nfrom pathlib import Path\n"
                   f"spec=importlib.util.spec_from_file_location('private_lifecycle', {str(SOURCE)!r})\n"
                   "life=importlib.util.module_from_spec(spec);spec.loader.exec_module(life)\n"
                   "if life.FD_ENV in os.environ: raise RuntimeError('forged target inheritance')\n"
                   "with life.Guard(Path(os.environ['LANES_STATE'])):\n"
                   " print(json.dumps({'state':str(life._active.state),'owned':life.active()}))\n")
        (self.repo / "scripts/lanes/lane_runner.py").write_text(program)
        (self.stage / "scripts/lanes/lane_runner.py").write_text(program)
        subprocess.run(["git", "-C", str(self.repo), "add", "."], check=True)
        tree = subprocess.run(["git", "-C", str(self.repo), "write-tree"], check=True,
                              capture_output=True, text=True).stdout.strip()
        objects = {name: subprocess.run(["git", "-C", str(self.repo), "rev-parse", tree + ":" + name],
                                       check=True, capture_output=True, text=True).stdout.strip()
                   for name in self.manifest["objects"]}
        self.manifest = {**self.manifest, "objects": objects, "bundleDigest": hashlib.sha256(
            json.dumps(objects, sort_keys=True, separators=(",", ":")).encode()).hexdigest()}
        new_stage = self.stage.parent / ("." + self.manifest["bundleDigest"] + ".tmp")
        self.stage.rename(new_stage)
        self.stage = new_stage
        with self.operator() as operator:
            # The unchanged tracked-command wrapper has its own process-tree
            # tests. Exercise this new target state/descriptor boundary with a
            # real subprocess without requiring host-wide ps in this fixture.
            with patch.object(self.life, "run", side_effect=subprocess.run):
                result = operator.prove_staging(self.stage, self.repo, timeout=20)
            self.assertEqual(result.returncode, 0, result.stderr)
            target = json.loads(result.stdout)
            self.assertTrue(target["owned"])
            self.assertEqual(target["state"], str(self.stage / ".staging-proof-state"))
            operator.validate()

    def test_reused_symlink_wrong_or_mutated_proof_tree_refuses(self):
        with self.operator() as operator:
            scratch = self.stage / ".staging-proof-state"
            scratch.mkdir()
            with self.assertRaises(FileExistsError):
                operator.proof_env(self.stage, self.repo)
            scratch.rmdir()
            scratch.symlink_to(self.root / "outside")
            with self.assertRaises(FileExistsError):
                operator.proof_env(self.stage, self.repo)
            with self.assertRaises(self.life.AdmissionHeld):
                operator.proof_env(self.repo, self.repo)
            (self.stage / "scripts/lanes/lane_runner.py").write_text("changed")
            with self.assertRaises(self.life.AdmissionHeld):
                operator.proof_env(self.stage, self.repo)

    def test_proof_timeout_preserves_canonical_EX_and_private_state(self):
        with self.operator() as operator:
            with patch.object(self.life, "run", side_effect=subprocess.TimeoutExpired("fixture", 960)):
                with self.assertRaises(subprocess.TimeoutExpired):
                    operator.prove_staging(self.stage, self.repo, timeout=960)
            self.assertFalse(self.life.active())
            self.assertTrue(self.life.draining(self.state))
            self.assertTrue((self.stage / ".staging-proof-state/lifecycle.lock").is_file())
            operator.validate()

    def test_full_manifest_readback_rejects_missing_changed_or_extra_source(self):
        self.metadata()
        self.assertEqual(self.life.validate_release(self.stage, self.manifest), self.manifest)
        source = self.stage / "scripts/lanes/lane_runner.py"
        original = source.read_bytes()
        for mutate in [lambda: source.write_text("changed"), lambda: source.unlink(),
                       lambda: source.chmod(0o755)]:
            mutate()
            with self.assertRaises((self.life.AdmissionHeld, OSError)):
                self.life.validate_release(self.stage, self.manifest)
            source.write_bytes(original)
            source.chmod(0o644)
        (source.parent / "extra.py").write_text("unexpected")
        with self.assertRaises(self.life.AdmissionHeld):
            self.life.validate_release(self.stage, self.manifest)

    def test_markers_alone_never_prove_full_source(self):
        self.metadata()
        (self.stage / "proof-test.py").write_text("wrong mandatory test")
        with self.assertRaises(self.life.AdmissionHeld):
            self.life.validate_release(self.stage, self.manifest)

    def test_generated_cache_and_mesh_do_not_change_source_identity(self):
        self.metadata()
        lanes = self.stage / "scripts/lanes"
        (lanes / "__pycache__").mkdir()
        (lanes / "__pycache__/fixture.pyc").write_bytes(b"generated")
        (lanes / ".mesh-runtime").mkdir()
        (lanes / ".mesh-runtime/generated.mjs").write_text("compiled output")
        self.life.validate_release(self.stage, self.manifest)

    def test_source_symlink_and_fifo_fail_closed(self):
        source = self.stage / "scripts/lanes/lane_runner.py"
        source.unlink()
        source.symlink_to(self.repo / "scripts/lanes/lane_runner.py")
        with self.assertRaises(self.life.AdmissionHeld):
            self.life.validate_sources(self.stage, self.manifest)
        source.unlink()
        os.mkfifo(source)
        with self.assertRaises(self.life.AdmissionHeld):
            self.life.validate_sources(self.stage, self.manifest)

    def test_manifest_digest_source_and_path_shapes_refuse(self):
        for key, value in [("sourceCommit", "bad"), ("bundleDigest", "0" * 64),
                           ("objects", {"../outside": "a" * 40})]:
            bad = {**self.manifest, key: value}
            with self.assertRaises(self.life.AdmissionHeld):
                self.operator(manifest=bad)

    def test_resume_requires_fresh_full_source_and_cross_host_acceptance(self):
        self.metadata()
        installed = self.stage.parent / self.manifest["bundleDigest"]
        self.stage.rename(installed)
        self.stage = installed
        (self.state / "current").symlink_to(installed / "scripts/lanes")
        with self.operator() as operator:
            def refuse():
                raise self.life.AdmissionHeld("other participant not accepted")
            with self.assertRaises(self.life.AdmissionHeld):
                operator.resume(self.stage, acceptance_check=refuse)
            self.assertTrue(self.life.draining(self.state))
            with self.assertRaises(self.life.AdmissionHeld):
                operator.resume(self.stage, acceptance_check=lambda: True)
            operator.resume(self.stage, acceptance_check=lambda: None)
            self.assertFalse(self.life.draining(self.state))
        with self.life.Guard(self.state):
            pass

    def test_resume_refuses_missing_current_staged_only_or_changed_current(self):
        self.metadata()
        with self.operator() as operator:
            with self.assertRaises(self.life.AdmissionHeld):
                operator.resume(self.stage, acceptance_check=lambda: None)
            installed = self.stage.parent / self.manifest["bundleDigest"]
            self.stage.rename(installed)
            with self.assertRaises(self.life.AdmissionHeld):
                operator.resume(installed, acceptance_check=lambda: None)
            current = self.state / "current"
            current.symlink_to(installed / "scripts/lanes")
            def change_current():
                current.unlink()
                current.symlink_to(self.repo / "scripts/lanes")
            with self.assertRaises(self.life.AdmissionHeld):
                operator.resume(installed, acceptance_check=change_current)
            self.assertTrue(self.life.draining(self.state))
            self.assertEqual(current.resolve(), self.repo / "scripts/lanes")


if __name__ == "__main__":
    unittest.main()
