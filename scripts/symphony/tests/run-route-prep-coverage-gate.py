#!/usr/bin/env python3
"""Execute route-prep behavior suites and report coverage of the real scripts.

The probe and router keep their installable single-file form. Coverage is the
set of lines those processes actually run while the unittest suites drive them.
Importing a heredoc outside the suites is not a passing result.
"""
import dis
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PROBE = ROOT / "scripts/symphony/codex-account-probe.sh"
ROUTER = ROOT / "scripts/symphony/symphony-agent-router"
PROBE_SUITE = ROOT / "scripts/symphony/tests/codex-account-probe.test.py"
ROUTER_SUITE = ROOT / "scripts/symphony/tests/symphony-agent-router.test.py"

# Floors are the measured execution of these suites, not an import of the
# heredoc. They stay below the last full run by a few points so an unrelated
# branch that these tests never take cannot turn a real run into a miss, and
# high enough that a harness which never enters the changed logic fails.
MIN_PERCENT = {
    str(PROBE.relative_to(ROOT)): 75,
    str(ROUTER.relative_to(ROOT)): 85,
}
MIN_TESTS = {
    PROBE_SUITE.name: 26,
    ROUTER_SUITE.name: 17,
}
BASH_SKIP = re.compile(
    r"^(?:fi|then|do|done|else|elif|esac|\{|\}|\(|\)|;;)\s*(?:#.*)?$"
)


def executable_python_lines(source):
    lines = set()

    def walk(code):
        lines.update(line for _, line in dis.findlinestarts(code) if line)
        for const in code.co_consts:
            if isinstance(const, types.CodeType):
                walk(const)

    walk(compile(source, "<stdin>", "exec"))
    return lines


def code_ids(source):
    found = set()

    def walk(code):
        material = b"\0".join(
            (
                code.co_code,
                str(code.co_firstlineno).encode(),
                code.co_name.encode(),
            )
        )
        found.add(hashlib.sha256(material).hexdigest()[:16])
        for const in code.co_consts:
            if isinstance(const, types.CodeType):
                walk(const)

    walk(compile(source, "<stdin>", "exec"))
    return found


def heredocs(text):
    lines = text.splitlines()
    index = 0
    while index < len(lines):
        if "<<'PY'" in lines[index]:
            start = index + 2  # file line of the first heredoc body line
            body = []
            index += 1
            while index < len(lines) and lines[index] != "PY":
                body.append(lines[index])
                index += 1
            yield start, "\n".join(body) + ("\n" if body else "")
        index += 1


def bash_statement_lines(text):
    lines = text.splitlines()
    in_heredoc = False
    selected = set()
    for number, line in enumerate(lines, 1):
        if in_heredoc:
            if line == "PY":
                in_heredoc = False
            continue
        if "<<'PY'" in line:
            in_heredoc = True
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or BASH_SKIP.match(stripped):
            continue
        selected.add(number)
    return selected


def coverage_model(path):
    text = path.read_text()
    statements = bash_statement_lines(text)
    owners = {}
    for start, body in heredocs(text):
        for line in executable_python_lines(body):
            statements.add(start + line - 1)
        for code_id in code_ids(body):
            owners[code_id] = start
    return statements, owners


def write_tracers(root):
    py_dir = root / "py"
    bash_dir = root / "bash"
    py_dir.mkdir()
    bash_dir.mkdir()
    site = root / "site"
    site.mkdir()
    (site / "sitecustomize.py").write_text(
        """import atexit, hashlib, os, sys
from pathlib import Path
if sys.argv and sys.argv[0] in ("", "-"):
    counts = {}
    def _trace(frame, event, arg):
        if event == "line" and frame.f_code.co_filename in ("<stdin>", "<string>"):
            code = frame.f_code
            material = b"\\0".join((code.co_code, str(code.co_firstlineno).encode(), code.co_name.encode()))
            code_id = hashlib.sha256(material).hexdigest()[:16]
            counts[(code_id, frame.f_lineno)] = counts.get((code_id, frame.f_lineno), 0) + 1
        return _trace
    sys.settrace(_trace)
    def _dump():
        dest = os.environ.get("ROUTE_PREP_PY_TRACE_DIR")
        if not dest:
            return
        Path(dest, "%s.txt" % os.getpid()).write_text("\\n".join(
            "%s:%s" % item for item in counts))
    atexit.register(_dump)
"""
    )
    bash_dir_quoted = shlex.quote(str(bash_dir))
    (root / "bashenv.sh").write_text(
        "set -T\n"
        "trap 'printf \"%%s:%%s\\n\" \"${BASH_SOURCE[0]}\" \"$LINENO\" >> %s/$$.txt' DEBUG\n"
        % bash_dir_quoted
    )
    return site, py_dir, bash_dir


def run_suite(suite, env):
    result = subprocess.run(
        [sys.executable, str(suite)],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=600,
        check=False,
    )
    output = f"{result.stdout}{result.stderr}"
    sys.stdout.write(output)
    if not output.endswith("\n"):
        sys.stdout.write("\n")
    match = re.search(r"^Ran (\d+) tests\b", output, re.M)
    count = int(match.group(1)) if match else 0
    print(
        f"ROUTE_PREP_SUITE {suite.name} Ran {count} tests exit={result.returncode}",
        flush=True,
    )
    return count, result.returncode


def python_records(py_dir):
    records = []
    for path in py_dir.glob("*.txt"):
        text = path.read_text()
        if not text:
            continue
        for row in text.splitlines():
            code_id, line_text = row.split(":", 1)
            records.append((code_id, int(line_text)))
    return records


def python_hits(records, owners):
    executed = set()
    for code_id, line in records:
        start = owners.get(code_id)
        if start is None:
            continue
        executed.add(start + line - 1)
    return executed


def bash_hits(bash_dir, path):
    marker = str(path)
    executed = set()
    for trace in bash_dir.glob("*.txt"):
        text = trace.read_text()
        if not text:
            continue
        for row in text.splitlines():
            source, line_text = row.rsplit(":", 1)
            if source == marker or source.endswith("/" + path.name):
                executed.add(int(line_text))
    return executed


def require_line(path, executed, needle):
    found = [
        number
        for number, line in enumerate(path.read_text().splitlines(), 1)
        if needle in line
    ]
    if len(found) != 1:
        raise RuntimeError(f"{path.name} needle {needle!r} matched {found}")
    number = found[0]
    if number not in executed:
        raise RuntimeError(f"changed line did not run: {path.relative_to(ROOT)}:{number}: {needle}")
    return number


def report(path, statements, executed):
    hit = statements & executed
    percent = 100 * len(hit) / len(statements)
    relative = str(path.relative_to(ROOT))
    payload = {
        "file": relative,
        "percent": round(percent, 2),
        "executed": len(hit),
        "statements": len(statements),
    }
    print(
        "ROUTE_PREP_COVERAGE {file} executed={executed} statements={statements} percent={percent}".format(
            **payload
        ),
        flush=True,
    )
    floor = MIN_PERCENT[relative]
    if percent + 1e-9 < floor:
        missing = sorted(statements - executed)[:40]
        payload["missing_sample"] = missing
        print(json.dumps(payload), flush=True)
        raise RuntimeError(f"{relative} coverage {percent:.2f}% is below {floor}%")
    return payload


def main():
    with tempfile.TemporaryDirectory(prefix="route-prep-coverage-") as temporary:
        root = Path(temporary)
        site, py_dir, bash_dir = write_tracers(root)
        env = os.environ.copy()
        previous = env.get("PYTHONPATH")
        env["PYTHONPATH"] = (
            str(site) if not previous else str(site) + os.pathsep + previous
        )
        env["BASH_ENV"] = str(root / "bashenv.sh")
        env["ROUTE_PREP_PY_TRACE_DIR"] = str(py_dir)
        env["ROUTE_PREP_BASH_TRACE_DIR"] = str(bash_dir)
        # Isolated mode would skip sitecustomize and hide the child traces.
        env.pop("PYTHONSAFEPATH", None)
        env.pop("PYTHONNOUSERSITE", None)

        status = 0
        for suite in (PROBE_SUITE, ROUTER_SUITE):
            count, code = run_suite(suite, env)
            if count < MIN_TESTS[suite.name] or code != 0:
                status = code or 1
        if status != 0:
            raise SystemExit(status)

        models = {path: coverage_model(path) for path in (PROBE, ROUTER)}
        records = python_records(py_dir)
        executed_by_path = {
            path: python_hits(records, owners) | bash_hits(bash_dir, path)
            for path, (_statements, owners) in models.items()
        }
        results = []
        for path, (statements, _owners) in models.items():
            results.append(report(path, statements, executed_by_path[path]))
        probe_executed = executed_by_path[PROBE]
        router_executed = executed_by_path[ROUTER]
        mode_line = require_line(
            PROBE,
            probe_executed,
            'if os.environ.get("CODEX_ACCOUNT_PROBE_MODE", "recover") != "recover":',
        )
        if mode_line + 1 not in probe_executed:
            raise RuntimeError("missing-state refresh failure branch did not run")
        require_line(PROBE, probe_executed, "status, account = select_refresh_account(now)")
        require_line(ROUTER, router_executed, "CODEX_ACCOUNT_PROBE_MODE=refresh-freshness")
        require_line(ROUTER, router_executed, 'node "$auto_route"')
        print(json.dumps({"coverage": results}, indent=2), flush=True)


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as exc:
        print(f"ROUTE_PREP_COVERAGE_FAIL {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
