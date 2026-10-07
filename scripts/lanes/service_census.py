"""Observe this lane service's legacy owners without draining unrelated work.

This is an additional fence, never a replacement for canonical lifecycle, slot,
identity and assignment locks. Callers hold those locks continuously and verify
the exact service is not running before and after this observation. No process
is stopped or declared idle. Unknown observation or process identity stays held.
"""
from __future__ import annotations

import os
import hashlib
import json
from pathlib import Path
import re
import subprocess


class CensusHeld(RuntimeError):
    pass


def require(value, message):
    if not value:
        raise CensusHeld(message)


def process_rows(result):
    require(result.returncode == 0 and not result.stderr, "process inventory unavailable")
    rows = {}
    for line in result.stdout.splitlines():
        # pid, parent, state, five lstart fields, then possibly spaced executable.
        fields = line.split(None, 8)
        require(len(fields) == 9 and fields[0].isdecimal() and fields[1].isdecimal(),
                "process inventory malformed")
        require(re.fullmatch(r"\d{2}:\d{2}:\d{2}", fields[6])
                and re.fullmatch(r"\d{4}", fields[7]), "process start identity malformed")
        pid = int(fields[0])
        require(pid not in rows, "duplicate process identity")
        if not fields[2].startswith("Z"):
            rows[pid] = {"parent": int(fields[1]), "started": tuple(fields[3:8]),
                         "tool": Path(fields[8]).name}
    require(rows, "empty process inventory")
    return rows


def argument_rows(result):
    require(result.returncode == 0 and not result.stderr, "argument inventory unavailable")
    rows = {}
    for line in result.stdout.splitlines():
        fields = line.split(None, 1)
        require(len(fields) == 2 and fields[0].isdecimal(), "argument inventory malformed")
        pid = int(fields[0])
        require(pid not in rows, "duplicate argument identity")
        rows[pid] = fields[1]
    return rows


def file_rows(result):
    require(result.returncode == 0 and not result.stderr and result.stdout.strip(),
            "open-file inventory unavailable")
    rows, pid, descriptor, access, names = {}, None, None, None, []
    def finish_file():
        if descriptor is None:
            return
        for name in names:
            if descriptor == "cwd":
                require(name.startswith("/") and rows[pid]["cwd"] is None,
                        "working directory unavailable or duplicated")
                rows[pid]["cwd"] = Path(name).resolve()
            elif name.startswith("/"):
                path = Path(name).resolve()
                if access in ("w", "u"):
                    rows[pid]["writable"].append(path)
                elif access != "r":
                    rows[pid]["unknownAccess"].append(path)
    for line in result.stdout.splitlines():
        if line.startswith("p"):
            finish_file()
            require(line[1:].isdecimal(), "open-file process identity malformed")
            pid, descriptor, access, names = int(line[1:]), None, None, []
            require(pid not in rows, "duplicate open-file process identity")
            rows[pid] = {"cwd": None, "writable": [], "unknownAccess": []}
        elif line.startswith("f"):
            finish_file()
            require(pid is not None and len(line) > 1, "open-file descriptor malformed")
            descriptor, access, names = line[1:], None, []
        elif line.startswith("a"):
            require(pid is not None and descriptor is not None and access is None,
                    "open-file access mode malformed or duplicated")
            access = line[1:]
        elif line.startswith("n"):
            require(pid is not None and descriptor is not None, "open-file path lacks owner")
            names.append(line[1:])
        else:
            raise CensusHeld("unsupported open-file record")
    finish_file()
    return rows


def under(path, root):
    return path == root or root in path.parents


def mentions(arguments, roots, cwd):
    # Shell arguments can contain a compound command. Match path boundaries,
    # never a same-prefix sibling repository or arbitrary basename such as node.
    if any(re.search(r"(?<![\w./-])" + re.escape(str(root)) + r"(?=$|[/\s'\";])",
                     arguments) for root in roots):
        return True
    # ps argument strings do not preserve shell quoting. Resolve path-like
    # tokens conservatively; never assume a symlink alias is disjoint.
    for token in re.findall(r"[^\s'\";]+", arguments):
        value = token.split("=", 1)[-1]
        if "/" not in value:
            continue
        path = Path(value)
        resolved = (path if path.is_absolute() else cwd / path).resolve()
        if any(under(resolved, root) for root in roots):
            return True
    return False


def classify(before, after, arguments, files, *, state, repo, owner_pid,
             observers=(), service_pids=(), extra_roots=(), final_arguments=None,
             final_files=None):
    """Prove disjoint ownership; no missing, changed or reused PID is exempted."""
    state, repo = Path(state).resolve(), Path(repo).resolve()
    require(state.is_absolute() and repo.is_absolute() and state != repo,
            "service scope malformed")
    excluded = {owner_pid}
    for pid, identity in observers:
        require(identity["tool"] == "ps" and identity["parent"] == owner_pid,
                "observation process identity unproven")
        for inventory in (before, after):
            require(pid not in inventory or inventory[pid] == identity,
                    "observation process identity changed")
        excluded.add(pid)
    current = {pid: row for pid, row in after.items() if pid not in excluded}
    require(all(before.get(pid) == row for pid, row in current.items()),
            "process identity changed during census")
    require(all(pid in arguments and pid in files and files[pid]["cwd"] is not None
                for pid in current), "live process observation incomplete")
    roots = (state, repo, *(Path(root).resolve() for root in extra_roots))
    def fingerprint(pid, argv, observed_files):
        require(pid in argv and pid in observed_files and observed_files[pid]["cwd"] is not None,
                "live process observation incomplete")
        info = observed_files[pid]
        return (argv[pid], info["cwd"],
                frozenset(path for path in info["writable"] if any(under(path, root) for root in roots)),
                frozenset(path for path in info.get("unknownAccess", [])
                          if any(under(path, root) for root in roots)))
    if final_arguments is not None or final_files is not None:
        require(final_arguments is not None and final_files is not None, "final path observation incomplete")
        require(all(fingerprint(pid, arguments, files) == fingerprint(pid, final_arguments, final_files)
                    for pid in current), "process paths or access changed during census")
    held = {}
    for pid, row in current.items():
        reasons = []
        if pid in service_pids:
            reasons.append("service-controller")
        if any(under(files[pid]["cwd"], root) for root in roots):
            reasons.append("affected-working-directory")
        if mentions(arguments[pid], roots, files[pid]["cwd"]):
            reasons.append("affected-command-path")
        if any(under(path, root) for path in files[pid]["writable"] for root in roots):
            reasons.append("writable-affected-resource")
        require(not any(under(path, root) for path in files[pid].get("unknownAccess", []) for root in roots),
                "affected file access unknown")
        # Old entrypoints can execute from another checkout with the default
        # host state. Their children remain affected even with disjoint cwd.
        if re.search(r"(?:^|[\s'\"])(?:/[^\s'\"]*/)?scripts/lanes/[^\s'\"]+",
                     arguments[pid]):
            reasons.append("lane-entrypoint")
        # ps flattens argv: a symlink path containing spaces cannot be safely
        # reconstructed. A productive entrypoint in that ambiguous path holds.
        if re.search(r"(?:^|[/\s'\"])(?:lane_runner|worktree_sweep|worktree_pool|"
                     r"disk_guard|codex_lane|claude_lane|reason_lane|hyperagent_lane|"
                     r"yc_corpus|autoscale)\.py(?:$|[\s'\"])",
                     arguments[pid]):
            reasons.append("productive-entrypoint")
        # An old unguarded sweep can die after spawning a worktree mutation
        # in a secondary repository, before writing any completion receipt.
        # Hold this finite operation rather than guessing that a disjoint cwd
        # proves it unrelated. Ordinary long-lived coding tools remain scoped.
        if re.search(r"(?:^|[\s'\"])(?:/[^\s'\"]*/)?git\s+.*?\bworktree\s+"
                     r"(?:add|remove|prune|repair|move|lock|unlock)(?:$|[\s'\"])",
                     arguments[pid]):
            reasons.append("unattributed-worktree-mutation")
        if reasons:
            held[pid] = reasons
    while True:
        descendants = {pid for pid, row in current.items()
                       if row["parent"] in held and pid not in held}
        if not descendants:
            break
        held.update({pid: ["affected-descendant"] for pid in descendants})
    require(not held, "affected service owners active: " + repr([
        {"pid": pid, "tool": current[pid]["tool"], "reasons": held[pid]}
        for pid in sorted(held)]))
    return {"schema": "jovie-lane-service-census/v1", "productiveOwners": 0,
            "cwdOwners": 0, "examinedProcesses": len(current),
            "unrelatedProcesses": len(current)}


def resource_roots(state, repo, cache_root, read):
    common = read(["git", "-C", str(repo), "rev-parse", "--path-format=absolute", "--git-common-dir"])
    require(common.returncode == 0 and not common.stderr, "repository identity unavailable")
    common_dir = Path(common.stdout.strip())
    require(common_dir.is_absolute(), "repository identity malformed")
    pool = Path(cache_root).resolve() / "worktree-pool" / hashlib.sha1(
        str(common_dir.resolve()).encode()).hexdigest()[:12]
    linked = read(["git", "-C", str(repo), "worktree", "list", "--porcelain", "-z"])
    require(linked.returncode == 0 and not linked.stderr, "linked worktree inventory unavailable")
    linked_paths = []
    for field in linked.stdout.split("\0"):
        if field.startswith("worktree "):
            path = Path(field[len("worktree "):])
            require(path.is_absolute(), "linked worktree identity malformed")
            linked_paths.append(path.resolve())
    require(linked_paths and Path(repo).resolve() in linked_paths,
            "configured repository absent from worktree inventory")
    # Sharing Git's object store does not make a manual checkout service-owned.
    # Current coding workspaces are state/worktrees; historical external paths
    # require a controller receipt rather than a guessed broad home directory.
    ledger = Path(state) / "runs/ledger.jsonl"
    require(ledger.is_file(), "legacy service ownership ledger unavailable")
    legacy = []
    try:
        for line in ledger.read_text().splitlines():
            value = json.loads(line)
            require(isinstance(value, dict), "legacy ownership record malformed")
            if not value.get("runId") or not value.get("provider"):
                continue
            for name in ("worktree", "preservedWorktree"):
                path = value.get(name)
                if path is None:
                    continue
                require(isinstance(path, str) and Path(path).is_absolute(),
                        "legacy worktree identity malformed")
                resolved = Path(path).resolve()
                if resolved in linked_paths:
                    legacy.append(resolved)
    except (OSError, ValueError) as error:
        raise CensusHeld("legacy service ownership ledger unreadable") from error
    return tuple(sorted(set((pool, *legacy))))


def observe(state, repo, *, run=None, owner_pid=None, service_pids=(), cache_root=None):
    """Public metadata only; never read environments, auth files or credentials."""
    uid, owner_pid = str(os.getuid()), os.getpid() if owner_pid is None else owner_pid
    def read(args):
        if run is not None:
            return run(args, capture_output=True, text=True, timeout=15)
        # Track only this census's observers, so its final ps cannot look like
        # an unknown new process. Never exempt an ancestor or whole tool family.
        with subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              text=True) as process:
            try:
                stdout, stderr = process.communicate(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()  # only our own public-metadata command
                process.communicate()
                raise
            result = subprocess.CompletedProcess(args, process.returncode, stdout, stderr)
            result.observation_pid = process.pid
            return result
    cache_root = Path.home() / ".cache/jovie" if cache_root is None else Path(cache_root)
    roots = resource_roots(state, repo, cache_root, read)
    first = read(["ps", "-U", uid, "-o", "pid=,ppid=,stat=,lstart=,comm="])
    arguments = read(["ps", "-U", uid, "-o", "pid=,args="])
    files = read(["lsof", "-nP", "-a", "-u", uid, "-F", "pfan"])
    final_arguments = read(["ps", "-U", uid, "-o", "pid=,args="])
    final_files = read(["lsof", "-nP", "-a", "-u", uid, "-F", "pfan"])
    last = read(["ps", "-U", uid, "-o", "pid=,ppid=,stat=,lstart=,comm="])
    require(resource_roots(state, repo, cache_root, read) == roots, "affected resource inventory changed")
    before, after = process_rows(first), process_rows(last)
    observers = []
    for result, inventory in ((first, before), (last, after)):
        pid = getattr(result, "observation_pid", None)
        require(pid is not None and pid in inventory, "observer generation unavailable")
        observers.append((pid, inventory[pid]))
    return classify(before, after, argument_rows(arguments),
                    file_rows(files), state=state, repo=repo, owner_pid=owner_pid,
                    observers=observers, service_pids=service_pids, extra_roots=roots,
                    final_arguments=argument_rows(final_arguments), final_files=file_rows(final_files))
