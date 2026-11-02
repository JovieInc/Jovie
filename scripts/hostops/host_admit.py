#!/usr/bin/env python3
"""One host admission gate: `host-admit <class> -- <cmd>`.

Every agent, lane worker, typecheck, test suite and git hook on an execution host asks this gate
before it starts. Admission compares the live 1-minute load average to the core count, checks
MemAvailable, and counts what already runs in the class (leases written by this gate plus matching
processes started outside it) against the per-class cap in host-admit.json. The check and the lease
write happen under one flock, so concurrent callers cannot both take the last seat.

Over capacity, the caller waits (bounded, jittered polling) and then defers with exit 75 and a
reason. It never runs silently. A class the host profile does not allow (Tim's Mac is
orchestration-only) is refused with exit 77. Every final decision appends one JSON line to
<stateDir>/admissions.jsonl (ts, class, host, load, mem, decision, wait_ms), so queue->admitted
p50/p95 come from `host-admit stats`.

On admission the CLI writes a lease for its own pid and exec()s the command, so the lease lives
exactly as long as the command (same pid); dead or reused pids are pruned on the next check.
In-process callers (lane_runner) use `admit(...)` and `Admission.release()`.

Exit codes: 0 admitted (or the command's own code), 64 usage, 75 deferred, 77 refused,
78 config error, 127 command not found.
"""
from __future__ import annotations

import argparse
import calendar
import fcntl
import json
import os
import platform
import random
import socket
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_CONFIG = HERE / "host-admit.json"
EXIT_USAGE, EXIT_DEFER, EXIT_REFUSE, EXIT_CONFIG, EXIT_NOTFOUND = 64, 75, 77, 78, 127
HELD_ENV = "HOST_ADMIT_HELD"
LOG_ROTATE_BYTES = 20 * 1024 * 1024


class ConfigError(Exception):
    pass


# ---------------------------------------------------------------- config

def load_config(path: str | os.PathLike | None = None) -> dict:
    path = Path(path or os.environ.get("HOST_ADMIT_CONFIG") or DEFAULT_CONFIG)
    try:
        config = json.loads(path.read_text())
    except (OSError, ValueError) as error:
        raise ConfigError(f"cannot read {path}: {error}") from error
    if not isinstance(config.get("classes"), dict) or not isinstance(config.get("profiles"), dict):
        raise ConfigError(f"{path}: needs 'classes' and 'profiles'")
    for name, spec in config["classes"].items():
        for key in ("maxConcurrent", "maxLoadPerCore", "minMemAvailableGiB", "waitS", "pollS"):
            if not isinstance(spec.get(key), (int, float)):
                raise ConfigError(f"{path}: class {name} needs numeric {key}")
    return config


def state_dir(config: dict) -> Path:
    raw = os.environ.get("HOST_ADMIT_STATE") or config.get("stateDir") or "~/.local/state/jovie-hostops"
    return Path(os.path.expanduser(raw))


def profile_name(config: dict, system: str | None = None) -> str:
    explicit = os.environ.get("HOST_ADMIT_PROFILE")
    if explicit:
        return explicit
    system = system or platform.system()
    return (config.get("profileByPlatform") or {}).get(system, "build")


def class_spec(config: dict, profile: str, cls: str) -> dict | None:
    """The class limits with the profile's per-class overrides applied."""
    base = config["classes"].get(cls)
    if base is None:
        return None
    return {**base, **((config["profiles"].get(profile) or {}).get("overrides") or {}).get(cls, {})}


# ---------------------------------------------------------------- host sample

def mem_available_gib(meminfo: str | None = None) -> float | None:
    if meminfo is None:
        try:
            meminfo = Path("/proc/meminfo").read_text()
        except OSError:
            return None
    for line in meminfo.splitlines():
        if line.startswith("MemAvailable:"):
            return round(int(line.split()[1]) / (1024 * 1024), 2)
    return None


@dataclass
class Proc:
    pid: int
    ppid: int
    start: str | None
    argv: list[str]


def _proc_stat(pid: int) -> tuple[int, str] | None:
    """(ppid, starttime) from /proc/<pid>/stat; comm may hold spaces, so split after the last ')'."""
    try:
        text = Path(f"/proc/{pid}/stat").read_text()
    except OSError:
        return None
    rest = text.rsplit(")", 1)[-1].split()
    try:
        return int(rest[1]), rest[19]
    except (IndexError, ValueError):
        return None


def process_start(pid: int) -> str | None:
    stat = _proc_stat(pid)
    return stat[1] if stat else None


def scan_processes() -> list[Proc]:
    procs = []
    proc_root = Path("/proc")
    if proc_root.is_dir():
        for entry in proc_root.iterdir():
            if not entry.name.isdigit():
                continue
            stat = _proc_stat(int(entry.name))
            if stat is None:
                continue
            try:
                argv = (entry / "cmdline").read_bytes().split(b"\0")
            except OSError:
                continue
            argv = [a.decode(errors="replace") for a in argv if a]
            if argv:
                procs.append(Proc(int(entry.name), stat[0], stat[1], argv))
        return procs
    # macOS: no /proc. Argument splitting is approximate, which is enough for the matchers.
    try:
        out = subprocess.run(["ps", "-axo", "pid=,ppid=,args="], capture_output=True, text=True, timeout=10).stdout
    except (OSError, subprocess.SubprocessError):
        return procs
    for line in out.splitlines():
        parts = line.split(None, 2)
        if len(parts) == 3 and parts[0].isdigit() and parts[1].isdigit():
            procs.append(Proc(int(parts[0]), int(parts[1]), None, parts[2].split()))
    return procs


def matches(argv: list[str], matcher: dict) -> bool:
    """`exe` is a basename list looked up in argv[0..2] (an interpreter may come first);
    `arg`, when set, must be the argument right after it."""
    names = matcher.get("exe") or []
    want = matcher.get("arg")
    for index, token in enumerate(argv[:3]):
        if os.path.basename(token) in names:
            if want is None or (index + 1 < len(argv) and argv[index + 1] == want):
                return True
    return False


def pid_alive(pid: int, start: str | None) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        pass
    if start is not None:
        now = process_start(pid)
        if now is not None and now != start:
            return False  # pid reused
    return True


# ---------------------------------------------------------------- leases

def lease_dir(state: Path, cls: str) -> Path:
    return state / "leases" / cls


def read_leases(state: Path, cls: str, alive=pid_alive, now: float | None = None) -> list[dict]:
    """Live leases for a class; prunes dead pids and expired reservations."""
    now = time.time() if now is None else now
    out = []
    folder = lease_dir(state, cls)
    if not folder.is_dir():
        return out
    for path in folder.glob("*.json"):
        try:
            lease = json.loads(path.read_text())
        except (OSError, ValueError):
            path.unlink(missing_ok=True)
            continue
        expires = lease.get("expiresAt")
        if expires is not None:
            live = now < float(expires)
        else:
            live = isinstance(lease.get("pid"), int) and alive(lease["pid"], lease.get("start"))
        if live:
            out.append(lease)
        else:
            path.unlink(missing_ok=True)
    return out


def write_lease(state: Path, cls: str, lease: dict) -> Path:
    folder = lease_dir(state, cls)
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{lease['pid']}.json" if lease.get("expiresAt") is None else f"r-{lease['token']}.json"
    path = folder / name
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(lease))
    os.replace(tmp, path)
    return path


def count_running(spec: dict, leases: list[dict], procs: list[Proc]) -> int:
    """Leases plus matching processes, collapsed to roots: a process whose ancestor is already
    counted in this class (a vitest worker under its runner, tsc under a leased pnpm) adds nothing."""
    by_pid = {p.pid: p for p in procs}
    counted = {l["pid"] for l in leases if l.get("expiresAt") is None and isinstance(l.get("pid"), int)}
    matchers = spec.get("processes") or []
    matched = {p.pid for p in procs if any(matches(p.argv, m) for m in matchers)} | counted
    roots = set()
    for pid in matched:
        seen, cursor, nested = set(), by_pid.get(pid), False
        while cursor is not None and cursor.ppid > 1 and cursor.ppid not in seen:
            seen.add(cursor.ppid)
            if cursor.ppid in matched:
                nested = True
                break
            cursor = by_pid.get(cursor.ppid)
        if not nested:
            roots.add(pid)
    reservations = sum(1 for l in leases if l.get("expiresAt") is not None)
    return len(roots) + reservations


# ---------------------------------------------------------------- decision

@dataclass
class Decision:
    decision: str  # admit | wait | refuse
    reason: str


def decide(cls: str, config: dict, profile: str, sample: dict) -> Decision:
    """Pure admission rule. sample: load1, cores, memGiB (None = unknown), running."""
    spec = class_spec(config, profile, cls)
    if spec is None:
        return Decision("refuse", f"unknown class {cls!r} (known: {', '.join(sorted(config['classes']))})")
    allowed = (config["profiles"].get(profile) or {}).get("classes") or []
    if cls not in allowed:
        return Decision("refuse", f"class {cls} is not admitted on profile {profile} "
                                  f"(allowed: {', '.join(allowed) or 'none'}); run it on an execution host or hosted CI")
    cap = int(spec["maxConcurrent"])
    if sample["running"] >= cap:
        return Decision("wait", f"{cls} at cap {sample['running']}/{cap}")
    ceiling = float(spec["maxLoadPerCore"]) * sample["cores"]
    if sample["load1"] > ceiling:
        return Decision("wait", f"load {sample['load1']:.1f} > {spec['maxLoadPerCore']}x{sample['cores']} cores = {ceiling:.0f}")
    floor = float(spec["minMemAvailableGiB"])
    if sample.get("memGiB") is not None and sample["memGiB"] < floor:
        return Decision("wait", f"MemAvailable {sample['memGiB']:.1f} GiB < {floor:g} GiB")
    return Decision("admit", f"{cls} {sample['running'] + 1}/{cap}, load {sample['load1']:.1f}/{ceiling:.0f}")


# ---------------------------------------------------------------- admission

@dataclass
class Admission:
    cls: str
    decision: str  # admit | defer | refuse | nested | dry-run
    reason: str
    wait_ms: int
    sample: dict
    lease_path: Path | None = None
    exit_code: int = 0
    extra: dict = field(default_factory=dict)

    @property
    def admitted(self) -> bool:
        return self.decision in ("admit", "nested")

    def release(self) -> None:
        if self.lease_path is not None:
            self.lease_path.unlink(missing_ok=True)
            self.lease_path = None


def take_sample(cls: str, config: dict, state: Path) -> dict:
    spec = config["classes"].get(cls) or {}
    cores = int(config.get("cores") or os.cpu_count() or 1)
    load1 = os.getloadavg()[0]
    leases = read_leases(state, cls)
    procs = scan_processes() if spec.get("processes") else []
    return {"load1": round(load1, 2), "cores": cores, "memGiB": mem_available_gib(),
            "running": count_running(spec, leases, procs)}


def log_decision(state: Path, row: dict) -> None:
    path = state / "admissions.jsonl"
    try:
        state.mkdir(parents=True, exist_ok=True)
        if path.exists() and path.stat().st_size > LOG_ROTATE_BYTES:
            os.replace(path, path.with_suffix(".jsonl.1"))
        with open(path, "a") as out:
            out.write(json.dumps(row, separators=(",", ":")) + "\n")
    except OSError as error:
        print(f"host-admit: cannot write admission log {path}: {error}", file=sys.stderr)


def admit(cls: str, *, pid: int | None = None, wait_s: float | None = None, dry_run: bool = False,
          reserve_ttl_s: float | None = None, config: dict | None = None, note: str = "",
          sampler=take_sample, sleep=time.sleep, clock=time.monotonic, quiet: bool = False) -> Admission:
    """Admit `cls` now or after a bounded wait. On admit a lease is written for `pid` (default:
    this process) or, with reserve_ttl_s, a time-limited reservation not bound to a pid."""
    config = config or load_config()
    state = state_dir(config)
    profile = profile_name(config)
    pid = os.getpid() if pid is None else pid
    held = [c for c in os.environ.get(HELD_ENV, "").split(",") if c]
    spec = class_spec(config, profile, cls) or {}
    budget = float(spec.get("waitS", 0) if wait_s is None else wait_s)
    poll = max(0.5, float(spec.get("pollS", 5)))
    started = clock()
    lock_path = state / "host-admit.lock"
    state.mkdir(parents=True, exist_ok=True)

    def finish(decision: str, reason: str, sample: dict, lease_path=None, code=0) -> Admission:
        result = Admission(cls, decision, reason, int((clock() - started) * 1000), sample, lease_path, code)
        log_decision(state, {"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "class": cls,
                             "host": socket.gethostname(), "profile": profile, "decision": decision,
                             "reason": reason, "load1": sample.get("load1"), "cores": sample.get("cores"),
                             "memGiB": sample.get("memGiB"), "running": sample.get("running"),
                             "cap": spec.get("maxConcurrent"), "wait_ms": result.wait_ms, "pid": pid,
                             "dryRun": dry_run, "note": note[:120]})
        return result

    if cls in held and cls in config["classes"]:
        return finish("nested", f"an ancestor already holds a {cls} lease", {})
    announced = 0.0
    while True:
        with open(lock_path, "a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            sample = sampler(cls, config, state)
            verdict = decide(cls, config, profile, sample)
            if verdict.decision == "refuse":
                code = EXIT_USAGE if cls not in config["classes"] else EXIT_REFUSE
                return finish("refuse", verdict.reason, sample, code=code)
            if verdict.decision == "admit":
                if dry_run:
                    return finish("dry-run", "would admit: " + verdict.reason, sample)
                lease = {"pid": pid, "start": process_start(pid), "class": cls, "admittedAt": time.time(),
                         "token": f"{pid}-{random.getrandbits(32):08x}", "note": note[:120]}
                if reserve_ttl_s is not None:
                    lease["expiresAt"] = time.time() + reserve_ttl_s
                return finish("admit", verdict.reason, sample, write_lease(state, cls, lease))
        waited = clock() - started
        if dry_run or waited >= budget:
            reason = f"deferred after {waited:.0f}s: {verdict.reason}"
            if dry_run:
                reason = "would wait: " + verdict.reason
            return finish("defer", reason, sample, code=EXIT_DEFER)
        if not quiet and (announced == 0.0 or waited - announced >= 30):
            announced = waited or 0.001
            print(f"host-admit: {cls} waiting ({verdict.reason}; {waited:.0f}s of {budget:.0f}s)", file=sys.stderr)
        sleep(min(budget - waited, poll * random.uniform(0.5, 1.5)))


# ---------------------------------------------------------------- stats / status

def percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    rank = max(0, min(len(ordered) - 1, int(round(pct / 100 * (len(ordered) - 1)))))
    return ordered[rank]


def stats(rows: list[dict], since_epoch: float = 0.0) -> dict:
    out: dict = {}
    for row in rows:
        if row.get("dryRun"):
            continue
        try:
            ts = calendar.timegm(time.strptime(row["ts"], "%Y-%m-%dT%H:%M:%SZ"))
        except (KeyError, ValueError):
            continue
        if ts < since_epoch:
            continue
        entry = out.setdefault(row.get("class", "?"), {"admit": 0, "defer": 0, "refuse": 0, "nested": 0, "_waits": []})
        entry[row.get("decision", "?")] = entry.get(row.get("decision", "?"), 0) + 1
        if row.get("decision") == "admit":
            entry["_waits"].append(float(row.get("wait_ms") or 0))
    for entry in out.values():
        waits = entry.pop("_waits")
        entry["waitP50ms"], entry["waitP95ms"] = percentile(waits, 50), percentile(waits, 95)
    return out


def read_log(state: Path) -> list[dict]:
    rows = []
    for path in (state / "admissions.jsonl.1", state / "admissions.jsonl"):
        try:
            for line in path.read_text().splitlines():
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    continue
        except OSError:
            continue
    return rows


def status(config: dict) -> dict:
    state = state_dir(config)
    profile = profile_name(config)
    classes = {}
    for cls in config["classes"]:
        sample = take_sample(cls, config, state)
        classes[cls] = {**sample, "cap": config["classes"][cls]["maxConcurrent"],
                        "wouldAdmit": decide(cls, config, profile, sample).__dict__}
    return {"host": socket.gethostname(), "profile": profile, "stateDir": str(state), "classes": classes}


# ---------------------------------------------------------------- CLI

USAGE = """host-admit <class> [--wait S] [--dry-run] [--quiet] [--note TEXT] -- <cmd> [args...]
host-admit reserve <class> [--ttl S] [--wait S]   time-limited seat for a launcher that forks the job
host-admit status [--json]                         live load, memory and per-class occupancy
host-admit stats [--hours H] [--json]              admit/defer counts and queue->admitted p50/p95
classes: agent, lane, typecheck, test-suite, hook-light (see host-admit.json)"""


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv or argv[0] in ("-h", "--help"):
        print(USAGE)
        return 0 if argv else EXIT_USAGE
    try:
        config = load_config()
    except ConfigError as error:
        print(f"host-admit: config error: {error}", file=sys.stderr)
        return EXIT_CONFIG
    command = []
    if "--" in argv:
        split = argv.index("--")
        argv, command = argv[:split], argv[split + 1:]
    head = argv[0]
    parser = argparse.ArgumentParser(prog="host-admit", usage=USAGE, add_help=False)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--hours", type=float, default=24.0)
    parser.add_argument("--wait", type=float)
    parser.add_argument("--ttl", type=float, default=90.0)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--note", default="")
    if head == "status":
        args = parser.parse_args(argv[1:])
        report = status(config)
        if args.json:
            print(json.dumps(report, indent=1))
        else:
            print(f"{report['host']} profile={report['profile']}")
            for cls, row in report["classes"].items():
                print(f"  {cls:11} {row['running']}/{row['cap']}  load {row['load1']}/{row['cores']} cores  "
                      f"mem {row['memGiB']} GiB  -> {row['wouldAdmit']['decision']}: {row['wouldAdmit']['reason']}")
        return 0
    if head == "stats":
        args = parser.parse_args(argv[1:])
        report = stats(read_log(state_dir(config)), time.time() - args.hours * 3600)
        if args.json:
            print(json.dumps(report, indent=1))
        else:
            for cls, row in sorted(report.items()):
                print(f"{cls:11} admit {row['admit']:4} defer {row['defer']:4} refuse {row['refuse']:3} "
                      f"nested {row['nested']:3}  wait p50 {row['waitP50ms']} ms  p95 {row['waitP95ms']} ms")
        return 0
    reserve = head == "reserve"
    if reserve:
        if len(argv) < 2:
            print(USAGE, file=sys.stderr)
            return EXIT_USAGE
        cls, rest = argv[1], argv[2:]
    else:
        cls, rest = head, argv[1:]
    try:
        args = parser.parse_args(rest)
    except SystemExit:
        return EXIT_USAGE
    dry_run = args.dry_run or os.environ.get("HOST_ADMIT_DRY_RUN") == "1"
    if not reserve and not command and not dry_run:
        print("host-admit: missing `-- <cmd>`\n" + USAGE, file=sys.stderr)
        return EXIT_USAGE
    note = args.note or " ".join(command)[:120]
    result = admit(cls, wait_s=args.wait, dry_run=dry_run, config=config, note=note, quiet=args.quiet,
                   reserve_ttl_s=args.ttl if reserve else None)
    if dry_run:
        print(json.dumps({"class": cls, "decision": result.decision, "reason": result.reason, **result.sample}))
        return result.exit_code
    if not result.admitted:
        print(f"host-admit: {cls} {result.decision}: {result.reason}", file=sys.stderr)
        return result.exit_code
    if reserve:
        return 0
    held = {c for c in os.environ.get(HELD_ENV, "").split(",") if c} | {cls}
    os.environ[HELD_ENV] = ",".join(sorted(held))
    try:
        os.execvp(command[0], command)
    except OSError as error:
        result.release()
        print(f"host-admit: cannot run {command[0]}: {error}", file=sys.stderr)
        return EXIT_NOTFOUND


if __name__ == "__main__":
    sys.exit(main())
