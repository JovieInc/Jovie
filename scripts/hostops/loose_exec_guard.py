#!/usr/bin/env python3
"""Loose-exec guard: flag scheduled jobs and PATH entries that run loose files.

Rule (Tim, 2026-10-31): every script a fleet host runs lives in a repo with CI
and tests, and is installed from that repo. A file a launchd agent, systemd
user unit, crontab line or PATH directory executes is allowed when it is:

  * outside $HOME (system, Homebrew, /Applications, /opt): package-managed;
  * under a package-manager prefix in $HOME (nvm, bun, pnpm, cargo, ...);
  * tracked by git in a checkout whose origin is a JovieInc GitHub repo; or
  * recorded in the hostops install receipt with a matching sha256 (the
    installers in scripts/hostops/ copy a reviewed file and record it, so a
    hand edit of the installed copy is flagged too).

Everything else is a violation. Usage:

  loose_exec_guard.py scan [--json] [--strict] [--report PATH]
  loose_exec_guard.py record <installed-path> <repo-relative-source>

`scan` prints violations (or JSON) and, with --report, writes the JSON report
plus one ledger line beside it, so the count is a tracked metric. --strict
exits 1 when any violation exists.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import platform
import plistlib
import re
import shlex
import socket
import subprocess
import sys
from pathlib import Path

HOME = Path(os.environ.get("LOOSE_EXEC_HOME", str(Path.home())))
RECEIPT = HOME / ".local/state/jovie-hostops/installed.json"
SCRIPT_SUFFIXES = {".sh", ".bash", ".zsh", ".py", ".mjs", ".cjs", ".js", ".ts", ".rb", ".pl"}
SHELLS = {"sh", "bash", "zsh", "dash"}
# Prefixes inside $HOME owned by a package manager or a vendor installer
# (GitHub's actions runner, Kimi, Grok, Composio). Executables here are not
# hand-written fleet scripts.
MANAGED_PREFIXES = (
    ".nvm/versions/",
    ".bun/bin/",
    ".bun/install/",
    "Library/pnpm/",
    ".local/share/pnpm/",
    ".cargo/bin/",
    ".rustup/",
    ".npm-global/",
    ".pyenv/",
    ".volta/",
    "go/bin/",
    ".deno/bin/",
    "Library/Application Support/Google/GoogleUpdater/",
    "Library/Application Support/Aside/AsideUpdater/",
    "actions-runner/",
    ".kimi-code/bin/",
    ".grok/bin/",
    ".composio/",
)
JOVIE_REMOTE = re.compile(r"github\.com[:/]JovieInc/", re.I)
# Compiled executables (ELF, Mach-O, universal) are vendor builds, not
# hand-written scripts; the rule is about scripts.
BINARY_MAGIC = (b"\x7fELF", b"\xcf\xfa\xed\xfe", b"\xce\xfa\xed\xfe", b"\xca\xfe\xba\xbe")


def is_compiled(path: Path) -> bool:
    try:
        with path.open("rb") as fh:
            return fh.read(4) in BINARY_MAGIC
    except OSError:
        return False


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 16), b""):
            h.update(block)
    return h.hexdigest()


def load_receipt() -> dict:
    try:
        return json.loads(RECEIPT.read_text())
    except (OSError, ValueError):
        return {}


def record(installed: str, source: str) -> None:
    path = Path(installed).expanduser().resolve()
    data = load_receipt()
    data[str(path)] = {
        "sha256": sha256(path),
        "source": source,
        "installedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    }
    RECEIPT.parent.mkdir(parents=True, exist_ok=True)
    tmp = RECEIPT.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
    tmp.replace(RECEIPT)


def git_tracked_in_jovie_repo(path: Path) -> bool:
    try:
        top = subprocess.run(
            ["git", "-C", str(path.parent), "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, timeout=10,
        )
        if top.returncode != 0:
            return False
        remote = subprocess.run(
            ["git", "-C", str(path.parent), "remote", "get-url", "origin"],
            capture_output=True, text=True, timeout=10,
        )
        if remote.returncode != 0 or not JOVIE_REMOTE.search(remote.stdout):
            return False
        tracked = subprocess.run(
            ["git", "-C", str(path.parent), "ls-files", "--error-unmatch", path.name],
            capture_output=True, text=True, timeout=10,
        )
        return tracked.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def classify(path: Path, receipt: dict) -> str | None:
    """Return None when allowed, else the violation reason."""
    if not path.exists():
        return "missing"
    real = path.resolve()
    try:
        rel = real.relative_to(HOME).as_posix()
    except ValueError:
        return None
    if any(rel.startswith(prefix) for prefix in MANAGED_PREFIXES) or is_compiled(real):
        return None
    entry = receipt.get(str(real))
    if entry:
        return None if entry.get("sha256") == sha256(real) else "receipt-sha-mismatch"
    if git_tracked_in_jovie_repo(real):
        return None
    return "loose"


def expand(token: str) -> str:
    token = token.replace("%h", str(HOME)).replace("$HOME", str(HOME)).replace("${HOME}", str(HOME))
    return str(HOME) + token[1:] if token.startswith("~/") else token


def looks_executed(token: str) -> bool:
    if not token.startswith("/"):
        return False
    p = Path(token)
    if p.suffix in SCRIPT_SUFFIXES:
        return True
    return p.is_file() and os.access(p, os.X_OK)


def executed_files(argv: list[str]) -> list[Path]:
    """Files a command line would execute, including inside `sh -c` bodies."""
    out: list[Path] = []
    tokens = [expand(t) for t in argv]
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if Path(tok).name in SHELLS and i + 2 < len(tokens) and tokens[i + 1] in ("-c", "-lc", "-ic"):
            try:
                inner = shlex.split(tokens[i + 2], comments=False)
            except ValueError:
                inner = tokens[i + 2].split()
            out.extend(executed_files([t.strip("\"';&|()") for t in inner]))
            i += 3
            continue
        if looks_executed(tok):
            out.append(Path(tok))
        i += 1
    return out


def launchd_entries() -> list[dict]:
    agents = HOME / "Library/LaunchAgents"
    loaded: set[str] = set()
    if platform.system() == "Darwin":
        res = subprocess.run(["launchctl", "list"], capture_output=True, text=True)
        loaded = {line.split("\t")[-1] for line in res.stdout.splitlines()[1:]}
    entries = []
    for plist in sorted(agents.glob("*.plist")) if agents.is_dir() else []:
        try:
            data = plistlib.loads(plist.read_bytes())
        except Exception:  # noqa: BLE001 - a corrupt plist is itself worth reporting
            entries.append({"source": "launchd", "id": plist.name, "argv": [], "error": "unparseable"})
            continue
        argv = list(data.get("ProgramArguments") or ([data["Program"]] if data.get("Program") else []))
        label = data.get("Label", plist.stem)
        entries.append({"source": "launchd", "id": label, "argv": argv, "active": label in loaded})
    return entries


def systemd_entries() -> list[dict]:
    units = HOME / ".config/systemd/user"
    entries = []
    for unit in sorted(units.glob("*.service")) if units.is_dir() else []:
        for line in unit.read_text(errors="replace").splitlines():
            if line.startswith(("ExecStart=", "ExecStartPre=", "ExecStartPost=")):
                cmd = line.split("=", 1)[1].lstrip("-@:+!")
                try:
                    argv = shlex.split(cmd)
                except ValueError:
                    argv = cmd.split()
                entries.append({"source": "systemd", "id": unit.name, "argv": argv})
    return entries


def cron_entries(text: str | None = None) -> list[dict]:
    if text is None:
        res = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
        text = res.stdout if res.returncode == 0 else ""
    entries = []
    for n, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#") or re.match(r"^[A-Z_][A-Z0-9_]*=", line):
            continue
        fields = line.split(None, 1 if line.startswith("@") else 5)
        cmd = fields[-1] if len(fields) > (1 if line.startswith("@") else 5) else ""
        try:
            argv = shlex.split(cmd)
        except ValueError:
            argv = cmd.split()
        entries.append({"source": "cron", "id": f"line {n}", "argv": argv})
    return entries


def path_violations(path_env: str, receipt: dict) -> list[dict]:
    found = []
    seen: set[str] = set()
    for entry in path_env.split(os.pathsep):
        d = Path(expand(entry))
        if not entry or str(d) in seen or not d.is_dir():
            continue
        seen.add(str(d))
        try:
            rel = d.resolve().relative_to(HOME).as_posix() + "/"
        except ValueError:
            continue
        if any(rel.startswith(prefix) for prefix in MANAGED_PREFIXES):
            continue
        loose = sorted(
            f.name for f in d.iterdir()
            if f.is_file() and os.access(f, os.X_OK) and classify(f, receipt) is not None
        )
        if loose:
            found.append({"source": "PATH", "id": str(d), "file": str(d), "reason": "loose", "files": loose})
    return found


def scan(path_env: str | None = None, cron_text: str | None = None) -> dict:
    receipt = load_receipt()
    violations = []
    entries = launchd_entries() + systemd_entries() + cron_entries(cron_text)
    for e in entries:
        if e.get("error"):
            violations.append({**e, "file": "", "reason": e["error"]})
            continue
        for f in executed_files(e["argv"]):
            reason = classify(f, receipt)
            if reason:
                violations.append({"source": e["source"], "id": e["id"], "active": e.get("active"),
                                   "file": str(f), "reason": reason})
    violations += path_violations(path_env if path_env is not None else os.environ.get("PATH", ""), receipt)
    return {
        "host": socket.gethostname(),
        "ts": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "checked": len(entries),
        "violationCount": len(violations),
        "violations": violations,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scan")
    s.add_argument("--json", action="store_true")
    s.add_argument("--strict", action="store_true")
    s.add_argument("--report")
    r = sub.add_parser("record")
    r.add_argument("installed")
    r.add_argument("source")
    args = ap.parse_args(argv)
    if args.cmd == "record":
        record(args.installed, args.source)
        return 0
    report = scan()
    if args.report:
        out = Path(args.report).expanduser()
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2) + "\n")
        with (out.parent / "ledger.jsonl").open("a") as fh:
            fh.write(json.dumps({k: report[k] for k in ("host", "ts", "checked", "violationCount")}) + "\n")
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        for v in report["violations"]:
            extra = f" ({len(v['files'])} loose: {', '.join(v['files'][:8])})" if v.get("files") else ""
            print(f"{v['source']:8} {v['reason']:20} {v['id']} -> {v['file']}{extra}")
        print(f"{report['violationCount']} violation(s) across {report['checked']} scheduled entries + PATH")
    return 1 if args.strict and report["violationCount"] else 0


if __name__ == "__main__":
    sys.exit(main())
