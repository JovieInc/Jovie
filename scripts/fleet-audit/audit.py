#!/usr/bin/env python3
"""Fleet audit trail: attributable, cheap records of every mutating gh / git push call.

Agents act on GitHub through one shared identity (Tim's PAT today, jovie-bot via the token
broker next), so GitHub's own audit log cannot say which agent did what. This shim sits in
front of `gh` and `git push` (see bin/gh, bin/git, install.sh) and:

  * classifies the call: read (exec'd straight through, never logged), mutating, or dangerous;
  * refuses dangerous calls without a reason (and, for workflow disables, a linked issue);
  * runs the real command, records its exit code, and for workflow enable/disable records the
    workflow state before and after;
  * appends one compact JSON event per mutating call to a local append-only spool;
  * flushes dangerous calls at once (the Worker alerts Summer); hosts without the ingest secret
    alert Summer directly over the agent mesh;
  * flushes the spool to the fleet-audit Worker (Cloudflare D1) at most every 5 minutes.

Reasons and issues come from `--audit-reason "..."` / `--audit-issue JOV-123` flags (stripped
before the real command runs) or the env vars JOVIE_AUDIT_REASON / JOVIE_AUDIT_ISSUE.

Logging failures never block work (fail open). Dangerous calls without a reason are refused
(fail closed). JOVIE_AUDIT_DISABLE=1 bypasses the shim entirely (tests only).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

STATE_DIR = Path(os.environ.get("JOVIE_AUDIT_STATE_DIR", Path.home() / ".local/state/jovie/audit"))
SPOOL = STATE_DIR / "spool.jsonl"
FLUSH_STAMP = STATE_DIR / "last-flush"
FLUSH_EVERY_S = 300
MAX_FIELD = 300  # chars; keeps events ~0.5 KB so a month stays far under the 100 MB budget
DEFAULT_URL = "https://jovie-fleet-audit.tim-fd8.workers.dev"
SHIM_DIR_MARKER = "jovie-audit-bin"

READ = "read"
MUTATING = "mutating"
DANGEROUS = "dangerous"

MUTATING_VERBS = {
    "add", "approve", "archive", "cancel", "close", "comment", "create", "delete", "deploy",
    "disable", "edit", "enable", "fork", "lock", "merge", "ready", "remove", "rename", "reopen",
    "rerun", "review", "run", "set", "sync", "transfer", "unarchive", "unlock", "upload",
    "dequeue", "enqueue",
}
DANGEROUS_API = [
    (re.compile(r"/actions/workflows/[^/]+/disable$"), {"PUT"}, "workflow.disable"),
    (re.compile(r"/rulesets(/\d+)?$"), {"POST", "PUT", "PATCH", "DELETE"}, "ruleset.edit"),
    (re.compile(r"/branches/[^/]+/protection(/.*)?$"), {"POST", "PUT", "PATCH", "DELETE"}, "branch_protection.edit"),
    (re.compile(r"/actions/secrets/[^/]+$"), {"DELETE"}, "secret.delete"),
    (re.compile(r"/environments/[^/]+/secrets/[^/]+$"), {"DELETE"}, "secret.delete"),
    (re.compile(r"^/?repos/[^/]+/[^/]+$"), {"DELETE"}, "repo.delete"),
    (re.compile(r"/hooks(/\d+)?$"), {"POST", "PATCH", "DELETE"}, "webhook.edit"),
    (re.compile(r"/actions/permissions(/.*)?$"), {"PUT", "PATCH", "DELETE"}, "actions_permissions.edit"),
]
DANGEROUS_GRAPHQL = {
    "updateBranchProtectionRule", "deleteBranchProtectionRule", "createBranchProtectionRule",
    "updateRepositoryRuleset", "deleteRepositoryRuleset", "createRepositoryRuleset",
}
PROTECTED_BRANCHES = {"main", "master", "production"}
NEEDS_ISSUE = {"workflow.disable"}
VALUE_FLAGS = {
    "-R", "--repo", "-X", "--method", "-f", "-F", "--field", "--raw-field", "-H", "--header",
    "--input", "-q", "--jq", "-t", "--template", "-b", "--body", "--title", "-m", "--message",
    "--json", "--ref", "-L", "--limit", "--base", "--head", "--label", "--add-label",
    "--remove-label", "--reason", "--subject", "--body-file", "-B", "--env", "-e", "--org", "-o",
    "--app", "-a", "--hostname", "--workflow", "-w", "--branch", "--state", "--search", "-S",
    "--author", "--match-head-commit", "--assignee", "--reviewer", "--milestone", "--comment",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def clip(value, limit: int = MAX_FIELD):
    if value is None:
        return None
    s = str(value)
    return s if len(s) <= limit else s[: limit - 1] + "…"


# ---------------------------------------------------------------- classification

def _flag_value(args: list[str], *names: str) -> str | None:
    for i, a in enumerate(args):
        for n in names:
            if a == n and i + 1 < len(args):
                return args[i + 1]
            if n.startswith("--") and a.startswith(n + "="):
                return a.split("=", 1)[1]
            if not n.startswith("--") and a.startswith(n) and len(a) > len(n) and not a.startswith("--"):
                return a[len(n):]
    return None


def _positional(args: list[str]) -> list[str]:
    out, skip = [], False
    for a in args:
        if skip:
            skip = False
            continue
        if a in VALUE_FLAGS:
            skip = True
            continue
        if a.startswith("-"):
            continue
        out.append(a)
    return out


def _repo_from_path(path: str) -> str | None:
    m = re.match(r"^/?repos/([^/]+/[^/]+)", path)
    return m.group(1) if m else None


def classify_gh(args: list[str]) -> dict:
    """Return {kind, action, target, repo} for a gh argv (without the leading 'gh')."""
    repo = _flag_value(args, "-R", "--repo")
    pos = _positional(args)
    if not pos:
        return {"kind": READ, "action": "gh.bare", "target": None, "repo": repo}
    group = pos[0]

    if group == "api":
        endpoint = pos[1] if len(pos) > 1 else ""
        method = (_flag_value(args, "-X", "--method") or "").upper()
        has_fields = any(a in ("-f", "-F", "--field", "--raw-field", "--input") or
                         a.startswith(("--field=", "--raw-field=", "--input=")) for a in args)
        if endpoint == "graphql":
            body = " ".join(args)
            if re.search(r"\bmutation\b", body):
                m = re.search(r"mutation[^{]*\{\s*(\w+)", body)
                name = m.group(1) if m else "graphql"
                kind = DANGEROUS if name in DANGEROUS_GRAPHQL else MUTATING
                tm = re.search(r'(pullRequestId|repositoryId|rulesetId|id)\s*:\s*\\?"([^"\\]+)', body)
                return {"kind": kind, "action": f"graphql.{name}", "target": tm.group(2) if tm else None,
                        "repo": repo}
            return {"kind": READ, "action": "graphql.query", "target": None, "repo": repo}
        if not method:
            method = "POST" if has_fields else "GET"
        if method in ("GET", "HEAD"):
            return {"kind": READ, "action": f"api.{method}", "target": endpoint, "repo": repo}
        path = endpoint.split("?", 1)[0]
        for pat, methods, action in DANGEROUS_API:
            if method in methods and pat.search(path):
                return {"kind": DANGEROUS, "action": action, "target": path,
                        "repo": repo or _repo_from_path(path)}
        return {"kind": MUTATING, "action": f"api.{method}", "target": path,
                "repo": repo or _repo_from_path(path)}

    verb = pos[1] if len(pos) > 1 else ""
    target = pos[2] if len(pos) > 2 else None
    if group in ("auth", "ruleset", "search", "browse", "status", "help", "completion", "extension", "alias"):
        return {"kind": READ, "action": f"{group}.{verb}", "target": target, "repo": repo}
    if group == "workflow":
        if verb == "disable":
            return {"kind": DANGEROUS, "action": "workflow.disable", "target": target, "repo": repo}
        if verb in ("enable", "run"):
            return {"kind": MUTATING, "action": f"workflow.{verb}", "target": target, "repo": repo}
        return {"kind": READ, "action": f"workflow.{verb}", "target": target, "repo": repo}
    if group == "pr" and verb == "merge" and "--admin" in args:
        return {"kind": DANGEROUS, "action": "pr.merge_admin", "target": target, "repo": repo}
    if group in ("secret", "variable") and verb in ("delete", "remove"):
        return {"kind": DANGEROUS, "action": f"{group}.delete", "target": target, "repo": repo}
    if group == "repo" and verb in ("delete", "archive"):
        return {"kind": DANGEROUS, "action": f"repo.{verb}", "target": target or repo, "repo": repo}
    if verb in MUTATING_VERBS:
        return {"kind": MUTATING, "action": f"{group}.{verb}", "target": target, "repo": repo}
    return {"kind": READ, "action": f"{group}.{verb}", "target": target, "repo": repo}


def classify_git_push(args: list[str]) -> dict:
    """args is the argv after 'push'."""
    force = any(a in ("-f", "--force", "--force-with-lease", "--force-if-includes") or
                a.startswith("--force-with-lease=") for a in args)
    delete = "--delete" in args or "-d" in args
    pos = [a for a in args if not a.startswith("-")]
    remote = pos[0] if pos else "origin"
    targets, danger = [], False
    for spec in pos[1:]:
        plus = spec.startswith("+")
        parts = spec.lstrip("+").split(":")
        dst = (parts[-1] or parts[0]).replace("refs/heads/", "")
        targets.append(dst)
        if dst in PROTECTED_BRANCHES and (force or plus or delete or spec.startswith(":")):
            danger = True
    if not pos[1:] and force:
        cur = _current_branch()
        targets.append(cur or "HEAD")
        danger = danger or cur in PROTECTED_BRANCHES
    action = "git.push_delete" if delete else ("git.push_force" if force else "git.push")
    return {"kind": DANGEROUS if danger else MUTATING, "action": action,
            "target": ",".join(targets) or "HEAD", "repo": remote}


def _current_branch() -> str | None:
    git = real_binary("git")
    if not git:
        return None
    try:
        out = subprocess.run([git, "symbolic-ref", "--short", "-q", "HEAD"], capture_output=True,
                             text=True, timeout=5)
        return out.stdout.strip() or None
    except (OSError, subprocess.TimeoutExpired):
        return None


# ---------------------------------------------------------------- identity

def actor() -> tuple[str, str | None]:
    env = os.environ
    session = (env.get("JOVIE_AGENT_SESSION") or env.get("CLAUDE_CODE_SESSION_ID") or
               env.get("CODEX_SESSION_ID") or env.get("CODEX_THREAD_ID") or env.get("HERMES_SESSION_ID"))
    if env.get("JOVIE_AGENT_ID"):
        return env["JOVIE_AGENT_ID"], session
    if env.get("GITHUB_ACTIONS") == "true":
        return f"gha:{env.get('GITHUB_WORKFLOW', '?')}", env.get("GITHUB_RUN_ID")
    if env.get("CLAUDECODE") == "1" or env.get("CLAUDE_CODE_SESSION_ID"):
        return ("claude-subagent" if env.get("CLAUDE_CODE_CHILD_SESSION") == "1" else "claude"), session
    if any(k.startswith("CODEX_") for k in env):
        return "codex", session
    if env.get("JOVIE_AGENT_PROFILE"):
        return f"lane:{env['JOVIE_AGENT_PROFILE']}", session
    if env.get("AI_AGENT"):
        return env["AI_AGENT"].split("_")[0], session
    return f"unknown:{_parent_name()}", session


def _parent_name() -> str:
    try:
        out = subprocess.run(["ps", "-o", "comm=", "-p", str(os.getppid())], capture_output=True,
                             text=True, timeout=3)
        return Path(out.stdout.strip()).name or "?"
    except (OSError, subprocess.TimeoutExpired):
        return "?"


# ---------------------------------------------------------------- argv handling

def extract_audit_flags(argv: list[str]) -> tuple[list[str], str | None, str | None]:
    rest, reason, issue, i = [], None, None, 0
    while i < len(argv):
        a = argv[i]
        if a in ("--audit-reason", "--audit-issue") and i + 1 < len(argv):
            if a == "--audit-reason":
                reason = argv[i + 1]
            else:
                issue = argv[i + 1]
            i += 2
            continue
        if a.startswith("--audit-reason="):
            reason = a.split("=", 1)[1]
        elif a.startswith("--audit-issue="):
            issue = a.split("=", 1)[1]
        else:
            rest.append(a)
        i += 1
    reason = reason or os.environ.get("JOVIE_AUDIT_REASON") or None
    issue = issue or os.environ.get("JOVIE_AUDIT_ISSUE") or None
    return rest, reason, issue


def _real_path() -> str:
    return os.pathsep.join(p for p in os.environ.get("PATH", "").split(os.pathsep) if SHIM_DIR_MARKER not in p)


def real_binary(name: str) -> str | None:
    return os.environ.get(f"JOVIE_AUDIT_REAL_{name.upper()}") or shutil.which(name, path=_real_path())


# ---------------------------------------------------------------- state probes

def workflow_state(gh: str, repo: str | None, workflow: str | None) -> str | None:
    if not workflow:
        return None
    cmd = [gh, "workflow", "view", workflow, "--json", "state", "-q", ".state"]
    if repo:
        cmd += ["-R", repo]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        return out.stdout.strip() or None
    except (OSError, subprocess.TimeoutExpired):
        return None


# ---------------------------------------------------------------- spool + transport

def remote_repo(remote: str = "origin") -> str | None:
    """owner/name of a git remote in the cwd, so events carry an exact repo (the Worker never
    attributes an event whose repository it cannot resolve exactly)."""
    git = real_binary("git")
    if not git:
        return None
    try:
        out = subprocess.run([git, "remote", "get-url", remote], capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        return None
    m = re.search(r"github\.com[:/]([\w.-]+/[\w.-]+?)(?:\.git)?/?$", out.stdout.strip())
    return m.group(1) if m else None


def resolve_repo(cls: dict, tool: str) -> dict:
    repo = cls.get("repo")
    if tool == "git":
        return {**cls, "repo": remote_repo(repo or "origin") or repo}
    if not repo:
        return {**cls, "repo": os.environ.get("GH_REPO") or remote_repo()}
    return cls


def build_event(cls: dict, reason, issue, tool: str) -> dict:
    agent, session = actor()
    return {
        "id": str(uuid.uuid4()),
        "ts": now_iso(),
        "actor_agent": clip(agent, 80),
        "session_id": clip(session, 80),
        "host": clip(os.environ.get("JOVIE_AUDIT_HOST") or socket.gethostname().split(".")[0], 60),
        "repo": clip(cls.get("repo"), 120),
        "target": clip(cls.get("target")),
        "action": clip(cls["action"], 80),
        "danger": 1 if cls["kind"] == DANGEROUS else 0,
        "reason": clip(reason),
        "issue": clip(issue, 120),
        "outcome": None,
        "before": None,
        "after": None,
        "source": f"{tool}-shim",
    }


def append_spool(event: dict) -> None:
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        line = json.dumps(event, separators=(",", ":"), ensure_ascii=False) + "\n"
        fd = os.open(SPOOL, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        try:
            os.write(fd, line.encode())  # one write < PIPE_BUF-ish: whole lines, no torn JSONL
        finally:
            os.close(fd)
    except OSError:
        pass


def _secret() -> str | None:
    if os.environ.get("FLEET_AUDIT_INGEST_SECRET"):
        return os.environ["FLEET_AUDIT_INGEST_SECRET"]
    p = Path(os.environ.get("FLEET_AUDIT_SECRET_FILE", Path.home() / ".config/jovie/fleet-audit.secret"))
    try:
        return p.read_text().strip() or None
    except OSError:
        return None


def sign(body: bytes, secret: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def post_json(path: str, body: bytes, secret: str, timeout: int = 15) -> tuple[int, bytes]:
    req = urllib.request.Request(
        os.environ.get("FLEET_AUDIT_URL", DEFAULT_URL).rstrip("/") + path, data=body, method="POST",
        headers={"content-type": "application/json", "x-fleet-audit-signature": sign(body, secret),
                 "user-agent": "jovie-fleet-audit/1"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read()


def flush(force: bool = False) -> int:
    """Ship spooled events to the Worker. Returns the number of events shipped."""
    secret = _secret()
    if not secret:
        return 0
    try:
        if not force and FLUSH_STAMP.exists() and time.time() - FLUSH_STAMP.stat().st_mtime < FLUSH_EVERY_S:
            return 0
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        FLUSH_STAMP.touch()
        if SPOOL.exists():
            os.replace(SPOOL, STATE_DIR / f"sending-{int(time.time())}-{os.getpid()}.jsonl")
    except OSError:
        return 0
    shipped = 0
    for path in sorted(STATE_DIR.glob("sending-*.jsonl")):
        rows = [ln for ln in path.read_text(errors="replace").splitlines() if ln.strip()]
        ok = True
        for i in range(0, len(rows), 200):
            body = ("[" + ",".join(rows[i:i + 200]) + "]").encode()
            try:
                status, _ = post_json("/v1/events", body, secret)
                ok = 200 <= status < 300
            except Exception:  # noqa: BLE001 - keep the file for the next flush
                ok = False
            if not ok:
                break
            shipped += len(rows[i:i + 200])
        if not ok:
            break
        path.unlink(missing_ok=True)
    return shipped


def _spawn_flush(force: bool) -> None:
    if force:
        try:
            FLUSH_STAMP.unlink(missing_ok=True)
        except OSError:
            pass
    try:
        subprocess.Popen([sys.executable, "-I", os.path.abspath(__file__), "flush-if-due"],
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         start_new_session=True)
    except OSError:
        pass


def alert_summer(event: dict) -> None:
    """Real-time alert for dangerous actions over the agent mesh (`jovie mesh send`)."""
    jovie = shutil.which("jovie", path=_real_path())
    if not jovie:
        return
    text = (f"[fleet-audit] DANGEROUS {event['action']} on {event.get('repo') or '?'} "
            f"{event.get('target') or ''} by {event['actor_agent']} on {event['host']} "
            f"(session {event.get('session_id') or '?'}). Reason: {event.get('reason')}. "
            f"Issue: {event.get('issue')}. Outcome: {event.get('outcome')}. Event {event['id']}.")
    try:
        subprocess.Popen([jovie, "mesh", "send", "--to", "summer", text], stdin=subprocess.DEVNULL,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    except OSError:
        pass


# ---------------------------------------------------------------- doppler guard
#
# 2026-10-29 incident: `doppler secrets delete NAME --project jovie-web --config prd --yes` prints
# the whole remaining config table WITH VALUES. It ran twice from an agent-assisted terminal and
# production values landed in a Claude transcript. Rules for agent / terminal-assist contexts:
#   * secrets set|delete|upload: run with stdout discarded; only names are echoed and logged.
#   * secrets (list), secrets download, secrets get without --plain: refused (values in output).
#     Use `doppler secrets --only-names`.
#   * secrets get --plain: refused when stdout is a TTY; it must feed another command.
# Plain human terminals (no agent markers) keep normal doppler behaviour, mutations still logged.

DOPPLER_MUTATE = {"set", "delete", "upload"}
NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
DOPPLER_VALUE_FLAGS = {"-p", "--project", "-c", "--config", "--token", "--scope", "--format",
                       "--api-host", "--dashboard-host", "--configuration", "--type", "--visibility"}


def agent_context() -> bool:
    env = os.environ
    return bool(env.get("CLAUDECODE") or env.get("CLAUDE_CODE_SESSION_ID") or env.get("JOVIE_AGENT_ID")
                or env.get("JOVIE_AUDIT_STRICT") == "1" or env.get("GITHUB_ACTIONS")
                or any(k.startswith("CODEX_") for k in env))


def _doppler_positional(args: list[str]) -> list[str]:
    out, skip = [], False
    for a in args:
        if skip:
            skip = False
            continue
        if a in DOPPLER_VALUE_FLAGS:
            skip = True
            continue
        if a.startswith("-"):
            continue
        out.append(a)
    return out


def doppler_secret_names(verb: str, pos_after_verb: list[str]) -> list[str]:
    """Names only. `set A=1 B=2` -> [A, B]; `set A value` -> [A]; `delete A B` -> [A, B]."""
    if verb == "set":
        if any("=" in p for p in pos_after_verb):
            return [p.split("=", 1)[0] for p in pos_after_verb if "=" in p and NAME_RE.match(p.split("=", 1)[0])]
        return [pos_after_verb[0]] if pos_after_verb and NAME_RE.match(pos_after_verb[0]) else []
    if verb == "upload":
        return ["<file>"]
    return [p for p in pos_after_verb if NAME_RE.match(p)]


def classify_doppler(args: list[str]) -> dict:
    pos = _doppler_positional(args)
    project = _flag_value(args, "-p", "--project")
    config = _flag_value(args, "-c", "--config")
    where = "/".join(x for x in (project, config) if x) or None
    if not pos or pos[0] != "secrets":
        return {"kind": READ, "action": f"doppler.{pos[0] if pos else ''}", "target": None, "repo": where}
    verb = pos[1] if len(pos) > 1 else ""
    if verb in DOPPLER_MUTATE:
        names = doppler_secret_names(verb, pos[2:])
        return {"kind": MUTATING, "action": f"doppler.secrets.{verb}", "target": ",".join(names) or None,
                "repo": where, "silence": True}
    only_names = "--only-names" in args
    if verb in ("", "download") and not only_names:
        return {"kind": "refuse", "action": f"doppler.secrets.{verb or 'list'}", "repo": where,
                "why": "prints secret values; use `doppler secrets --only-names`"}
    if verb == "get":
        if "--plain" not in args and "--raw" not in args:
            return {"kind": "refuse", "action": "doppler.secrets.get", "repo": where,
                    "why": "the table includes the value; use `--plain` piped into the consuming command"}
        return {"kind": READ, "action": "doppler.secrets.get_plain", "target": None, "repo": where,
                "tty_check": True}
    return {"kind": READ, "action": f"doppler.secrets.{verb}", "target": None, "repo": where}


# ---------------------------------------------------------------- entrypoints

def refuse(msg: str) -> int:
    sys.stderr.write(f"fleet-audit: refused: {msg}\n")
    return 64


def run_wrapped(tool: str, argv: list[str]) -> int:
    real = real_binary(tool)
    if not real:
        sys.stderr.write(f"fleet-audit: real {tool} not found on PATH\n")
        return 127
    argv, reason, issue = extract_audit_flags(argv)
    if os.environ.get("JOVIE_AUDIT_DISABLE") == "1":
        os.execv(real, [real, *argv])

    try:
        if tool == "gh":
            cls = classify_gh(argv)
        elif tool == "git" and argv[:1] == ["push"]:
            cls = classify_git_push(argv[1:])
        elif tool == "doppler":
            cls = classify_doppler(argv)
        else:
            cls = {"kind": READ}
    except Exception:  # noqa: BLE001 - a classifier bug must never block work
        # Never echo doppler argv (it can hold values); other tools keep a clipped argv as target.
        cls = {"kind": MUTATING, "action": f"{tool}.unclassified",
               "target": None if tool == "doppler" else clip(" ".join(argv)), "repo": None,
               "silence": tool == "doppler"}

    if tool == "doppler" and agent_context():
        if cls["kind"] == "refuse":
            return refuse(f"{cls['action']} {cls['why']} (secret values must never reach agent output).")
        if cls.get("tty_check") and sys.stdout.isatty():
            return refuse("doppler secrets get --plain to a terminal; pipe it into the command that needs it.")
    elif cls["kind"] == "refuse":
        cls = {**cls, "kind": READ}  # plain human terminal: allowed, not logged

    if cls["kind"] == READ:
        os.execv(real, [real, *argv])

    if cls.get("silence"):
        # Discard stdout: doppler prints the remaining config table (values) after a mutation.
        event = build_event(resolve_repo(cls, tool), reason, issue, tool)
        rc = subprocess.call([real, *argv], stdout=subprocess.DEVNULL)
        event["outcome"] = "ok" if rc == 0 else f"exit:{rc}"
        append_spool(event)
        sys.stderr.write(f"fleet-audit: {cls['action']} {cls.get('target') or ''} in {cls.get('repo') or '?'}: "
                         f"{event['outcome']} (output suppressed; values never printed)\n")
        _spawn_flush(force=False)
        return rc

    if cls["kind"] == DANGEROUS:
        if not reason or len(reason.strip()) < 8:
            return refuse(f"{cls['action']} needs a reason: add --audit-reason \"why\" (or JOVIE_AUDIT_REASON).")
        if cls["action"] in NEEDS_ISSUE and not issue:
            return refuse(f"{cls['action']} needs a linked issue that names who re-enables it: add "
                          "--audit-issue JOV-123|<issue url> (or JOVIE_AUDIT_ISSUE).")

    event = build_event(resolve_repo(cls, tool), reason, issue, tool)
    probe = tool == "gh" and cls["action"] in ("workflow.disable", "workflow.enable")
    if probe:
        event["before"] = workflow_state(real, cls.get("repo"), cls.get("target"))
    rc = subprocess.call([real, *argv])
    event["outcome"] = "ok" if rc == 0 else f"exit:{rc}"
    if probe:
        event["after"] = workflow_state(real, cls.get("repo"), cls.get("target"))
    append_spool(event)
    if cls["kind"] == DANGEROUS and not _secret():
        alert_summer(event)  # no Worker path on this host yet: alert Summer directly
    _spawn_flush(force=cls["kind"] == DANGEROUS)  # the Worker alerts Summer on ingest
    return rc


def local_who(target: str, limit: int = 50) -> int:
    rows = []
    for path in [*sorted(STATE_DIR.glob("sending-*.jsonl")), SPOOL]:
        if not path.exists():
            continue
        for ln in path.read_text(errors="replace").splitlines():
            try:
                ev = json.loads(ln)
            except ValueError:
                continue
            if target in (ev.get("target") or "") or target in (ev.get("repo") or ""):
                rows.append(ev)
    for ev in rows[-limit:]:
        print(f"{ev['ts']}  {ev['actor_agent']:<16} {ev['host']:<10} {ev['action']:<22} "
              f"{ev.get('target') or ''}  reason={ev.get('reason')!r} outcome={ev.get('outcome')}")
    return 0


def main(argv: list[str]) -> int:
    if not argv:
        sys.stderr.write("usage: audit.py wrap <gh|git> ARGS... | flush | flush-if-due | who TARGET\n")
        return 2
    cmd, rest = argv[0], argv[1:]
    if cmd == "wrap" and rest:
        return run_wrapped(rest[0], rest[1:])
    if cmd in ("flush", "flush-if-due"):
        n = flush(force=cmd == "flush")
        if cmd == "flush":
            print(n)
        return 0
    if cmd == "who" and rest:
        return local_who(rest[0])
    sys.stderr.write(f"unknown command {cmd}\n")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
