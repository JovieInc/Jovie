"""Keep git housekeeping from racing fixture cleanup.

Git 2.55 defaults `maintenance.auto` and `maintenance.autoDetach` on. `git commit`
then returns while a detached `git maintenance run --auto` is still creating
files under `.git/objects`. `shutil.rmtree` raises `OSError` errno 39
(`ENOTEMPTY`) and a status/remove that overlaps the same process fails closed.
Housekeeping config stops new daemons; cleanup waits for the ones already
running and only then deletes. A directory that stays occupied still raises.
"""
from __future__ import annotations

import ctypes
import errno
import os
import platform
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# Detached maintenance and fsmonitor, not commit signing. Production lane commits
# keep the host's gpgsign setting; fixtures add that separately.
HOUSEKEEPING = (
    ("maintenance.auto", "false"),
    ("maintenance.autoDetach", "false"),
    ("gc.auto", "0"),
    ("gc.autoDetach", "false"),
    ("core.fsmonitor", "false"),
)
FIXTURE = HOUSEKEEPING + (("commit.gpgsign", "false"),)
_RETRY = {errno.ENOTEMPTY, errno.EBUSY, errno.EPERM, errno.EACCES}
_MAX_CONFIG = 64


def _config_count(env) -> int:
    try:
        count = int(env.get("GIT_CONFIG_COUNT", "0"))
    except (TypeError, ValueError):
        return 0
    return count if 0 <= count <= _MAX_CONFIG else 0


def _pairs(env) -> list[tuple[str, str]]:
    count = _config_count(env)
    return [(env.get(f"GIT_CONFIG_KEY_{i}", ""), env.get(f"GIT_CONFIG_VALUE_{i}", ""))
            for i in range(count)]


def apply_config(env, pairs) -> dict:
    """Append git config pairs. The last value for a key wins, so housekeeping
    overrides an earlier `maintenance.auto=true` without dropping other keys."""
    copied = dict(env)
    count = _config_count(copied)
    existing = set(_pairs(copied))
    for key, value in pairs:
        if (key, value) in existing:
            continue
        copied[f"GIT_CONFIG_KEY_{count}"] = key
        copied[f"GIT_CONFIG_VALUE_{count}"] = value
        existing.add((key, value))
        count += 1
    copied["GIT_CONFIG_COUNT"] = str(count)
    return copied


def apply_housekeeping_env(env) -> dict:
    return apply_config(env, HOUSEKEEPING)


def apply_fixture_env(env) -> dict:
    return apply_config(env, FIXTURE)


def install_process_fixture_env(environ=None) -> None:
    target = os.environ if environ is None else environ
    quiet = apply_fixture_env(target)
    for key, value in quiet.items():
        if target.get(key) != value:
            target[key] = value


def _is_git(comm: str) -> bool:
    name = comm.strip().split("/")[-1]
    return name == "git" or name.startswith("git-")


def _cwd_text(entry: Path) -> str | None:
    try:
        raw = os.readlink(entry / "cwd")
    except OSError:
        return None
    # A process whose directory was just removed still occupies that path.
    suffix = " (deleted)"
    if raw.endswith(suffix):
        raw = raw[: -len(suffix)]
    return raw


def _inside(root: str, raw: str) -> bool:
    return raw == root or raw.startswith(root + os.sep)


def processes_under(path: Path) -> list[tuple[int, str]]:
    """(pid, comm) of other processes whose cwd is inside `path`."""
    try:
        root = str(path.resolve())
    except OSError:
        root = str(path)
    found = []
    proc = Path("/proc")
    if not proc.is_dir():
        return found
    me = os.getpid()
    for entry in proc.iterdir():
        if not entry.name.isdigit():
            continue
        pid = int(entry.name)
        if pid == me:
            continue
        raw = _cwd_text(entry)
        if raw is None or not _inside(root, raw):
            continue
        try:
            comm = (entry / "comm").read_text(errors="replace").strip()
        except OSError:
            comm = ""
        found.append((pid, comm))
    return found


def _signal(pids: list[int], sig: int) -> None:
    for pid in pids:
        try:
            os.kill(pid, sig)
        except (ProcessLookupError, PermissionError):
            pass


def git_dir(path: Path) -> Path | None:
    pointer = path / ".git"
    try:
        if pointer.is_dir():
            return pointer
        text = pointer.read_text()
    except OSError:
        return None
    if not text.startswith("gitdir:"):
        return None
    target = Path(text.split(":", 1)[1].strip())
    return target if target.is_absolute() else (path / target).resolve()


def stop_fsmonitor(path: Path) -> None:
    if git_dir(path) is None and not (path / ".git").exists():
        return
    try:
        subprocess.run(["git", "-C", str(path), "fsmonitor--daemon", "stop"],
                       capture_output=True, text=True, timeout=5,
                       env=apply_housekeeping_env(os.environ))
    except (OSError, subprocess.SubprocessError):
        pass


def quiesce(path: Path, *, kill: bool = False, timeout: float = 3.0) -> None:
    """Wait until nobody is still working inside `path`.

    `kill` is only for a delete that has already been decided: it signals git
    (maintenance, cat-file, fsmonitor), never an unrelated process. A directory
    that is still occupied after the wait is left for the caller to fail closed.
    """
    root = Path(path)
    stop_fsmonitor(root)
    deadline = time.monotonic() + timeout
    while processes_under(root):
        if time.monotonic() >= deadline:
            break
        time.sleep(0.05)
    if not kill:
        return
    git_pids = [pid for pid, comm in processes_under(root) if _is_git(comm)]
    if not git_pids:
        return
    _signal(git_pids, signal.SIGTERM)
    term = time.monotonic() + 0.5
    while time.monotonic() < term and any(pid in {p for p, _ in processes_under(root)} for pid in git_pids):
        time.sleep(0.05)
    _signal([pid for pid, comm in processes_under(root) if _is_git(comm)], signal.SIGKILL)


def _retryable(error: OSError) -> bool:
    if isinstance(error, FileNotFoundError) or error.errno == errno.ENOENT:
        return False
    return error.errno in _RETRY or "Directory not empty" in str(error)


def _repository(root: Path) -> bool:
    return (root / ".git").exists() or (root / "HEAD").is_file()


def _settled_absent(root: Path, seconds: float) -> bool:
    """True when `root` stays gone. A detached writer recreates `.git/objects`
    within this window; a finished one does not."""
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if root.exists() or root.is_symlink() or processes_under(root):
            return False
        time.sleep(0.02)
    return not root.exists() and not root.is_symlink() and not processes_under(root)


class _DarwinStatFS64(ctypes.Structure):
    """Darwin SDK sys/mount.h __DARWIN_STRUCT_STATFS64, not legacy statfs.

    Verified with SDK sizeof/offsetof on arm64 and x86_64 compilation:
    size2168, alignment8, mount-name offset88, and MAXPATHLEN1024.
    """
    _fields_ = [
        ("f_bsize", ctypes.c_uint32), ("f_iosize", ctypes.c_int32),
        ("f_blocks", ctypes.c_uint64), ("f_bfree", ctypes.c_uint64),
        ("f_bavail", ctypes.c_uint64), ("f_files", ctypes.c_uint64),
        ("f_ffree", ctypes.c_uint64), ("f_fsid", ctypes.c_int32 * 2),
        ("f_owner", ctypes.c_uint32), ("f_type", ctypes.c_uint32),
        ("f_flags", ctypes.c_uint32), ("f_fssubtype", ctypes.c_uint32),
        ("f_fstypename", ctypes.c_char * 16),
        ("f_mntonname", ctypes.c_char * 1024),
        ("f_mntfromname", ctypes.c_char * 1024),
        ("f_flags_ext", ctypes.c_uint32), ("f_reserved", ctypes.c_uint32 * 7),
    ]


def _darwin_mount_points() -> tuple[Path, ...]:
    """Copy a lossless kernel snapshot; unavailable/invalid evidence refuses deletion."""
    symbols = {"arm64": "getmntinfo_r_np", "x86_64": "getmntinfo_r_np$INODE64"}
    architecture = platform.machine()
    if (sys.platform != "darwin" or architecture not in symbols
            or ctypes.sizeof(ctypes.c_void_p) != 8
            or ctypes.sizeof(_DarwinStatFS64) != 2168
            or ctypes.alignment(_DarwinStatFS64) != 8
            or _DarwinStatFS64.f_mntonname.offset != 88
            or _DarwinStatFS64.f_reserved.offset != 2140):
        raise OSError(errno.ENOTSUP, "unsupported Darwin mount snapshot ABI")
    try:
        library = ctypes.CDLL("/usr/lib/libSystem.B.dylib", use_errno=True)
        snapshot_type = ctypes.POINTER(_DarwinStatFS64)
        read_snapshot = getattr(library, symbols[architecture])
        read_snapshot.argtypes = [ctypes.POINTER(snapshot_type), ctypes.c_int]
        read_snapshot.restype = ctypes.c_int
        release = library.free
        release.argtypes = [ctypes.c_void_p]
        release.restype = None
    except (AttributeError, OSError) as error:
        raise OSError(errno.ENOSYS, "Darwin mount snapshot API unavailable") from error

    snapshot = snapshot_type()
    try:
        ctypes.set_errno(0)
        count = read_snapshot(ctypes.byref(snapshot), 2)  # SDK MNT_NOWAIT
        if count <= 0:
            raise OSError(ctypes.get_errno() or errno.EIO, "Darwin mount snapshot failed")
        if not snapshot or count > 4096:
            raise OSError(errno.EIO, "invalid Darwin mount snapshot count or pointer")
        paths = []
        for index in range(count):
            raw = ctypes.string_at(ctypes.addressof(snapshot[index])
                                   + _DarwinStatFS64.f_mntonname.offset, 1024)
            end = raw.find(b"\0")
            if end <= 0 or not raw.startswith(b"/"):
                raise OSError(errno.EIO, "invalid Darwin mount path")
            path = Path(os.fsdecode(raw[:end]))
            if ".." in path.parts:
                raise OSError(errno.EIO, "noncanonical Darwin mount path")
            paths.append(path)
        if Path("/") not in paths:
            raise OSError(errno.EIO, "Darwin mount snapshot is missing root")
        return tuple(paths)
    finally:
        if snapshot:
            release(snapshot)


def _darwin_mounted_inside(root: Path) -> Path | None:
    mounts = _darwin_mount_points()
    root_stat = root.stat()
    root_identity = (root_stat.st_dev, root_stat.st_ino)
    identities = {}
    for mount in mounts:
        mount = mount.resolve()
        if mount == root or root in mount.parents:
            return mount
        # APFS firmlinks (/Users and /System/Volumes/Data/Users, for example)
        # have equal filesystem identities but remain distinct after realpath.
        for ancestor in (mount, *mount.parents):
            if ancestor not in identities:
                stat = ancestor.stat()
                identities[ancestor] = (stat.st_dev, stat.st_ino)
            if identities[ancestor] == root_identity:
                return mount
    return None


def mounted_inside(path: Path | str, mountinfo: Path | str | None = None) -> Path | None:
    """The first mount point equal to `path` or beneath it, else None. Unreadable mount
    table raises OSError: a delete must fail closed when it cannot prove the tree is local."""
    root = Path(path).resolve()
    if mountinfo is None:
        if sys.platform == "darwin":
            return _darwin_mounted_inside(root)
        if not sys.platform.startswith("linux"):
            raise OSError(errno.ENOTSUP, "mount snapshot unsupported on this platform")
        mountinfo = "/proc/self/mountinfo"
    for line in Path(mountinfo).read_text().splitlines():
        fields = line.split()
        if len(fields) > 4:
            mount = Path(fields[4].replace("\\040", " "))
            if mount == root or root in mount.parents:
                return mount
    return None


def remove_tree(path: Path | str) -> None:
    """Delete `path`. Retry only while a departing git process refills it.

    The last error is raised when the directory is still there. This is not a
    test retry and it does not ignore a real leftover. Non-git temp dirs return
    on the first successful remove.
    """
    root = Path(path)
    # 2026-10-25: an rm -rf of a bind-mounted retired workspace deleted another volume's data.
    mount = mounted_inside(root) if root.exists() else None
    if mount is not None:
        raise OSError(errno.EBUSY, f"refusing to delete {root}: mount point {mount} is at or inside it")
    last: OSError | None = None
    repository = _repository(root)
    for attempt in range(12):
        if attempt:
            # Close git handles that are still creating objects, then retry the
            # same delete. A non-git writer is waited out, not signaled.
            quiesce(root, kill=True, timeout=0.6)
            time.sleep(0.05 * attempt)
        if not root.exists() and not root.is_symlink():
            if not repository or _settled_absent(root, 0.05):
                return
            continue
        repository = repository or _repository(root)
        try:
            shutil.rmtree(root)
        except FileNotFoundError:
            continue
        except OSError as error:
            if error.errno == errno.ENOENT or not root.exists():
                continue
            if not _retryable(error):
                raise
            last = error
            continue
        else:
            # Repositories can be refilled by a writer whose cwd is outside the
            # tree (it only has the objects path). Confirm the delete stuck.
            if not repository or _settled_absent(root, 0.3):
                return
            continue
    quiesce(root, kill=True, timeout=0.6)
    if not root.exists() and (not repository or _settled_absent(root, 0.3)):
        return
    try:
        if root.exists() or root.is_symlink():
            shutil.rmtree(root)
    except OSError as error:
        last = error
    if not root.exists() and (not repository or _settled_absent(root, 0.3)):
        return
    if root.exists():
        if last is not None:
            raise last
        raise OSError(errno.ENOTEMPTY, os.strerror(errno.ENOTEMPTY), str(root))


def remove_linked_worktree(invoke, worktree: Path) -> tuple[bool, str]:
    """Remove a linked worktree, waiting out a detached object writer.

    `invoke` receives git arguments without the `git` binary and returns a
    completed process. Success is the directory staying gone. A remove that
    still leaves the directory is a real failure and returns False.
    """
    last_error = ""
    for attempt in range(5):
        quiesce(worktree, timeout=0.6)
        result = invoke(["worktree", "remove", "--force", str(worktree)])
        last_error = getattr(result, "stderr", "") or ""
        if getattr(result, "returncode", 1) == 0 or not worktree.exists():
            if _settled_absent(worktree, 0.2):
                return True, ""
        time.sleep(0.1 * (attempt + 1))
    return False, last_error.strip()


def _ancestor_pids() -> set[int]:
    found = set()
    pid = os.getpid()
    while pid > 1 and pid not in found:
        found.add(pid)
        try:
            stat = (Path("/proc") / str(pid) / "stat").read_text()
            pid = int(stat.rsplit(")", 1)[1].split()[1])
        except (OSError, IndexError, ValueError):
            break
    return found


def _cmdline(entry: Path) -> str:
    try:
        raw = (entry / "cmdline").read_bytes()
    except OSError:
        return ""
    return raw.replace(b"\0", b" ").decode("utf-8", "replace")


def _mentions(command: str, root: str) -> bool:
    if not command or not root:
        return False
    padded = f" {command} "
    return f" {root} " in padded or f" {root}/" in padded


def _temp_writers(path: Path) -> list[int]:
    """Pids still using a temp dir.

    A dispatch sweep child keeps the runner's cwd and only names the directory
    on its command line (`--state` / `--repo`). cwd-only scans miss it, and it
    is still creating files when TemporaryDirectory cleanup runs.
    """
    texts = {str(path)}
    try:
        texts.add(str(path.resolve()))
    except OSError:
        pass
    ancestors = _ancestor_pids()
    found = []
    proc = Path("/proc")
    if not proc.is_dir():
        return found
    for entry in proc.iterdir():
        if not entry.name.isdigit():
            continue
        pid = int(entry.name)
        if pid in ancestors:
            continue
        raw = _cwd_text(entry)
        if raw and any(_inside(root, raw) for root in texts):
            found.append(pid)
            continue
        if any(_mentions(_cmdline(entry), root) for root in texts):
            found.append(pid)
    return found


def reap_temp_writers(path: Path | str, *, timeout: float = 2.0) -> None:
    """Wait for processes still using a temp dir, then stop them.

    Test teardown only. Production deletes stay in `remove_tree`, which does
    not signal a non-git process. `ignore_errors` is not applied here: if the
    directory is still occupied after the wait, the caller raises.
    """
    root = Path(path)
    if not _temp_writers(root):
        return
    deadline = time.monotonic() + timeout
    while _temp_writers(root) and time.monotonic() < deadline:
        time.sleep(0.02)
    _signal(_temp_writers(root), signal.SIGTERM)
    term = time.monotonic() + 0.4
    while _temp_writers(root) and time.monotonic() < term:
        time.sleep(0.02)
    _signal(_temp_writers(root), signal.SIGKILL)
    gone = time.monotonic() + 0.5
    while _temp_writers(root) and time.monotonic() < gone:
        time.sleep(0.02)


def install_isolated_tempdirs() -> None:
    """Per-process temp dirs whose cleanup waits out a detached writer."""
    if getattr(tempfile, "_jovie_isolated_temp", False):
        return
    original = tempfile.TemporaryDirectory
    # CI runs 3.12+, where TemporaryDirectory accepts ignore_cleanup_errors
    # (3.10+) and delete (3.12). The lanes host qualifies locally on its own
    # ambient python3 (3.9), which accepts neither: forwarding both
    # unconditionally raised TypeError inside every TemporaryDirectory fixture
    # before any assertion ran (JOV-8913). Forward only what this interpreter
    # supports and refuse the delete=False semantics it cannot honor.
    forwards_ignore_cleanup_errors = sys.version_info >= (3, 10)
    forwards_delete = sys.version_info >= (3, 12)

    class IsolatedTemporaryDirectory(original):
        def __init__(self, suffix=None, prefix=None, dir=None,
                     ignore_cleanup_errors=False, *, delete=True):
            prefix = f"jovie-lanes-{os.getpid()}-" + (prefix or "")
            if delete is False and not forwards_delete:
                raise NotImplementedError(
                    "delete=False needs the 3.12 TemporaryDirectory contract")
            if forwards_ignore_cleanup_errors and forwards_delete:
                super().__init__(suffix, prefix, dir, ignore_cleanup_errors,
                                 delete=delete)
            elif forwards_ignore_cleanup_errors:
                super().__init__(suffix, prefix, dir, ignore_cleanup_errors)
            else:
                super().__init__(suffix, prefix, dir)

        @classmethod
        def _rmtree(cls, name, ignore_errors=False, repeated=False):
            del repeated
            # DispatchTest's sweep child is not a git process and its cwd is the
            # runner. Wait for it, then stop it, before the directory is removed.
            # ignore_errors stays the caller's teardown flag and is never set
            # here: a directory that remains still raises.
            reap_temp_writers(name)
            try:
                remove_tree(name)
            except OSError:
                if not ignore_errors:
                    raise

    tempfile.TemporaryDirectory = IsolatedTemporaryDirectory
    tempfile._jovie_isolated_temp = True
