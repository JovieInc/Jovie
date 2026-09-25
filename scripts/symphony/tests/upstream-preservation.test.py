#!/usr/bin/env python3
"""Approved fixture identity, native /proc ownership and actual workflow refusal."""
import copy
from datetime import datetime, timedelta, timezone
import importlib.util
import io
import json
import lzma
import os
from pathlib import Path
import sys
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts/symphony"))
import emit_gem_service_attestation as E
import symphony_official_runtime as H


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


A = load("ownership_fixture", "activation-ownership.test.py")
H = A.H
P = load("payload_fixture", "upstream-burrito-payload.test.py")


class UpstreamPreservationTests(unittest.TestCase):
    def setUp(self):
        self.a = A.ActivationOwnershipTests()
        self.a.setUp()
        self.addCleanup(self.a.doCleanups)
        self.package = self.a.home / "upstream-package"
        self.extracted = self.a.home / "extracted"
        self.exe = self.extracted / "erts/bin/beam.smp"
        self.exe.parent.mkdir(parents=True)
        self.exe.write_bytes(b"fixture BEAM"); self.exe.chmod(0o755)
        self.package.write_bytes(b"wrapper" + lzma.compress(P.archive([
            ("erts/bin/beam.smp", self.exe.read_bytes(), 0o100755)])))
        self.workflow = self.a.home / "WORKFLOW.md"
        self.workflow.write_text("---\ntracker:\n  project_slug: fixture\n---\nfixture prompt\n")
        self.release = {**E.UPSTREAM_RELEASE, "packageSha256": E.digest(self.package.read_bytes())}
        self.args = [str(self.package), "--port", "4041", str(self.workflow)]
        self.a.fields.update(ActiveState="active", SubState="running", MainPID="123",
                             InvocationID="a" * 32, ControlGroup="/user.slice/symphony-elixir.service")
        self.a.properties["ExecStartEx"]["data"][0][:3] = [str(self.package), self.args, []]
        override = self.a.dropins / "zz-upstream-cutover.conf"
        override.write_text("[Service]\nExecStart=\nExecStart=" + " ".join(self.args) + "\n")
        self.a.fields["DropInPaths"] = str(override)
        self.binding = {"schema": "symphony-upstream-preservation-binding/v1", "purpose": "preservation-only",
            "service": E.SERVICE, "release": self.release, "configurationApproved": True,
            "unitPath": str(self.a.unit), "dropInDirectory": str(self.a.dropins),
            "unitSha256": E.digest(self.a.unit.read_bytes()), "dropIns": {override.name: E.digest(override.read_bytes())},
            "effectiveConfigurationSha256": E.upstream_effective_digest(self.effective()),
            "packagePath": str(self.package), "extractedRoot": str(self.extracted), "executablePath": str(self.exe),
            "workflowPath": str(self.workflow), "workflowSha256": E.digest(self.workflow.read_bytes())}
        self.binding_path = self.a.home / "approved-binding.json"
        self.state_at = datetime.now(timezone.utc).isoformat()
        for pid, parent in ((123, 1), (456, 123)):
            proc = self.a.proc / str(pid)
            (proc / "fd").mkdir(parents=True); (proc / "net").mkdir()
            (proc / "stat").write_text(f"{pid} (beam) " + " ".join(["S", str(parent)] + ["0"] * 17 + [str(pid * 100)]))
            (proc / "cgroup").write_text("0::" + self.a.fields["ControlGroup"] + "\n")
            (proc / "cmdline").write_bytes((str(self.exe) + "\0" + str(self.workflow) + "\0").encode())
            (proc / "exe").symlink_to(self.exe)
            for name in ("tcp", "tcp6"): (proc / "net" / name).write_text("header\n")
        (self.a.proc / "456/fd/3").symlink_to("socket:[567]")
        (self.a.proc / "456/net/tcp").write_text("header\n0: 0100007F:0FC9 00000000:0000 0A 0 0 0 0 0 567\n")

    def effective(self):
        return {key: value["data"] for key, value in self.a.properties.items()}

    def save_binding(self):
        self.binding_path.write_text(json.dumps(self.binding))
        self.a.state.write_text(json.dumps({"fields": self.a.fields, "properties": self.a.properties}))
        return E.digest(self.binding_path.read_bytes())

    def observe(self, approved_digest=None):
        approved_digest = approved_digest or self.save_binding()
        with mock.patch.dict(E.UPSTREAM_RELEASE, self.release), mock.patch.object(E.trust, "PROC_ROOT", self.a.proc), \
             mock.patch.object(E.trust, "service_identity", return_value=(123, self.a.fields["ControlGroup"])), \
             mock.patch.object(H, "_activation_snapshot", side_effect=lambda: (copy.deepcopy(self.a.fields), self.effective())), \
             mock.patch.object(E.urllib.request, "urlopen", side_effect=lambda *a, **k: io.BytesIO(json.dumps({
                 "generated_at": self.state_at, "running": [], "retrying": [], "blocked": []}).encode())):
            return E.observe_upstream_preservation(self.binding_path, approved_digest, home=self.a.home, proc_root=self.a.proc)

    def test_approved_idle_identity_is_preserved_not_legacy_health_or_admission(self):
        before = {path: path.read_bytes() for path in (self.package, self.exe, self.a.unit, self.workflow)}
        result = self.observe()
        self.assertEqual(result["mode"], "upstream-preserved")
        self.assertEqual(result["activation"], "not-activated")
        self.assertEqual(result["admission"], "unverified")
        self.assertNotIn("healthy", result)
        self.assertNotEqual(result["schema"], "gem-service-attestation/v1")
        self.assertEqual(result["processEnvironment"], "unverified")
        self.assertEqual(before, {path: path.read_bytes() for path in before})
        self.assertFalse(self.a.events.exists())

    def test_cli_publishes_upstream_separately_without_legacy_health(self):
        approved = self.save_binding()
        observed = self.observe(approved)
        state = self.a.home / "state"
        state.mkdir()
        legacy = state / "gem-service-attestation.json"
        legacy.write_text('{"schema":"gem-service-attestation/v1","healthy":false}')
        args = ["emitter", "--upstream-binding", str(self.binding_path),
                "--upstream-binding-sha256", approved, "--gem-root", str(self.a.home)]
        with mock.patch.object(E, "observe_upstream_preservation", return_value=observed) as verify, \
             mock.patch.object(sys, "argv", args + ["--check"]), mock.patch("builtins.print"):
            self.assertEqual(E.main(), 0)
            verify.assert_called_once_with(self.binding_path, approved)
        self.assertFalse((state / "symphony-upstream-preservation.json").exists())
        destination = state / "symphony-upstream-preservation.json"
        atomic_replace = os.replace
        replacements = []

        def verify_atomic_publish(source, target):
            source = Path(source)
            target = Path(target)
            self.assertEqual(target, destination)
            self.assertEqual(source.parent, destination.parent)
            self.assertTrue(source.is_file())
            self.assertEqual(json.loads(source.read_text()), observed)
            self.assertFalse(json.loads(legacy.read_text())["healthy"])
            replacements.append((source, target))
            atomic_replace(source, target)

        with mock.patch.object(E, "observe_upstream_preservation", return_value=observed) as verify, \
             mock.patch.object(sys, "argv", args), mock.patch("builtins.print"), \
             mock.patch.object(E.os, "replace", side_effect=verify_atomic_publish):
            self.assertEqual(E.main(), 0)
            verify.assert_called_once_with(self.binding_path, approved)
        self.assertEqual(len(replacements), 1)
        self.assertFalse(list(state.glob(".service-attestation-*")))
        saved = json.loads(destination.read_text())
        self.assertEqual(saved, observed)
        self.assertNotIn("healthy", saved)
        self.assertFalse(json.loads(legacy.read_text())["healthy"])
        with mock.patch.object(sys, "argv", args + ["--provenance", str(self.package)]), \
             mock.patch("builtins.print"), \
             mock.patch.object(E, "observe_upstream_preservation") as verify:
            self.assertEqual(E.main(), 78)
            verify.assert_not_called()
        with mock.patch.object(sys, "argv", args + ["--check"]), \
             mock.patch("builtins.print"), \
             mock.patch.object(E, "observe_upstream_preservation", side_effect=ValueError("changed binding")):
            self.assertEqual(E.main(), 78)
        self.assertEqual(json.loads((state / "symphony-upstream-preservation.json").read_text()), observed)
        with mock.patch.object(sys, "argv", ["emitter", "--source-revision", "a" * 40]), \
             mock.patch("builtins.print"), mock.patch.object(E, "observe") as legacy:
            self.assertEqual(E.main(), 78)
            legacy.assert_not_called()

    def test_shipped_template_is_not_configuration_approval(self):
        template = ROOT / "scripts/symphony/profiles/upstream-preservation/binding.example.json"
        with mock.patch.object(H, "_activation_snapshot") as observe:
            with self.assertRaises(ValueError):
                E.observe_upstream_preservation(template, E.digest(template.read_bytes()))
            observe.assert_not_called()

    def test_missing_unapproved_malformed_or_cross_bound_configuration_holds(self):
        original = copy.deepcopy(self.binding)
        for key, value in (("unknownAuthority", True), ("configurationApproved", False), ("configurationApproved", 1), ("purpose", "activation"),
                ("release", {}), ("service", "other.service"), ("unitPath", "/other/unit"),
                ("dropInDirectory", "/other/overrides"), ("unitSha256", "a" * 64), ("dropIns", {}),
                ("dropIns", {"../zz-upstream-cutover.conf": "a" * 64}), ("dropIns", {"zz-upstream-cutover.conf": False}),
                ("workflowSha256", "a" * 64), ("effectiveConfigurationSha256", "a" * 64),
                ("executablePath", str(self.package)), ("packagePath", "relative")):
            with self.subTest(key=key, value=value):
                self.binding = {**original, key: value}
                with self.assertRaises((ValueError, TypeError, OSError)): self.observe()
        self.binding = original
        self.save_binding()
        for digest in ("invalid", "a" * 64):
            with self.assertRaises(ValueError): self.observe(digest)

    def test_loaded_disk_process_and_freshness_disagreement_hold(self):
        for key, value in (("NeedDaemonReload", "yes"), ("MainPID", "0"), ("InvocationID", "bad"),
                           ("DropInPaths", ""), ("SubState", "failed")):
            old = self.a.fields[key]; self.a.fields[key] = value
            with self.assertRaises(ValueError): self.observe()
            self.a.fields[key] = old
        extra = self.a.dropins / "extra.conf"; extra.write_text("[Service]\n")
        with self.assertRaises(ValueError): self.observe()
        extra.unlink()
        self.state_at = (datetime.now(timezone.utc) - timedelta(seconds=601)).isoformat()
        with self.assertRaises(ValueError): self.observe()
        self.state_at = datetime.now(timezone.utc).isoformat()
        (self.a.proc / "456/cgroup").write_text("0::/foreign/service\n")
        with self.assertRaises(ValueError): self.observe()

    def test_effective_digest_binds_native_arrays_without_systemd_interpretation(self):
        good = self.effective(); expected = E.upstream_effective_digest(good)
        reordered = copy.deepcopy(good); reordered["Environment"].reverse()
        self.assertEqual(E.upstream_effective_digest(reordered), expected)
        for field, value in (("Environment", ["A=1", "A=2"]), ("Environment", ["not-assignment"]),
                ("EnvironmentFiles", [["/file", 1]]), ("Type", "forking"), ("WorkingDirectory", "relative"),
                ("ExecStartEx", "not-array"), ("ExecStartEx", [["/exe", ["/exe"], ["ignore-failure"], 0, 0, 0, 0, 0, 0, 0]])):
            with self.subTest(field=field), self.assertRaises(ValueError):
                E.upstream_effective_digest({**good, field: value})
        changed = copy.deepcopy(good); changed["EnvironmentFiles"].reverse()
        self.assertNotEqual(E.upstream_effective_digest(changed), expected)
        changed = copy.deepcopy(good); changed["ExecStartEx"][0][3] = 999
        self.assertEqual(E.upstream_effective_digest(changed), expected)

    def test_symlink_changed_inventory_and_mid_observation_race_hold(self):
        original = self.a.unit.read_bytes()
        outside = self.a.home / "outside-unit"; outside.write_bytes(original)
        self.a.unit.unlink(); self.a.unit.symlink_to(outside)
        with self.assertRaises(ValueError): self.observe()
        self.a.unit.unlink(); self.a.unit.write_bytes(original)
        override = self.a.dropins / "zz-upstream-cutover.conf"
        original_override = override.read_bytes(); override.write_bytes(b"changed")
        with self.assertRaises(ValueError): self.observe()
        override.write_bytes(original_override)
        import verify_upstream_burrito_payload as V
        verify = V.verify
        def race(*args):
            result = verify(*args)
            self.a.fields["InvocationID"] = "b" * 32
            return result
        with mock.patch.object(V, "verify", side_effect=race), self.assertRaises(ValueError): self.observe()
        self.a.fields["InvocationID"] = "a" * 32
        with mock.patch.object(E.time, "monotonic", side_effect=[0, 31]), self.assertRaises(ValueError): self.observe()



if __name__ == "__main__":
    unittest.main()
