"""Regression tests for scripts/lanes/git_housekeeping.py (isolated fixture tempdirs).

Run with:
    python3 -m unittest scripts/tests/test_git_housekeeping.py -v
"""
from __future__ import annotations

import ctypes
import errno
import os
import shutil
import sys
import tempfile
import unittest
import unittest.mock
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import git_housekeeping  # noqa: E402

git_housekeeping.install_process_fixture_env()
git_housekeeping.install_isolated_tempdirs()


class IsolatedTempdirContractTest(unittest.TestCase):
    """The lanes host qualifies on its own ambient python3 (3.9), while CI pins
    3.12. The isolation wrapper must construct on every supported interpreter:
    before the fix, forwarding 3.12-only ``delete`` (and 3.10-only
    ``ignore_cleanup_errors``) raised TypeError inside every
    TemporaryDirectory fixture before any assertion ran (JOV-8913)."""

    def test_construction_with_prefix_and_cleanup_work_on_this_interpreter(self):
        with tempfile.TemporaryDirectory(prefix="probe-") as tmp:
            path = Path(tmp)
            self.assertTrue(path.is_dir())
            self.assertIn(f"jovie-lanes-{os.getpid()}-probe-", path.name)
        self.assertFalse(path.exists(), "cleanup removes the isolated tree")

    def test_construction_with_explicit_dir_works_on_this_interpreter(self):
        with tempfile.TemporaryDirectory(prefix="outer-") as outer:
            with tempfile.TemporaryDirectory(prefix="inner-", dir=outer) as tmp:
                self.assertEqual(Path(tmp).parent.resolve(), Path(outer).resolve())
            self.assertFalse(Path(tmp).exists())

    def test_ignore_cleanup_errors_forwarding_never_explodes(self):
        # 3.10+ forwards the kwarg; 3.9 must drop it instead of forwarding.
        with tempfile.TemporaryDirectory(
            prefix="kwargs-", ignore_cleanup_errors=True
        ) as tmp:
            self.assertTrue(Path(tmp).is_dir())

    def test_delete_false_is_honored_or_refused_never_silently_ignored(self):
        if sys.version_info >= (3, 12):
            held = tempfile.TemporaryDirectory(prefix="held-", delete=False)
            try:
                self.assertTrue(Path(held.name).exists(), "delete=False keeps the tree")
            finally:
                shutil.rmtree(held.name, ignore_errors=True)
            return
        with self.assertRaises(NotImplementedError):
            tempfile.TemporaryDirectory(prefix="held-", delete=False)


if __name__ == "__main__":
    unittest.main()


class MountedTreeRefusalTest(unittest.TestCase):
    """2026-10-25: a delete of a bind-mounted workspace removed another volume's files."""

    def table(self, tmp, *mounts):
        path = Path(tmp) / "mountinfo"
        path.write_text("".join(f"1 0 8:1 / {m} rw - ext4 /dev/x rw\n" for m in mounts))
        return path

    def test_refuses_a_mount_point_or_a_tree_containing_one(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve() / "ws"
            (root / "inner").mkdir(parents=True)
            self.assertEqual(git_housekeeping.mounted_inside(root, self.table(tmp, root)), root)
            self.assertEqual(git_housekeeping.mounted_inside(root, self.table(tmp, root / "inner")), root / "inner")
            self.assertIsNone(git_housekeeping.mounted_inside(root, self.table(tmp, Path(tmp).resolve())))
            self.assertIsNone(git_housekeeping.mounted_inside(root, self.table(tmp, "/srv/other")))
            with self.assertRaises(OSError):  # unreadable table fails closed
                git_housekeeping.mounted_inside(root, Path(tmp) / "missing")

    def test_remove_tree_leaves_a_mounted_tree_untouched(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "ws"
            root.mkdir()
            (root / "keep.txt").write_text("x")
            with unittest.mock.patch.object(git_housekeeping, "mounted_inside", return_value=root):
                with self.assertRaises(OSError):
                    git_housekeeping.remove_tree(root)
            self.assertTrue((root / "keep.txt").exists())

    def test_actual_root_mount_is_refused_without_deleting_anything(self):
        self.assertEqual(git_housekeeping.mounted_inside(Path("/")), Path("/"))


class DarwinMountSnapshotTest(unittest.TestCase):
    def snapshot_library(self, paths, *, count=None, null=False):
        structure = git_housekeeping._DarwinStatFS64
        rows = (structure * max(1, len(paths)))()
        for index, path in enumerate(paths):
            raw = path if isinstance(path, bytes) else os.fsencode(path)
            ctypes.memmove(ctypes.addressof(rows[index]) + structure.f_mntonname.offset,
                           raw, min(len(raw), 1024))
        library = unittest.mock.Mock()
        def read_snapshot(result, flags):
            self.assertEqual(flags, 2)
            result_count = len(paths) if count is None else count
            if result_count > 0 and not null:
                ctypes.cast(result, ctypes.POINTER(ctypes.POINTER(structure)))[0] = rows
            return result_count
        for symbol in ("getmntinfo_r_np", "getmntinfo_r_np$INODE64"):
            setattr(library, symbol, unittest.mock.Mock(side_effect=read_snapshot))
        return library, rows

    def read_snapshot(self, library, architecture="arm64"):
        with unittest.mock.patch.object(git_housekeeping.sys, "platform", "darwin"), \
                unittest.mock.patch.object(git_housekeeping.platform, "machine", return_value=architecture), \
                unittest.mock.patch.object(git_housekeeping.ctypes, "CDLL", return_value=library):
            return git_housekeeping._darwin_mount_points()

    def test_sdk_layout_and_architecture_symbol_bindings(self):
        structure = git_housekeeping._DarwinStatFS64
        expected = [("f_bsize", 0, 4), ("f_iosize", 4, 4), ("f_blocks", 8, 8),
                    ("f_bfree", 16, 8), ("f_bavail", 24, 8), ("f_files", 32, 8),
                    ("f_ffree", 40, 8), ("f_fsid", 48, 8), ("f_owner", 56, 4),
                    ("f_type", 60, 4), ("f_flags", 64, 4), ("f_fssubtype", 68, 4),
                    ("f_fstypename", 72, 16), ("f_mntonname", 88, 1024),
                    ("f_mntfromname", 1112, 1024), ("f_flags_ext", 2136, 4),
                    ("f_reserved", 2140, 28)]
        self.assertEqual(ctypes.sizeof(structure), 2168)
        self.assertEqual(ctypes.alignment(structure), 8)
        self.assertEqual([(name, getattr(structure, name).offset, ctypes.sizeof(kind))
                          for name, kind in structure._fields_], expected)
        for architecture, symbol in (("arm64", "getmntinfo_r_np"),
                                     ("x86_64", "getmntinfo_r_np$INODE64")):
            with self.subTest(architecture=architecture):
                library, rows = self.snapshot_library([b"/"])
                self.assertEqual(self.read_snapshot(library, architecture), (Path("/"),))
                getattr(library, symbol).assert_called_once()
                self.assertEqual(getattr(library, symbol).restype, ctypes.c_int)
                library.free.assert_called_once()
                self.assertEqual(ctypes.addressof(library.free.call_args.args[0].contents), ctypes.addressof(rows))

    def test_mount_paths_are_lossless_including_human_output_delimiters(self):
        paths = [b"/", b"/Volumes/Music on Stage (Live)\\040", b"/private/tmp/line\n tab\t-\xff"]
        library, rows = self.snapshot_library(paths)
        self.assertEqual(self.read_snapshot(library), tuple(Path(os.fsdecode(path)) for path in paths))
        library.free.assert_called_once()

    def test_bad_snapshot_count_pointer_and_paths_fail_closed_and_release_owned_memory(self):
        cases = [([b"/"], 0, False, False), ([b"/"], -1, False, False),
                 ([b"/"], 1, True, False), ([b"/"], 4097, False, True),
                 ([b"relative"], None, False, True), ([b""], None, False, True),
                 ([b"/" + b"x" * 1023], None, False, True),
                 ([b"/tmp/../elsewhere"], None, False, True),
                 ([b"/missing-root"], None, False, True)]
        for paths, count, null, owned in cases:
            with self.subTest(paths=paths, count=count, null=null):
                library, rows = self.snapshot_library(paths, count=count, null=null)
                with self.assertRaises(OSError):
                    self.read_snapshot(library)
                self.assertEqual(library.free.call_count, int(owned))

    def test_unavailable_api_and_unknown_architecture_fail_closed(self):
        library, rows = self.snapshot_library([b"/"])
        with self.assertRaises(OSError) as caught:
            self.read_snapshot(library, "unverified-architecture")
        self.assertEqual(caught.exception.errno, errno.ENOTSUP)
        library.free.assert_not_called()
        with unittest.mock.patch.object(git_housekeeping.sys, "platform", "darwin"), \
                unittest.mock.patch.object(git_housekeeping.platform, "machine", return_value="arm64"), \
                unittest.mock.patch.object(git_housekeeping.ctypes, "CDLL", side_effect=OSError("missing library")):
            with self.assertRaises(OSError) as caught:
                git_housekeeping._darwin_mount_points()
        self.assertEqual(caught.exception.errno, errno.ENOSYS)

    def test_firmlink_identity_detects_nested_mount_beyond_lexical_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve() / "workspace"
            alias = Path(tmp).resolve() / "data-alias"
            mount = alias / "nested"
            root.mkdir()
            mount.mkdir(parents=True)
            root_stat = root.stat()
            original_stat = Path.stat
            def stat(path, *args, **kwargs):
                return root_stat if path == alias else original_stat(path, *args, **kwargs)
            with unittest.mock.patch.object(git_housekeeping, "_darwin_mount_points", return_value=(mount,)), \
                    unittest.mock.patch.object(Path, "stat", stat):
                self.assertEqual(git_housekeeping._darwin_mounted_inside(root), mount)

    def test_mount_ancestor_or_neighbor_is_not_inside_but_unknown_identity_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp).resolve()
            root = parent / "workspace"
            neighbor = parent / "workspace-neighbor"
            root.mkdir()
            neighbor.mkdir()
            with unittest.mock.patch.object(git_housekeeping, "_darwin_mount_points", return_value=(parent, neighbor)):
                self.assertIsNone(git_housekeeping._darwin_mounted_inside(root))
            with unittest.mock.patch.object(git_housekeeping, "_darwin_mount_points", return_value=(parent / "unreadable",)):
                with self.assertRaises(OSError):
                    git_housekeeping._darwin_mounted_inside(root)

    def test_explicit_linux_table_still_works_on_darwin_without_native_api(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve() / "workspace with space"
            root.mkdir()
            table = Path(tmp) / "mountinfo"
            encoded = str(root).replace(" ", "\\040")
            table.write_text(f"1 0 8:1 / {encoded} rw - ext4 /dev/x rw\n")
            with unittest.mock.patch.object(git_housekeeping.sys, "platform", "darwin"), \
                    unittest.mock.patch.object(git_housekeeping, "_darwin_mount_points") as native:
                self.assertEqual(git_housekeeping.mounted_inside(root, table), root)
            native.assert_not_called()
