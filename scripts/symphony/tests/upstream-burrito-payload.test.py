#!/usr/bin/env python3
"""Real compressed payload and filesystem tests; no packaged binary is executed."""
import hashlib
import json
import lzma
import os
from pathlib import Path
import stat
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import verify_upstream_burrito_payload as V


def archive(rows):
    result = b"FOILZ"
    for name, data, mode in rows:
        name = name.encode()
        result += struct.pack("<Q", len(name)) + name + struct.pack("<Q", len(data)) + data + struct.pack("<Q", mode)
    return result + b"FOILZ"


class PayloadTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name).resolve()
        self.root = self.base / "installed"
        self.root.mkdir()
        self.rows = [("erts/bin/beam.smp", b"verified BEAM", 0o100755), ("lib/app.beam", b"application", 0o100644)]
        self.payload = archive(self.rows)
        self.package = self.base / "package"
        self.package.write_bytes(b"wrapper" + lzma.compress(self.payload) + b"binary trailer")
        self.digest = hashlib.sha256(self.package.read_bytes()).hexdigest()
        for name, value, mode in self.rows:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(value)
            path.chmod(stat.S_IMODE(mode))

    def verify(self):
        return V.verify(self.package, self.digest, self.root)

    def test_matches_all_embedded_bytes_without_claiming_process_or_admission(self):
        before = {p: p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        (self.root / "_metadata.json").write_text('{"version":"fixture"}')
        result = self.verify()
        self.assertEqual(result["verifiedFiles"], 2)
        self.assertEqual(result["packageSha256"], self.digest)
        self.assertEqual(result["runtimeIdentity"], "unverified")
        self.assertEqual(result["admission"], "unverified")
        self.assertEqual(before, {p: p.read_bytes() for p in before})

    def test_cli_uses_real_verifier(self):
        result = subprocess.run([sys.executable, V.__file__, "--package", str(self.package), "--sha256", self.digest, "--extracted-root", str(self.root)], capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(result.stdout)["verifiedFiles"], 2)

    def test_rejects_unapproved_package_before_decode(self):
        with mock.patch.object(V, "payload_from_package") as decode:
            with self.assertRaises(ValueError): V.verify(self.package, "f" * 64, self.root)
            with self.assertRaises(ValueError): V.verify(self.package, "bad", self.root)
            decode.assert_not_called()

    def test_rejects_modified_missing_extra_or_mode_changed_file(self):
        target = self.root / self.rows[0][0]
        for mutation in (lambda: target.write_bytes(b"modified"), lambda: target.unlink(), lambda: target.chmod(0o644)):
            target.write_bytes(self.rows[0][1]); target.chmod(0o755)
            mutation()
            with self.assertRaises(ValueError): self.verify()
        target.write_bytes(self.rows[0][1]); target.chmod(0o755)
        (self.root / "extra.beam").write_bytes(b"extra")
        with self.assertRaises(ValueError): self.verify()

    def test_rejects_symlinked_files_directories_package_and_root(self):
        target = self.root / self.rows[0][0]
        outside = self.base / "same"; outside.write_bytes(target.read_bytes()); outside.chmod(0o755)
        target.unlink(); target.symlink_to(outside)
        with self.assertRaises((ValueError, OSError)): self.verify()
        target.unlink(); target.write_bytes(outside.read_bytes()); target.chmod(0o755)
        (self.root / "linked").symlink_to(self.base, target_is_directory=True)
        with self.assertRaises(ValueError): self.verify()
        (self.root / "linked").unlink()
        link = self.base / "root-link"; link.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(ValueError): V.verify(self.package, self.digest, link)
        package_link = self.base / "package-link"; package_link.symlink_to(self.package)
        with self.assertRaises(OSError): V.verify(package_link, self.digest, self.root)

    def test_metadata_must_be_regular_nonexecutable_and_bounded(self):
        path = self.root / "_metadata.json"; path.write_bytes(b"metadata"); path.chmod(0o755)
        with self.assertRaises(ValueError): self.verify()
        path.chmod(0o644); path.write_bytes(b"x" * 65537)
        with self.assertRaises(ValueError): self.verify()

    def test_rejects_unsafe_duplicate_or_nonregular_archive_entries(self):
        for name in ("../escape", "/absolute", "a/../escape", "a//b", "a/./b", "a\\b", "a\x00b", ""):
            with self.subTest(name=name), self.assertRaises(ValueError): V.payload_manifest(archive([(name, b"x", 0o100644)]))
        for mode in (0o120777, 0o104755):
            with self.assertRaises(ValueError): V.payload_manifest(archive([("a", b"x", mode)]))
        with self.assertRaises(ValueError): V.payload_manifest(archive([self.rows[0], self.rows[0]]))

    def test_rejects_truncation_and_invalid_envelope(self):
        for payload in (b"bad", b"FOILZFOILZ", b"FOILZxFOILZ", b"FOILZ" + struct.pack("<Q", 9000) + b"FOILZ", archive(self.rows)[:-10] + b"FOILZ"):
            with self.assertRaises(ValueError): V.payload_manifest(payload)

    def test_rejects_missing_ambiguous_truncated_or_oversized_xz(self):
        compressed = lzma.compress(self.payload)
        for package in (b"no archive", V.XZ + b"invalid", compressed + compressed, compressed[:-10], lzma.compress(b"FOILZbroken")):
            with self.assertRaises(ValueError): V.payload_from_package(package)
        with mock.patch.object(V, "MAX_PAYLOAD", 10), self.assertRaises(ValueError): V.payload_from_package(compressed)
        with self.assertRaises(ValueError): V.payload_from_package((V.XZ + b"bad") * 17)

    def test_resource_bounds(self):
        with mock.patch.object(V, "MAX_FILES", 1), self.assertRaises(ValueError): V.payload_manifest(self.payload)
        with self.assertRaises(ValueError): V.regular_bytes(self.package, 1)
        with self.assertRaises(ValueError): V.verify(self.package, self.digest, self.base / "absent")

    def test_rejects_a_file_changed_during_read(self):
        original = os.fstat
        calls = 0

        def change_after_first_stat(fd):
            nonlocal calls
            result = original(fd)
            calls += 1
            if calls == 1:
                with self.package.open("ab") as output:
                    output.write(b"changed")
            return result

        with mock.patch.object(V.os, "fstat", side_effect=change_after_first_stat):
            with self.assertRaisesRegex(ValueError, "file changed during read"):
                V.regular_bytes(self.package, V.MAX_PACKAGE)

    def test_fifo_without_writer_fails_without_blocking(self):
        fifo = self.base / "fifo"
        os.mkfifo(fifo)
        code = "import sys; from pathlib import Path; sys.path.insert(0, sys.argv[1]); import verify_upstream_burrito_payload as V; V.regular_bytes(Path(sys.argv[2]), 1024)"
        result = subprocess.run([sys.executable, "-c", code, str(Path(V.__file__).parent), str(fifo)], capture_output=True, text=True, timeout=2)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("untrusted or oversized file", result.stderr)

    def test_unreadable_extra_directory_fails_closed(self):
        hidden = self.root / "unreadable"
        hidden.mkdir()
        (hidden / "extra.beam").write_bytes(b"untrusted module")
        original = os.scandir

        def deny(path):
            if Path(path) == hidden:
                raise PermissionError("cannot enumerate extracted directory")
            return original(path)

        with mock.patch.object(V.os, "scandir", side_effect=deny):
            with self.assertRaisesRegex(PermissionError, "cannot enumerate"):
                self.verify()


if __name__ == "__main__":
    unittest.main()
