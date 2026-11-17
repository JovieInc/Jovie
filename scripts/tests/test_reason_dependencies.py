"""Manifest-bound reasoning dependencies; local Git/files and no provider access."""
from __future__ import annotations

import contextlib
import hashlib
import importlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
dependencies = importlib.import_module("reason_dependencies")
lifecycle = importlib.import_module("lifecycle")
lane = importlib.import_module("lane_runner")
CLI = "scripts/hyperagent/hyperagent.py"
MODELS = "scripts/hyperagent/models.json"
SUPPORT = ["scripts/apiclient", "packages/api-client/providers.json"]
MANAGED = [*SUPPORT, CLI, MODELS]
PROBE = ["hyperagent", "models", "--role", "research", "--json"]


class ReasonDependencyTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="reason-dependency-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.repo = self.root / "repo"
        self.state = self.root / "state"
        (self.repo / "scripts/lanes").mkdir(parents=True)
        self.state.mkdir(mode=0o700)
        (self.repo / "scripts/lanes/lane_runner.py").write_text("# fixture release source\n")
        shutil.copytree(ROOT / "scripts/apiclient", self.repo / "scripts/apiclient",
                        ignore=shutil.ignore_patterns("__pycache__"))
        for relative in (CLI, MODELS, SUPPORT[1]):
            target = self.repo / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / relative, target)
        self.env = {"PATH": os.defpath, "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull,
                    "GIT_AUTHOR_DATE": "2026-11-17T00:00:00Z", "GIT_COMMITTER_DATE": "2026-11-17T00:00:00Z"}
        environment = patch.dict(os.environ, self.env, clear=True)
        environment.start()
        self.addCleanup(environment.stop)
        self.git("init", "-q")
        self.commit()
        self.host = lane.Host(repo=self.repo, state=self.state)
        real_run_path = dependencies.runpy.run_path
        def verified_archive(path, *args, **kwargs):
            self.assertEqual(Path(path).read_bytes(), (ROOT / CLI).read_bytes(), "coverage alias requires exact CLI bytes")
            return real_run_path(path, *args, **kwargs)
        archive_import = patch.object(dependencies, "runpy", SimpleNamespace(run_path=verified_archive))
        archive_import.start()
        self.addCleanup(archive_import.stop)

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.repo, env=self.env, check=True,
                              capture_output=True, text=True).stdout.strip()

    def commit(self):
        self.git("add", "-A")
        self.git("-c", "user.name=fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "fixture")
        self.git("update-ref", "refs/remotes/origin/main", "HEAD")

    def manifest(self, extras=MANAGED):
        with patch.object(lane, "RELEASE_EXTRAS", extras), patch.object(lane, "LANE_TESTS", []):
            return lane.release_identity(self.host)

    def metadata(self, root, manifest):
        here = root / "scripts/lanes"
        (here / ".release.json").write_text(json.dumps(manifest))
        (here / ".bundle").write_text(manifest["bundleDigest"])
        (here / ".tree").write_text(manifest["objects"]["scripts/lanes"])

    def archive(self, manifest):
        release = self.state / "releases" / manifest["bundleDigest"]
        release.mkdir(parents=True)
        raw = subprocess.run(["git", "archive", manifest["sourceCommit"], *manifest["objects"]],
                             cwd=self.repo, env=self.env, check=True, capture_output=True).stdout
        with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
            archive.extractall(release, filter="data")
        self.metadata(release, manifest)
        return release

    def binding(self, release, argv=PROBE, env=None):
        with patch.object(dependencies, "HERE", release / "scripts/lanes"):
            return dependencies.qualify(argv, env=env)

    def reason_fixture(self):
        fixture = sys.modules.get("test_reason_lane") or sys.modules.get("scripts.tests.test_reason_lane")
        fixture = fixture or importlib.import_module("scripts.tests.test_reason_lane")
        sys.modules.setdefault("test_reason_lane", fixture)
        sys.modules.setdefault("scripts.tests.test_reason_lane", fixture)
        return fixture

    def assert_held(self, release, env=None):
        runner = Mock(side_effect=AssertionError("unqualified dependency reached execution"))
        with patch.object(dependencies, "HERE", release / "scripts/lanes"):
            with self.assertRaises(dependencies.DependencyUnavailable) as held:
                dependencies.invoke(PROBE, runner=runner, env=env)
        runner.assert_not_called()
        self.assertEqual(held.exception.receipt["owner"], "reason-lane")
        self.assertTrue(held.exception.receipt["nextAction"])
        return held.exception

    def test_absent_unlisted_corrupt_or_symlinked_dependencies_never_execute(self):
        manifest = self.manifest()
        for problem in ("manifest", "unlisted", "missing-cli", "missing-models", "cli", "models", "symlink", "ancestor"):
            with self.subTest(problem=problem):
                release = self.archive(manifest)
                cli = release / CLI
                if problem == "manifest":
                    (release / "scripts/lanes/.release.json").unlink()
                elif problem == "unlisted":
                    old = self.manifest(SUPPORT)
                    self.metadata(release, old)
                elif problem.startswith("missing-"):
                    (release / (CLI if problem == "missing-cli" else MODELS)).unlink()
                elif problem in ("cli", "models"):
                    path = cli if problem == "cli" else release / MODELS
                    path.write_bytes(path.read_bytes() + b"\n# corrupted\n")
                elif problem == "symlink":
                    cli.unlink()
                    cli.symlink_to(self.repo / CLI)
                else:
                    shutil.move(release / "scripts/hyperagent", release / "other")
                    (release / "scripts/hyperagent").symlink_to(release / "other", target_is_directory=True)
                self.assert_held(release)
                shutil.rmtree(release)

    def test_real_accepted_command_ignores_path_and_preserves_all_original_arguments(self):
        manifest = self.manifest()
        release = self.archive(manifest)
        poison = self.root / "bin"
        poison.mkdir()
        (poison / "hyperagent").write_text("#!/bin/sh\nexit 99\n")
        (poison / "hyperagent").chmod(0o755)
        argv = ["hyperagent", "execute", "--role", "research", "--model", "grok-4.7", "-p", "fixture"]
        with patch.dict(os.environ, PATH=str(poison)):
            binding = self.binding(release, argv)
        self.assertEqual(binding.argv, [sys.executable, str(release / CLI), *argv[1:]])
        evidence = json.dumps(binding.provenance)
        for value in (manifest["sourceCommit"], manifest["bundleDigest"], manifest["objects"][CLI],
                      manifest["objects"][MODELS], hashlib.sha256((release / MODELS).read_bytes()).hexdigest()):
            self.assertIn(value, evidence)
        with patch.object(dependencies, "HERE", release / "scripts/lanes"):
            binding.verify()
        self.assertIsNone(self.binding(release, ["gbrain", "get", "fixture"]))
        direct = Mock(return_value="unchanged")
        self.assertEqual(dependencies.invoke(["gbrain", "get", "fixture"], runner=direct), "unchanged")
        direct.assert_called_once_with(["gbrain", "get", "fixture"])
        with self.assertRaisesRegex(OSError, "unrelated transport"):
            dependencies.invoke(["gbrain", "get", "fixture"], runner=Mock(side_effect=OSError("unrelated transport")))

    def test_external_mapping_is_consumed_exactly_and_credential_overrides_are_opaque(self):
        release = self.archive(self.manifest())
        external = self.root / "external-models.json"
        external.write_bytes((release / MODELS).read_bytes())
        env = {**self.env, "HYPERAGENT_MODELS_FILE": str(external),
               "HYPERAGENT_MCP_TOKEN": "fixture-placeholder", "HYPERAGENT_CONFIG_DIR": str(self.root / "config")}
        before = dict(env)
        snapshots = []

        def runner(argv, **kwargs):
            selected = Path(kwargs["env"]["HYPERAGENT_MODELS_FILE"])
            self.assertNotEqual(selected, external)
            snapshots.append(selected.read_bytes())
            self.assertFalse(selected.stat().st_mode & 0o222)
            self.assertEqual(kwargs["env"]["HYPERAGENT_MCP_TOKEN"], "fixture-placeholder")
            return SimpleNamespace(returncode=0, stdout="fixture", stderr="")

        with patch.object(dependencies, "HERE", release / "scripts/lanes"):
            with dependencies.capture() as captured:
                result = dependencies.invoke(PROBE, runner=runner, env=env)
                other = {key: value for key, value in env.items() if key != "HYPERAGENT_MCP_TOKEN"}
                other["HYPERAGENT_CONFIG_DIR"] = str(self.root / "other-profile")
                dependencies.invoke(PROBE, runner=Mock(return_value=result), env=other)
        self.assertEqual((result.stdout, snapshots, env), ("fixture", [external.read_bytes()], before))
        evidence = captured.provenance()
        self.assertEqual(evidence["status"], "qualified")
        invocation = evidence["invocations"][0]
        self.assertEqual(invocation["mapping"]["kind"], "external")
        self.assertEqual(invocation["mapping"]["sha256"], hashlib.sha256(external.read_bytes()).hexdigest())
        self.assertIn("HYPERAGENT_MCP_TOKEN", invocation["externalInputs"]["declaredOverrides"])
        self.assertEqual(len(evidence["invocations"]), 2)
        self.assertNotEqual(invocation["externalInputs"], evidence["invocations"][1]["externalInputs"])
        self.assertNotIn("fixture-placeholder", json.dumps(evidence))

    def test_changed_operative_mapping_preserves_produced_bytes_but_blocks_capture(self):
        release = self.archive(self.manifest())
        external = self.root / "operative.json"
        external.write_bytes((release / MODELS).read_bytes())
        env = {**self.env, "HYPERAGENT_MODELS_FILE": str(external)}
        binding = self.binding(release, env=env)
        external.write_bytes(external.read_bytes() + b"\n")
        with patch.object(dependencies, "HERE", release / "scripts/lanes"):
            with self.assertRaises(dependencies.DependencyUnavailable) as changed:
                binding.verify()
        self.assertEqual(changed.exception.receipt["reason"], "reason-model-mapping-changed")

        def produced(argv, **kwargs):
            external.write_bytes(external.read_bytes() + b" ")
            return SimpleNamespace(returncode=0, stdout='{"ok":true,"text":"durable fixture memo"}', stderr="")

        with patch.object(dependencies, "HERE", release / "scripts/lanes"):
            with dependencies.capture() as captured:
                result = dependencies.invoke(PROBE, runner=produced, env=env)
        self.assertIn("durable fixture memo", result.stdout)
        evidence = captured.provenance()
        self.assertEqual(evidence["status"], "blocked")
        self.assertEqual(evidence["blocked"]["owner"], "reason-lane")
        self.assertTrue(evidence["blocked"]["nextAction"])

    def test_missing_manifest_holds_tick_and_drain_before_queue_claim_or_budget(self):
        reason = self.reason_fixture().reason
        release = self.archive(self.manifest())
        (release / "scripts/lanes/.release.json").unlink()
        config = json.loads((ROOT / "scripts/lanes/reason.json").read_text())
        forbidden = Mock(side_effect=AssertionError("dependency hold crossed admission"))
        native = SimpleNamespace(Locked=lane.Locked, Linear=forbidden, LinearRateLimited=lane.LinearRateLimited)
        with patch.object(dependencies, "HERE", release / "scripts/lanes"), \
                patch.object(reason, "queued_jobs", forbidden), patch.object(reason, "one_job", forbidden), \
                patch.object(reason, "spend_budget", forbidden), patch.object(reason, "budget_allows", forbidden):
            tick = reason.tick(self.host, native, forbidden, config, spawn=forbidden)
            drain = reason.drain(self.host, native, config, run=forbidden)
        forbidden.assert_not_called()
        for result in (tick, drain):
            self.assertEqual((result["status"], result["owner"]), ("blocked", "reason-lane"))
            self.assertTrue(result["nextAction"])
        (self.state / "reason-results").mkdir()
        with patch.object(dependencies, "HERE", release / "scripts/lanes"), \
                patch.object(reason._reason_dispatch, "tick", return_value={"status": "recovery-scheduled"}) as recover:
            self.assertEqual(reason.tick(self.host, native, forbidden, config), {"status": "recovery-scheduled"})
        recover.assert_called_once()  # Retained output may reach the drain while fresh work stays held.
        path = self.state / "reason-dependencies.json"
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(json.loads(path.read_text())["status"], "blocked")
        self.metadata(release, self.manifest())
        with patch.object(dependencies, "HERE", release / "scripts/lanes"):
            self.assertIsNone(dependencies.readiness(config, self.state))
        self.assertEqual(json.loads(path.read_text())["status"], "qualified-local")

    def test_direct_operator_run_does_not_acquire_a_lease_for_unqualified_dependencies(self):
        reason = self.reason_fixture().reason
        active_lane = importlib.import_module("lane_runner")
        config = json.loads((ROOT / "scripts/lanes/reason.json").read_text())
        issue = {"id": "fixture-issue", "identifier": "JOV-42", "title": "fixture", "description": ""}
        linear = Mock()
        linear.gql.return_value = {"issues": {"nodes": [issue]}}
        owner = Mock(side_effect=AssertionError("unqualified operator request took ownership"))
        with patch.object(active_lane, "Host", return_value=self.host), patch.object(active_lane, "load_github_env"), \
                patch.object(active_lane, "Linear", return_value=linear), patch.object(reason, "load_config", return_value=config), \
                patch.object(reason, "_ownership", owner), patch.object(dependencies, "HERE", self.repo / "scripts/lanes"), \
                contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(reason.guarded_main(["run", "JOV-42"]), 75)
        owner.assert_not_called()
        linear.move.assert_not_called()
        self.assertEqual(linear.gql.call_count, 1, "only the authoritative issue lookup is allowed")
        self.assertEqual(json.loads(out.getvalue())["status"], "blocked")

    def test_post_execution_manifest_failure_is_captured_without_discarding_output(self):
        release = self.archive(self.manifest())

        def returned(argv, **kwargs):
            (release / "scripts/lanes/.release.json").write_text("[]")
            return SimpleNamespace(returncode=0, stdout="produced fixture output", stderr="")

        with patch.object(dependencies, "HERE", release / "scripts/lanes"):
            with dependencies.capture(self.state) as observed:
                result = dependencies.invoke(PROBE, runner=returned)
        self.assertEqual(result.stdout, "produced fixture output")
        self.assertEqual(observed.provenance()["status"], "blocked")
        self.assertEqual(json.loads((self.state / "reason-dependencies.json").read_text())["status"], "blocked")

    def test_snapshot_cleanup_failure_preserves_already_returned_output(self):
        release = self.archive(self.manifest())
        original, calls = dependencies.Binding.snapshot, []

        @contextlib.contextmanager
        def cleanup_failure(binding):
            calls.append(None)
            with original(binding) as path:
                yield path
            if len(calls) == 2:
                raise OSError("fixture cleanup unavailable after production")

        with patch.object(dependencies, "HERE", release / "scripts/lanes"), \
                patch.object(dependencies.Binding, "snapshot", cleanup_failure), dependencies.capture() as captured:
            result = dependencies.invoke(PROBE, runner=Mock(return_value=SimpleNamespace(stdout="retained memo")))
        self.assertEqual(result.stdout, "retained memo")
        self.assertEqual(captured.provenance()["blocked"]["reason"], "reason-bound-command-io-unavailable")
        calls.clear()
        with patch.object(dependencies, "HERE", release / "scripts/lanes"), \
                patch.object(dependencies.Binding, "snapshot", cleanup_failure):
            with self.assertRaises(dependencies.DependencyUnavailable):
                dependencies.invoke(PROBE, runner=Mock(return_value=result))

    def test_invalid_optional_reviewer_profile_does_not_hold_valid_research(self):
        release = self.archive(self.manifest())
        fixture, reason = self.reason_fixture(), self.reason_fixture().reason
        active_lane = importlib.import_module("lane_runner")
        self.assertIs(reason._dependencies, dependencies)
        config = json.loads((ROOT / "scripts/lanes/reason.json").read_text())
        profile = self.root / "optional.env"
        profile.write_text(f"HYPERAGENT_MODELS_FILE={self.root / 'unavailable.json'}\n")
        config["reviewers"][1]["env"] = str(profile)
        block = {**fixture.JOB_BLOCK, "decisionType": "research", "question": "Summarize interface observations",
                 "contextRefs": [], "deadline": None}
        issue = {"id": "fixture-research", "identifier": "JOV-42", "title": "Interface observations",
                 "description": fixture.description(block), "createdAt": "2026-11-17T00:00:00Z"}
        linear, store, executed = fixture.FakeLinear(jobs=[issue]), fixture.StoringGbrain(), []
        native = SimpleNamespace(Locked=active_lane.Locked, Linear=lambda _: linear, LinearRateLimited=active_lane.LinearRateLimited)

        def run(argv, **kwargs):
            if argv[:2] == [sys.executable, str(release / CLI)]:
                if argv[2] == "models":
                    return fixture.done('{"models":[]}')
                self.assertEqual(argv[2], "execute")
                executed.append(argv)
                return fixture.done(json.dumps({"ok": True, "text": "Complete research fixture memo."}))
            self.assertEqual(argv[0], "gbrain")
            return store(argv, kwargs)

        with patch.object(dependencies, "HERE", release / "scripts/lanes"), \
                patch.object(active_lane, "SHARED_CACHE_DIR", self.root / "cache"), \
                patch.object(reason, "catalog_command", side_effect=lambda slug: ["gbrain", "get", slug]):
            with dependencies.capture() as observed:
                self.assertFalse(reason.healthy(config["reviewers"][1], run=run))
                self.assertFalse(observed.blocked, "optional probe cannot taint produced result provenance")
            result = reason.drain(self.host, native, config, run=run)
        self.assertEqual(result, {"status": "idle", "done": [{"job": "JOV-42", "confidence": "research"}]})
        self.assertEqual(len(executed), 1)
        saved = json.loads(reason.publication_path(self.state, issue).read_text())
        self.assertEqual(saved["outcome"]["record"]["provenance"]["backend"]["status"], "qualified")

    def produced_memo(self, release, *, change_mapping=False, fail_publication=False):
        fixture = self.reason_fixture()
        reason = fixture.reason
        block = {**fixture.JOB_BLOCK, "question": "Summarize interface observations", "decisionType": "research",
                 "contextRefs": [], "deadline": None}
        issue = {"id": "fixture-memo", "identifier": "JOV-42", "title": "Interface observations",
                 "description": fixture.description(block), "createdAt": "2026-11-17T00:00:00Z"}
        config = json.loads((ROOT / "scripts/lanes/reason.json").read_text())
        linear, store = fixture.FakeLinear(jobs=[issue]), fixture.StoringGbrain()
        model_calls, memo = [], "# Interface observations\n\nA complete independently retained fixture memo."
        external = self.root / "operative-models.json"
        external.write_bytes((release / MODELS).read_bytes())

        def run(argv, **kwargs):
            if len(argv) > 2 and argv[:2] == [sys.executable, str(release / CLI)]:
                self.assertEqual(argv[2], "execute")
                model_calls.append(list(argv))
                if change_mapping:
                    external.write_bytes(external.read_bytes() + b"\n")
                return fixture.done(json.dumps({"ok": True, "text": memo}))
            self.assertEqual(argv[0], "gbrain", "fixture cannot execute another transport")
            if fail_publication and argv[1] == "put":
                return fixture.done("", 1)
            return store(argv, kwargs)

        with patch.object(dependencies, "HERE", release / "scripts/lanes"), \
                patch.dict(os.environ, HYPERAGENT_MODELS_FILE=str(external)), \
                patch.object(reason, "catalog_command", side_effect=lambda slug: ["gbrain", "get", slug]), \
                patch.object(reason, "now_iso", return_value="2026-11-17T00:00:00Z"):
            result = reason.one_job(linear, issue, config, self.state, run=run)
        path = reason.publication_path(self.state, issue)
        return fixture, linear, issue, config, result, json.loads(path.read_text()), model_calls, store, memo

    def test_changed_control_seals_and_holds_full_produced_memo_without_model_retry(self):
        release = self.archive(self.manifest())
        fixture, linear, issue, config, result, saved, calls, _, memo = self.produced_memo(release, change_mapping=True)
        self.assertEqual((len(calls), result["publication"]["status"]), (1, "blocked"))
        self.assertEqual(saved["outcome"]["research"], memo)
        self.assertIn(memo, saved["memoBody"])
        self.assertEqual(saved["outcome"]["record"]["provenance"]["backend"]["status"], "blocked")
        self.assertNotIn((issue["id"], "Done"), linear.moves)
        with patch.object(dependencies, "qualify", side_effect=AssertionError("sealed retry touched the backend")):
            again = fixture.reason.one_job(linear, issue, config, self.state,
                                            run=Mock(side_effect=AssertionError("held output attempted transport")))
        self.assertEqual(again["publication"]["status"], "blocked")
        self.assertEqual(fixture.reason.failure_count(self.state, issue["identifier"]), 0)

    def test_saved_result_reuses_original_backend_provenance_under_a_new_accepted_generation(self):
        release = self.archive(self.manifest())
        fixture, linear, issue, config, result, saved, calls, store, _ = self.produced_memo(release, fail_publication=True)
        original = saved["outcome"]["record"]["provenance"]["backend"]
        self.assertEqual((len(calls), result["publication"]["status"], original["status"]), (1, "blocked", "qualified"))
        models = self.repo / MODELS
        models.write_bytes(models.read_bytes() + b"\n")
        self.commit()
        newer = self.archive(self.manifest())
        self.assertNotEqual(self.binding(newer).provenance["bundleDigest"], original["invocations"][0]["bundleDigest"])
        self.assertEqual(self.binding(newer).provenance["objects"][CLI], original["invocations"][0]["objects"][CLI])
        self.assertNotEqual(self.binding(newer).provenance["objects"][MODELS], original["invocations"][0]["objects"][MODELS])

        def publication_only(argv, **kwargs):
            self.assertEqual(argv[0], "gbrain", "saved recovery cannot run the backend")
            return store(argv, kwargs)

        with patch.object(dependencies, "HERE", newer / "scripts/lanes"), \
                patch.object(dependencies, "qualify", side_effect=AssertionError("saved result requalified backend")):
            recovered = fixture.reason.one_job(linear, issue, config, self.state, run=publication_only)
        after = json.loads(fixture.reason.publication_path(self.state, issue).read_text())
        self.assertEqual(recovered["publication"]["status"], "published")
        self.assertEqual(recovered["provenance"]["backend"], original)
        sealed_fields = (*importlib.import_module("reason_publication").PUBLICATION_FIELDS, "payloadDigest")
        self.assertEqual({key: after[key] for key in sealed_fields}, {key: saved[key] for key in sealed_fields})

    def offline_models(self, release):
        driver = r'''
import builtins, contextlib, io, json, pathlib, runpy, sys
from unittest.mock import patch
root = pathlib.Path(sys.argv[1])
api = runpy.run_path(str(root / "scripts/hyperagent/hyperagent.py"))
glob = api["main"].__globals__
def forbidden(*args, **kwargs):
    raise AssertionError("models probe crossed credential/provider boundary")
for name in ("access_token", "token_bundle", "_client", "mcp_call", "execute", "cmd_login"):
    if name in glob:
        glob[name] = forbidden
real_open = builtins.open
def guarded(path, *args, **kwargs):
    if "oauth" in str(path).lower() or "fixture-credentials" in str(path):
        forbidden()
    return real_open(path, *args, **kwargs)
out = io.StringIO()
with patch.object(glob["ApiClient"], "request", side_effect=forbidden), \
        patch("builtins.open", side_effect=guarded), patch("io.open", side_effect=guarded), \
        contextlib.redirect_stdout(out):
    assert api["main"](["models", "--role", "research", "--json"]) == 0
models = json.loads(out.getvalue())["models"]
assert "fable-5.1" in models and "grok-4.7" in models
print(json.dumps({"models": sorted(models), "boundaryCalls": 0}))
'''
        env = {**self.env, "HYPERAGENT_CONFIG_DIR": str(self.root / "fixture-credentials"),
               "PYTHONDONTWRITEBYTECODE": "1"}
        result = subprocess.run([sys.executable, "-B", "-c", driver, str(release)], cwd=self.root,
                                env=env, capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["boundaryCalls"], 0)

    def test_old_updater_fills_physical_files_but_only_the_next_manifest_can_bind_them(self):
        real_run = subprocess.run
        proofs, unchanged_revision = [], self.git("rev-parse", "HEAD")

        def transport(argv, **kwargs):
            if len(argv) > 2 and argv[2] == "prove-staging":
                staging = Path(argv[3])
                with patch.object(lane, "RELEASE_EXTRAS", MANAGED), patch.object(lane, "LANE_TESTS", []):
                    self.assertIsNone(lane.complete_staged_bundle(self.host, staging))
                    proposed = lane.release_identity(self.host)
                lifecycle.validate_sources(staging, proposed)
                self.offline_models(staging)
                proofs.append(proposed)
                return SimpleNamespace(returncode=0, stdout="", stderr="")
            return real_run(argv, **kwargs)

        with patch.object(lane, "LANE_TESTS", []), \
                patch.object(lane, "fetch_release_source", return_value=SimpleNamespace(returncode=0)), \
                patch.object(lane, "ensure_dependency_pool", return_value=False), \
                patch.object(lane, "gate_admission", side_effect=lambda *a, **k: contextlib.nullcontext([])), \
                patch.object(lane, "refresh_object_mirror", return_value={"status": "fixture"}), \
                patch.object(lane, "refresh_codex_skills", return_value={"status": "fixture"}), \
                patch.object(lane, "install_lag", return_value={"behindS": 0}), \
                patch.object(lane.update_drain, "finish"), patch.object(lifecycle, "HEARTBEAT", None), \
                patch.object(lane.lifecycle, "run", side_effect=transport):
            with patch.object(lane, "RELEASE_EXTRAS", SUPPORT):
                self.assertEqual(lane.update(self.host), 0)
            old = (self.state / "current").resolve().parent.parent
            self.assertTrue((old / CLI).is_file(), "staged completion actually supplied the CLI")
            old_manifest = json.loads((old / "scripts/lanes/.release.json").read_text())
            self.assertNotIn(CLI, old_manifest["objects"])
            self.assert_held(old)
            with patch.object(lane, "RELEASE_EXTRAS", MANAGED):
                self.assertEqual(lane.update(self.host), 0)
                self.assertEqual(lane.update(self.host), 0, "third ordinary pass is the real unchanged-bundle no-op")
        new = (self.state / "current").resolve().parent.parent
        self.assertNotEqual(old, new)
        self.assertEqual(self.git("rev-parse", "HEAD"), unchanged_revision)
        self.assertEqual(len(proofs), 2)
        self.assertEqual(old_manifest["sourceCommit"], proofs[-1]["sourceCommit"])
        self.assertEqual(old_manifest["objects"]["scripts/lanes"], proofs[-1]["objects"]["scripts/lanes"])
        self.assertTrue(json.loads((self.state / "update.json").read_text())["ok"])
        self.assertEqual(self.binding(new).provenance["bundleDigest"], proofs[-1]["bundleDigest"])
        self.offline_models(new)


if __name__ == "__main__":
    unittest.main()
