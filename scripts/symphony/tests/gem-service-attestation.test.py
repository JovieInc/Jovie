#!/usr/bin/env python3
"""Exercise real source comparison, /proc ownership, and atomic writer fencing."""
from datetime import datetime, timedelta, timezone
import fcntl
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import emit_gem_service_attestation as E

REV = "3" * 40
CONFIG = "a" * 40
NOW = datetime(2026, 9, 12, 15, tzinfo=timezone.utc)
WORKFLOW = b"---\nagent:\n  max_concurrent_agents: 5\n  max_turns: 2\n---\nprompt\n"


class PublisherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.gem = self.root / "gem"
        (self.gem / "scripts").mkdir(parents=True)
        self.package = self.root / "symphony"
        self.package.write_bytes(b"verified-release-package")
        self.install = self.root / REV
        self.exe = self.install / ".burrito/bin/beam.smp"
        self.exe.parent.mkdir(parents=True)
        self.exe.write_bytes(b"erts-executable")
        self.workflow = self.root / "WORKFLOW.md"
        self.workflow.write_bytes(WORKFLOW)
        self.unit = self.root / "symphony-elixir.service"
        self.unit.write_bytes(b"canonical-unit")
        for name in ["gem_rehabilitation_policy.py", "gem-priority-gate.py", "closure_health.py"]:
            (self.gem / "scripts" / name).write_bytes(name.encode())
        self.sources = dict(zip(E.SURFACES.values(), [b"canonical-unit", b"gem_rehabilitation_policy.py", b"gem-priority-gate.py", b"closure_health.py", WORKFLOW]))
        self.sidecar = self.root / "package.provenance.json"
        self.release = {"repository": "JovieInc/symphony", "source_sha": REV, "target": "linux_x86_64",
                        "artifact": f"symphony-{REV}-linux_x86_64", "sha256": E.digest(self.package.read_bytes()),
                        "make_all": {"conclusion": "success"}}
        self.sidecar.write_text(json.dumps(self.release))
        self.group = "/user.slice/symphony-elixir.service"
        self.fields = {"MainPID": "123", "ControlGroup": self.group, "InvocationID": "verified-invocation",
                       "ActiveState": "active", "NeedDaemonReload": "no", "FragmentPath": str(self.unit), "DropInPaths": ""}
        self.proc = self.root / "proc"
        for pid, parent in [(123, 1), (456, 123)]:
            p = self.proc / str(pid)
            (p / "fd").mkdir(parents=True)
            (p / "net").mkdir()
            (p / "stat").write_text(f"{pid} (beam) " + " ".join(["S", str(parent)] + ["0"] * 17 + [str(pid * 100)]))
            (p / "cgroup").write_text(f"0::{self.group}\n")
            (p / "cmdline").write_bytes((str(self.exe) + "\0" + str(self.workflow) + "\0").encode())
            (p / "exe").symlink_to(self.exe)
            (p / "net/tcp").write_text("header\n")
            (p / "net/tcp6").write_text("header\n")
        self.listener = self.proc / "456"
        (self.listener / "fd/3").symlink_to("socket:[567]")
        (self.listener / "net/tcp").write_text("header\n0: 0100007F:0FC9 00000000:0000 0A 0 0 0 0 0 567\n")
        (self.listener / "environ").write_bytes(f"SYMPHONY_INSTALL_DIR={self.install}\0".encode())
        self.ss = 'LISTEN 0 4096 127.0.0.1:4041 0.0.0.0:* users:(("beam.smp",pid=456,fd=3))'
        self.state = {"generated_at": NOW.isoformat()}
        def command(args):
            if args[0] == "git": return CONFIG
            if args[0] == "ss": return self.ss
            return "\n".join(f"{k}={v}" for k, v in self.fields.items())
        def source_bytes(root, revision, path):
            if path not in self.sources: raise subprocess.CalledProcessError(128, ["git"])
            return self.sources[path]
        for patch in [mock.patch.object(E, "command", side_effect=command),
                      mock.patch.object(E, "source_bytes", side_effect=source_bytes),
                      mock.patch.object(E.trust, "PROC_ROOT", self.proc),
                      mock.patch.object(E.trust, "service_identity", return_value=(123, self.group)),
                      mock.patch.object(E.urllib.request, "urlopen", side_effect=lambda *a, **k: io.BytesIO(json.dumps(self.state).encode()))]:
            patch.start()
            self.addCleanup(patch.stop)

    def observe(self):
        return E.observe(self.sidecar, self.root, CONFIG, self.package, self.gem, proc_root=self.proc, now=NOW)

    def test_healthy_observation_binds_release_not_config_or_prior_receipt(self):
        dest = self.gem / "state/gem-service-attestation.json"
        dest.parent.mkdir()
        dest.write_text(json.dumps({"sourceRevision": "f" * 40, "healthy": True}))
        receipt = E.publish(dest, self.observe)
        self.assertTrue(receipt["healthy"])
        self.assertEqual(receipt["sourceRevision"], REV)
        self.assertEqual(receipt["configurationSourceRevision"], CONFIG)
        self.assertEqual(receipt["listener"]["pid"], 456)
        self.assertEqual(receipt["runtime"]["workflowPath"], str(self.workflow))
        self.assertEqual(json.loads(dest.read_text()), receipt)
        self.assertNotEqual(receipt["runtime"]["packageSha256"], receipt["runtime"]["executableSha256"])
        self.state["generated_at"] = (NOW + timedelta(seconds=301)).isoformat()
        later = E.observe(self.sidecar, self.root, CONFIG, self.package, self.gem, proc_root=self.proc, now=NOW + timedelta(seconds=301))
        self.assertNotEqual(receipt["observedAt"], later["observedAt"])
        self.assertEqual(receipt["sourceRevision"], later["sourceRevision"])

    def test_unknown_override_or_changed_config_is_unhealthy_not_self_compared(self):
        override = self.root / "local-override.conf"
        override.write_bytes(b"unapproved-override")
        self.fields["DropInPaths"] = str(override)
        result = self.observe()
        self.assertFalse(result["healthy"])
        self.assertIsNone(result["unitOverrides"][0]["sourceSha256"])
        self.fields["DropInPaths"] = ""
        self.unit.write_bytes(b"modified-unit")
        self.assertFalse(self.observe()["unit"]["matches"])
        self.fields["NeedDaemonReload"] = "yes"
        self.assertFalse(self.observe()["daemonReloaded"])

    def test_owned_unit_dropins_match_source_and_stay_healthy(self):
        mounts = self.root / "workspace-mounts.conf"
        guard = self.root / "90-symphony-safe-restart-guard.conf"
        mounts.write_bytes(
            b"[Service]\nExecStartPre=/usr/bin/sudo -n /usr/local/sbin/jovie-symphony-workspace restore-all\n"
        )
        guard.write_bytes(b"[Unit]\nRefuseManualStop=yes\n")
        self.sources[
            "scripts/symphony/systemd/symphony-elixir.service.d/workspace-mounts.conf"
        ] = mounts.read_bytes()
        self.sources[
            "scripts/symphony/systemd/symphony-elixir.service.d/90-symphony-safe-restart-guard.conf"
        ] = guard.read_bytes()
        self.fields["DropInPaths"] = f"{mounts} {guard}"
        result = self.observe()
        self.assertTrue(result["healthy"])
        self.assertEqual(
            [item["name"] for item in result["unitOverrides"]],
            ["workspace-mounts.conf", "90-symphony-safe-restart-guard.conf"],
        )
        self.assertTrue(all(item["matches"] for item in result["unitOverrides"]))

    def test_only_existing_concurrency_overlay_is_accepted(self):
        for value in [1, 41, 128]:
            self.workflow.write_bytes(WORKFLOW.replace(b"agents: 5", f"agents: {value}".encode()))
            result = self.observe()
            self.assertTrue(result["healthy"])
            self.assertEqual(result["workflow"]["installedMaxConcurrentAgents"], value)
        for data in [WORKFLOW.replace(b"agents: 5", b"agents: 0"), WORKFLOW.replace(b"agents: 5", b"agents: 01"),
                     WORKFLOW.replace(b"max_turns: 2", b"max_turns: 99"), WORKFLOW + b"  max_concurrent_agents: 5\n"]:
            self.workflow.write_bytes(data)
            self.assertFalse(self.observe()["healthy"])

    def test_release_package_source_and_service_must_be_bound(self):
        for field, value in [("repository", "other/repo"), ("source_sha", "f" * 40), ("target", "other"), ("sha256", "f" * 64), ("artifact", "other"), ("make_all", {"conclusion": "failure"})]:
            with self.subTest(field=field):
                self.sidecar.write_text(json.dumps({**self.release, field: value}))
                with self.assertRaises(ValueError): self.observe()
        self.sidecar.write_text(json.dumps(self.release))
        self.package.write_bytes(b"replaced-binary")
        with self.assertRaises(ValueError): self.observe()
        self.package.write_bytes(b"verified-release-package")
        (self.listener / "environ").write_bytes(f"SYMPHONY_INSTALL_DIR={self.root / ('f' * 40)}\0".encode())
        with self.assertRaisesRegex(ValueError, "running application"): self.observe()

    def test_malformed_provenance_and_concurrent_executable_change_are_rejected(self):
        for data in [[], {**self.release, "make_all": []}]:
            self.sidecar.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, "invalid release"): self.observe()
        self.sidecar.write_text(json.dumps(self.release))
        original = E.trust.live_runtime
        def mutate_after_binding(*args):
            result = original(*args)
            self.exe.write_bytes(b"concurrently-replaced-runtime")
            return result
        with mock.patch.object(E.trust, "live_runtime", side_effect=mutate_after_binding):
            with self.assertRaisesRegex(ValueError, "changed during"): self.observe()

    def test_foreign_listener_wrong_port_and_non_descendant_are_rejected(self):
        for name, value in [("cgroup", "0::/foreign\n"), ("net/tcp", "header\n"),
                            ("stat", "456 (beam) " + " ".join(["S", "1"] + ["0"] * 17 + ["45600"]))]:
            path = self.listener / name
            original = path.read_text()
            path.write_text(value)
            with self.assertRaises(ValueError): self.observe()
            path.write_text(original)
        self.ss = "no listener"
        with self.assertRaisesRegex(ValueError, "listener"): self.observe()
        self.fields["ActiveState"] = "inactive"
        with self.assertRaisesRegex(ValueError, "inactive"): self.observe()

    def test_stale_state_and_restart_during_read_cannot_publish(self):
        for offset in [-601, 61]:
            self.state["generated_at"] = (NOW + timedelta(seconds=offset)).isoformat()
            with self.assertRaisesRegex(ValueError, "state observation stale"): self.observe()
        self.state["generated_at"] = NOW.isoformat()
        with mock.patch.object(E, "service_fields", side_effect=[dict(self.fields), {**self.fields, "MainPID": "999"}]):
            with self.assertRaisesRegex(ValueError, "changed during"): self.observe()
        with mock.patch.object(E, "command", return_value="wrong-configuration-source"):
            with self.assertRaisesRegex(ValueError, "source revision"): self.observe()
        with self.assertRaisesRegex(ValueError, "clock"):
            E.observe(self.sidecar, self.root, CONFIG, self.package, self.gem, now=NOW.replace(tzinfo=None))

    def test_competing_writer_cannot_measure_or_overwrite_and_errors_preserve_evidence(self):
        dest = self.root / "receipt.json"
        dest.write_text('original')
        measure = mock.Mock(return_value={"healthy": True})
        with dest.with_suffix('.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError): E.publish(dest, measure)
        measure.assert_not_called()
        with self.assertRaises(ValueError): E.publish(dest, mock.Mock(side_effect=ValueError("unbound")))
        self.assertEqual(dest.read_text(), 'original')
        with mock.patch.object(E.os, 'replace', side_effect=OSError('failed')):
            with self.assertRaises(OSError): E.publish(dest, measure)
        self.assertEqual(list(self.root.glob('.service-attestation-*')), [])

    def test_entrypoint_check_does_not_write_and_failure_is_redacted(self):
        args = ['publisher', '--provenance', str(self.sidecar), '--source-root', str(self.root), '--source-revision', CONFIG, '--check']
        for healthy, code in [(True, 0), (False, 2)]:
            with mock.patch.object(sys, 'argv', args), mock.patch.object(E, 'observe', return_value={"healthy": healthy}), mock.patch('builtins.print'), mock.patch.object(E, 'publish') as writer:
                self.assertEqual(E.main(), code)
                writer.assert_not_called()
        with mock.patch.object(sys, 'argv', args), mock.patch.object(E, 'observe', side_effect=ValueError('secret text')), mock.patch('builtins.print') as output:
            self.assertEqual(E.main(), 78)
            self.assertNotIn('secret text', str(output.call_args))


if __name__ == '__main__':
    unittest.main()
