"""Codex Cloud lane adapter (JOV-10357): dormant, draft-only, disabled by default.

Every external effect is gated on LANES_CLOUD_ENABLED (unset = no provider call, no
ledger write, no network). The dispatcher (lane_runner.run_issue) submits a task, and
the worker's reconciliation turn drives status -> collect -> authorize -> publish.

Authority model:
- Trailers, PR bodies and authors are forgeable provenance, never authority.
- The candidate patch is applied and authorized inside a credential-free quarantine
  (bare temp repo, empty HOME, no GH/SSH/CODEX env); only (baseSha, candTree) crosses
  to the trusted publisher, which fetches the objects, builds exactly one commit
  (commit-tree, single parent = baseSha) and pushes an expected-absent lease to an
  explicit validated https://github.com/JovieInc/Jovie URL. Candidate files are never
  checked out where credentials are present.
- Publication is DRAFT ONLY: a fixed-template PR body, no model text, no @mentions,
  no closing keywords, and promotion out of draft is human-only. is_cloud_origin()
  blocks every ordinary adoption/repair/ready path for cloud-origin PRs.
- Residual risk (documented, activation-gated): a draft PR still runs the repository's
  unchanged CI workflows before review. Activation requires evidence those jobs cannot
  reach privileged secrets, sensitive self-hosted state or publication authority; that
  evidence belongs on the activation checklist, not to this module. Remote status is
  only ever parsed from the anchored first-line grammar, never from summaries or titles.
"""
from __future__ import annotations

import fcntl
import json
import math
import os
import re
import select
import shutil
import subprocess
import sys
import tempfile
import time
import unicodedata
from pathlib import Path

REPO = "JovieInc/Jovie"
DEFAULT_PUSH_URL = "https://github.com/JovieInc/Jovie.git"
PUSH_URL_RE = re.compile(r"https://github\.com/JovieInc/Jovie(?:\.git)?")
HEX40 = re.compile(r"[0-9a-f]{40}")

LEDGER_DEFAULT = Path.home() / ".local/state/jovie-lanes/cloud-lane.jsonl"
POLICY_PATH = Path(__file__).with_name("cloud-sensitive-paths.json")

OPT_IN_LABEL = "cloud-lane"
DENY_LABELS = {"auth", "billing", "infra", "security", "migration", "codex-blocked", "no-cloud",
               "hold", "ws:security-auth", "ws:release-deploy", "protected", "governance", "cloud-held"}
DENY_TEXT = re.compile(r"(doppler|\.env\b|secret|credential|api[_ -]?key|token|DATABASE_URL|"
                       r"production (db|database)|prod db|stripe live|private data|migration)", re.I)
LIMITS = {"codex": {"concurrent": 2, "per_day": 8}}
BACKOFF_S = (900, 3600, 14400)  # consecutive limit hits: 15m, 1h, 4h
LIMIT_TEXT = re.compile(r"(rate.?limit|usage limit|quota|429|overloaded|capacity)", re.I)

# Draft-only dispositions (R4): existing failure handling can never return these to Todo.
RETAINED_VERDICTS = frozenset({"cloud-pending", "cloud-held", "cloud-draft-created"})

TASK_ID = re.compile(r"task_[A-Za-z0-9_-]+")
SUBMIT_LINE = re.compile(r"(?:https://chatgpt\.com/codex/tasks/)?(task_[A-Za-z0-9_-]+)")
STATUS_LINE = re.compile(r"\[(READY|PENDING|APPLIED|ERROR)\]")
# POSIX ERE for `git config --get-regexp`; Python-only groups would silently fail there.
URL_REWRITE_CONFIG = r"^url\..*\.(insteadOf|pushInsteadOf)$"

MAX_FILES = 40
MAX_LINES = 500
MAX_PATCH_BYTES = 1024 * 1024
MAX_PARSE_S = 10.0
LIST_MAX_PAGES = 10
OUTPUT_CAP_BYTES = 8 * 1024 * 1024
DIFF_CAP_BYTES = 2 * 1024 * 1024

ADMISSION_STAGES = frozenset({"submitted", "accepted", "held", "limit", "pr_opened"})
PROVIDER_STAGES = frozenset({"submitted", "accepted", "held", "limit"})
CLAIM_STAGES = frozenset({"cloud-pending", "cloud-held", "cloud-draft-created"})
STAGES = ADMISSION_STAGES | CLAIM_STAGES | {"intent:push", "pushed", "intent:pr"}
UNREADABLE = object()


class Bounded:
    """A bounded run result; `truncated` marks output cut at the streaming cap."""
    __slots__ = ("returncode", "stdout", "stderr", "truncated")

    def __init__(self, returncode, stdout, stderr, truncated=False):
        self.returncode, self.stdout, self.stderr, self.truncated = returncode, stdout, stderr, truncated


def stream_run(cmd, *, timeout, cap=OUTPUT_CAP_BYTES):
    """Run one command and bound its output while it streams (never after capture)."""
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except OSError as error:
        return Bounded(None, "", f"spawn-{type(error).__name__}")
    out, err = bytearray(), bytearray()
    truncated = False
    deadline = time.monotonic() + timeout
    streams = [proc.stdout, proc.stderr]
    for handle in streams:
        os.set_blocking(handle.fileno(), False)
    try:
        while streams and not truncated:
            if time.monotonic() > deadline:
                truncated = True
                break
            ready, _, _ = select.select(streams, [], [], 0.2)
            for handle in ready:
                chunk = handle.read1(65536)
                if not chunk:
                    streams.remove(handle)
                    continue
                target = out if handle is proc.stdout else err
                room = cap - len(target)
                if len(chunk) > room:
                    target.extend(chunk[:max(room, 0)])
                    truncated = True
                else:
                    target.extend(chunk)
        if truncated:
            proc.kill()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
    finally:
        for handle in (proc.stdout, proc.stderr):
            handle.close()
    return Bounded(proc.returncode, out.decode("utf-8", "replace"), err.decode("utf-8", "replace"), truncated)


def enabled() -> bool:
    """LANES_CLOUD_ENABLED gates every external effect; unset means fully dormant."""
    return os.environ.get("LANES_CLOUD_ENABLED", "").strip().lower() in ("1", "true", "yes", "on")


def ledger_path() -> Path:
    return Path(os.environ.get("CLOUD_LANE_LEDGER") or LEDGER_DEFAULT)


def eligible(labels, text):
    """(ok, reason). Opt-in label required; any secret/private/protected signal keeps it on Gem."""
    labels = {str(label).lower() for label in labels}
    if OPT_IN_LABEL not in labels:
        return False, "not-opted-in"
    hit = labels & DENY_LABELS
    if hit:
        return False, f"label:{sorted(hit)[0]}"
    match = DENY_TEXT.search(text or "")
    if match:
        return False, f"text:{match.group(0).lower()}"
    return True, "ok"


def _valid_at(value):
    if not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0 or value > 1e12:
        return False  # the bound also keeps isfinite safe from huge ints
    return math.isfinite(value)


_HEX_FIELDS = ("baseSha", "patchSha256", "candTree", "commitSha")


def _valid_event(event):
    if not isinstance(event, dict) or not {"issue", "stage", "at"} <= event.keys():
        return False
    if not isinstance(event["issue"], str) or not event["issue"]:
        return False
    if event["stage"] not in STAGES or not _valid_at(event["at"]):
        return False
    if event["stage"] in PROVIDER_STAGES and (not isinstance(event.get("provider"), str)
                                              or not event.get("provider")):
        return False
    for key in ("task", "remote", "branch", "repo", "env", "fencingToken", "reason"):
        if key in event and not isinstance(event[key], str):
            return False
    if event.get("repo") not in (None, REPO):
        return False
    for key in _HEX_FIELDS:
        if key in event and not (isinstance(event[key], str) and HEX40.fullmatch(event[key])):
            return False
    if "attempt" in event and event["attempt"] != 1:
        return False
    if "pr" in event and not (isinstance(event["pr"], int) and not isinstance(event["pr"], bool)
                              and event["pr"] > 0):
        return False
    if "paths" in event and not (isinstance(event["paths"], list)
                                 and all(isinstance(p, str) for p in event["paths"])):
        return False
    if event["stage"] in ("cloud-pending", "cloud-draft-created") and not (
            event.get("fencingToken") and event.get("branch")):
        return False
    if event["stage"] in ("intent:push", "intent:pr") and not event.get("fencingToken"):
        return False
    return True


def read(path=None):
    """Strict ledger read: any malformed row raises (fail closed everywhere)."""
    path = Path(path or ledger_path())
    if not path.exists():
        return []
    out = []
    for line in path.read_text().splitlines():
        event = json.loads(line)
        if not _valid_event(event):
            raise ValueError("invalid cloud ledger event")
        out.append(event)
    return out


def append(event, path=None):
    path = Path(path or ledger_path())
    path.parent.mkdir(parents=True, exist_ok=True)
    if not _valid_event(event):
        raise ValueError("invalid cloud ledger event")
    with path.open("a") as handle:
        handle.write(json.dumps(event, sort_keys=True) + "\n")


def admit(provider, now, events):
    """(ok, reason): concurrency, daily cap and limit backoff from the ledger alone."""
    cap = LIMITS.get(provider)
    if not cap:
        return False, "unknown-provider"
    mine = [e for e in events if e.get("provider") == provider]
    hits, last_hit = 0, 0.0
    for event in mine:
        if event["stage"] == "limit":
            hits, last_hit = hits + 1, event["at"]
        elif event["stage"] == "pr_opened":
            hits = 0
    if hits and now < last_hit + BACKOFF_S[min(hits, len(BACKOFF_S)) - 1]:
        return False, "backoff"
    latest = {(e.get("issue") or e.get("task")): e for e in mine}
    if sum(e["stage"] not in ("pr_opened", "limit") for e in latest.values()) >= cap["concurrent"]:
        return False, "concurrency"
    if sum(e["stage"] == "submitted" and now - e["at"] < 86400 for e in mine) >= cap["per_day"]:
        return False, "daily-cap"
    return True, "ok"


# --------------------------------------------------------------------------- CLI contract

def command(provider, prompt, env=None, binary=None):
    """Pinned 0.162.1 contract: exec --env E --attempts 1 --branch main -- <prompt>."""
    if provider != "codex" or not prompt or prompt.startswith("-"):
        return None
    env = env or os.environ.get("CODEX_CLOUD_ENV")
    binary = binary or os.environ.get("CODEX_CLOUD_BINARY")
    if not env or not binary or not Path(binary).is_absolute():
        return None
    return [binary, "cloud", "exec", "--env", env, "--attempts", "1", "--branch", "main", "--", prompt]


def _resolve(run, cmd, timeout, cap=OUTPUT_CAP_BYTES):
    result = stream_run(cmd, timeout=timeout, cap=cap) if run is None else run(cmd)
    return result


def _remote_for(issue, path=None):
    events = read(path)
    accepted = [e for e in events if e.get("issue") == issue and e.get("task")]
    return (accepted[-1]["task"], accepted[-1]) if accepted else (None, None)


def route(issue, provider, labels, text, prompt, *, run=None, now=time.time, path=None,
          main_sha=None, url=DEFAULT_PUSH_URL, run_git=None, fencing_token=None):
    """Reserve and submit once; single-writer per issue across processes.

    The deny-text re-read at submit time covers the issue's title + description
    (v2 §6); the rendered prompt carries repo context that would false-trip it.
    """
    ok, why = eligible(labels, text)
    if not ok:
        return {"route": "gem", "reason": why}
    cmd = command(provider, prompt)
    if not cmd:
        return {"route": "gem", "reason": "provider-unconfigured"}
    base = main_sha or ls_remote_main(url, run_git=run_git)
    if not base:
        return {"route": "gem", "reason": "base-unreadable"}
    path = Path(path or ledger_path())
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.with_suffix(path.suffix + ".lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            events = read(path)
        except (ValueError, OSError):
            return {"route": "held", "reason": "ledger-unreadable"}
        if any(e.get("issue") == issue and e["stage"] != "limit" for e in events):
            return {"route": "held", "reason": "already-submitted"}
        stamp = now()
        ok, why = admit(provider, stamp, events)
        if not ok:
            return {"route": "gem", "reason": why}
        append({"issue": issue, "task": issue, "provider": provider, "stage": "submitted",
                "repo": REPO, "env": os.environ.get("CODEX_CLOUD_ENV", ""), "baseSha": base,
                "attempt": 1, "at": stamp}, path)
    try:
        result = _resolve(run, cmd, timeout=300)
    except Exception as error:
        _disposition(issue, provider, "cloud-held", f"unknown-submit-outcome:{type(error).__name__}", path, now())
        return {"route": "held", "reason": "unknown-submit-outcome"}
    # The pinned CLI prints exactly one line: the task URL. A bare id is also accepted;
    # prose, multiple ids or any stderr noise is an unknown outcome and stays held.
    stdout, stderr = (result.stdout or "").strip(), (result.stderr or "").strip()
    match = SUBMIT_LINE.fullmatch(stdout) if result.returncode == 0 and not stderr else None
    if not match:
        _disposition(issue, provider, "cloud-held", "unknown-submit-outcome", path, now())
        return {"route": "held", "reason": "unknown-submit-outcome"}
    remote = match.group(1)
    branch = f"cloud/{issue.lower()}-{remote[:8]}"
    _disposition(issue, provider, "cloud-pending", "submitted", path, now(),
                 task=remote, branch=branch, fencing_token=fencing_token,
                 extra={"baseSha": base, "env": os.environ.get("CODEX_CLOUD_ENV", ""),
                        "attempt": 1})
    return {"route": "cloud", "reason": "ok", "remote": remote, "branch": branch, "baseSha": base}


def _disposition(issue, provider, stage, reason, path, at, *, task=None, branch=None,
                 fencing_token=None, extra=None):
    event = {"issue": issue, "provider": provider, "stage": stage, "reason": reason,
             "repo": REPO, "at": at}
    if task:
        event.update(task=task)
    if branch:
        event.update(branch=branch)
    if fencing_token:
        event.update(fencingToken=fencing_token)
    if extra:
        event.update(extra)
    append(event, path)


def status(issue, *, run=None, path=None):
    """Remote status on demand. Only the anchored first-line grammar is authority."""
    try:
        remote, _row = _remote_for(issue, path)
    except (ValueError, OSError):
        return {"state": "unknown", "reason": "ledger-unreadable"}
    if not remote:
        return {"state": "unknown", "reason": "remote-id-missing"}
    binary = os.environ.get("CODEX_CLOUD_BINARY")
    if not binary or not Path(binary).is_absolute():
        return {"state": "unknown", "reason": "provider-unconfigured"}
    try:
        result = _resolve(run, [binary, "cloud", "status", remote], timeout=60)
    except Exception:
        return {"state": "unknown", "remote": remote, "reason": "status-unavailable"}
    line = (result.stdout or "").splitlines()[:1]
    match = STATUS_LINE.match(line[0]) if line else None
    if not match:
        return {"state": "unknown", "remote": remote, "reason": "status-unparseable"}
    state = match.group(1).lower()
    if result.returncode == 0 and state == "ready":
        return {"state": "ready", "remote": remote}
    if result.returncode == 1 and state in ("pending", "applied", "error"):
        return {"state": state, "remote": remote}
    return {"state": "unknown", "remote": remote, "reason": "status-inconsistent"}


def _locate_task(remote, *, run=None, env=None, binary=None):
    """codex cloud list --json (paginated, bounded); returns the task row or a held reason."""
    binary = binary or os.environ.get("CODEX_CLOUD_BINARY")
    env = env or os.environ.get("CODEX_CLOUD_ENV")
    if not binary or not Path(binary).is_absolute() or not env:
        return None, "provider-unconfigured"
    cursor = None
    for _page in range(LIST_MAX_PAGES):
        cmd = [binary, "cloud", "list", "--json", "--limit", "20"]
        if cursor:
            cmd += ["--cursor", cursor]
        try:
            result = _resolve(run, cmd, timeout=60)
        except Exception:
            return None, "list-unavailable"
        if result.returncode != 0 or getattr(result, "truncated", False):
            return None, "list-unavailable"
        try:
            payload = json.loads(result.stdout or "")
        except ValueError:
            return None, "list-unparseable"
        if not isinstance(payload, dict) or not isinstance(payload.get("tasks"), list):
            return None, "list-unparseable"
        for row in payload["tasks"]:
            if isinstance(row, dict) and row.get("id") == remote:
                return row, None
        cursor = payload.get("cursor") or None
        if not cursor:
            return None, "task-not-listed"
    return None, "list-truncated"


def collect(issue, *, run=None, path=None):
    """Identity binding (list) + the pinned-attempt diff. Never trusts a status summary."""
    try:
        remote, submitted = _remote_for(issue, path)
    except (ValueError, OSError):
        return {"ok": False, "reason": "ledger-unreadable"}
    if not remote:
        return {"ok": False, "reason": "remote-id-missing"}
    row, why = _locate_task(remote, run=run)
    if row is None:
        return {"ok": False, "reason": why}
    if row.get("environment_id") != os.environ.get("CODEX_CLOUD_ENV"):
        return {"ok": False, "reason": "environment-mismatch", "remote": remote}
    if row.get("attempt_total") != 1:
        return {"ok": False, "reason": "attempt-mismatch", "remote": remote}
    binary = os.environ.get("CODEX_CLOUD_BINARY")
    if not binary or not Path(binary).is_absolute():
        return {"ok": False, "reason": "provider-unconfigured", "remote": remote}
    try:
        result = _resolve(run, [binary, "cloud", "diff", remote, "--attempt", "1"],
                          timeout=120, cap=DIFF_CAP_BYTES)
    except Exception:
        return {"ok": False, "reason": "diff-unavailable", "remote": remote}
    if result.returncode != 0 or getattr(result, "truncated", False):
        return {"ok": False, "reason": "diff-unavailable", "remote": remote}
    patch = result.stdout or ""
    if len(patch.encode("utf-8")) > MAX_PATCH_BYTES:
        return {"ok": False, "reason": "oversize:bytes", "remote": remote}
    return {"ok": True, "patch": patch, "remote": remote, "baseSha": submitted.get("baseSha")}


# --------------------------------------------------------------- patch authorization

class PatchRejected(Exception):
    def __init__(self, reason, paths=()):
        super().__init__(reason)
        self.reason, self.paths = reason, list(paths)


def load_policy(path=None):
    """Fail-closed deny policy: missing or invalid means hold everything."""
    try:
        data = json.loads((Path(path) if path else POLICY_PATH).read_text(encoding="utf-8"))
        deny = data["deny"]
        prefixes = [str(p).casefold() for p in deny["prefixes"]]
        names = {str(n).casefold() for n in deny["names"]}
        regexes = [re.compile(str(r).casefold()) for r in deny["regexes"]]
    except (OSError, ValueError, KeyError, TypeError, re.error):
        return None
    if not prefixes and not names and not regexes:
        return None
    return {"prefixes": prefixes, "names": names, "regexes": regexes}


def policy_violation(key, policy):
    """key is the NFKC+casefold policy key; returns the matched rule or None."""
    if key.startswith(tuple(policy["prefixes"])):
        return "prefix"
    if key.rsplit("/", 1)[-1] in policy["names"]:
        return "name"
    for pattern in policy["regexes"]:
        if pattern.search(key):
            return "regex"
    return None


def canonical_key(path):
    """The exact Git bytes decoded as UTF-8, rejected before normalization when malformed."""
    if "\\" in path or path.startswith("/"):
        raise PatchRejected("traversal")
    if any(ord(ch) < 0x20 or ord(ch) == 0x7F or 0xD800 <= ord(ch) <= 0xDFFF for ch in path):
        raise PatchRejected("encoding")
    parts = path.split("/")
    if any(part in ("", ".", "..") for part in parts):
        raise PatchRejected("traversal")
    if any(part.casefold() == ".git" for part in parts):
        raise PatchRejected("git-component")
    return unicodedata.normalize("NFKC", path).casefold(), unicodedata.normalize("NFC", path).casefold()


def _content_path(line):
    value = line[4:].split("\t")[0]
    if value == "/dev/null":
        return None
    if value.startswith('"') or "\\" in value:
        raise PatchRejected("quoted-path")
    value = value[2:] if value.startswith(("a/", "b/")) else value
    if value.startswith("/"):
        raise PatchRejected("traversal")
    return value


def _plain_path(line):
    value = line.split(" ", 2)[2] if line.count(" ") >= 2 else ""
    if value.startswith('"') or "\\" in value:
        raise PatchRejected("quoted-path")
    return value


def _header_ops(patch):
    """One record per `diff --git` operation, with its declared content/rename endpoints.

    Rejects quoted paths outright: the exact bytes a quoted header would apply under can
    never be validated as UTF-8 policy keys, so the patch stays held.
    """
    ops = []
    for line in patch.splitlines():
        if line.startswith("diff --git "):
            rest = line[len("diff --git "):]
            if '"' in line:
                raise PatchRejected("quoted-path")
            mid = rest.find(" b/")
            if mid < 0 or not rest.startswith("a/"):
                raise PatchRejected("patch-malformed")
            ops.append({"old": rest[2:mid], "new": rest[mid + 3:]})
        elif line.startswith(("--- ", "+++ ")):
            if not ops:
                raise PatchRejected("patch-malformed")
            key = "old_content" if line.startswith("--- ") else "new_content"
            if key in ops[-1]:
                raise PatchRejected("patch-malformed")
            ops[-1][key] = _content_path(line)
        elif line.startswith(("rename from ", "copy from ")):
            if not ops:
                raise PatchRejected("patch-malformed")
            ops[-1]["rename_from"] = _plain_path(line)
        elif line.startswith(("rename to ", "copy to ")):
            if not ops:
                raise PatchRejected("patch-malformed")
            ops[-1]["rename_to"] = _plain_path(line)
    if not ops:
        raise PatchRejected("patch-malformed")
    return ops


def _quarantine_env(root, home):
    return {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LANG": "C",
            "HOME": str(home), "GIT_DIR": str(root), "GIT_INDEX_FILE": str(root.parent / "index"),
            "GIT_OBJECT_DIRECTORY": str(root / "objects"),
            "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null"}


def _qgit(env, args, input_text=None):
    return subprocess.run(["git", "-c", "core.hooksPath=/dev/null", *args], env=env,
                          input=input_text, capture_output=True, text=True, timeout=120)


def _z_tokens(output):
    return [token for token in output.split("\0") if token]


def _diff_records(env, base_tree, cand_tree):
    raw = _qgit(env, ["diff-tree", "-r", "-z", "--raw", "-M", "-C", "--find-copies-harder",
                      base_tree, cand_tree])
    if raw.returncode != 0:
        raise PatchRejected("diff-unreadable")
    records = []
    tokens = _z_tokens(raw.stdout)
    index = 0
    while index < len(tokens):
        head = tokens[index]
        if not head.startswith(":"):
            raise PatchRejected("diff-malformed")
        fields = head[1:].split(" ")
        if len(fields) != 5:
            raise PatchRejected("diff-malformed")
        old_mode, new_mode, _old_sha, _new_sha, status = fields
        index += 1
        paths = [tokens[index]]
        index += 1
        if status[:1] in ("R", "C"):
            paths.append(tokens[index])
            index += 1
        records.append({"old_mode": old_mode, "new_mode": new_mode, "status": status[:1],
                        "paths": paths})
    return records


def _numstat_totals(env, base_tree, cand_tree):
    raw = _qgit(env, ["diff-tree", "-r", "-z", "--numstat", "-M", "-C", base_tree, cand_tree])
    if raw.returncode != 0:
        raise PatchRejected("diff-unreadable")
    additions, deletions, binary, files = 0, 0, False, set()
    for head, extra_paths in _stat_rows(raw.stdout):
        parts = head.split("\t")
        adds, dels = parts[0], parts[1]
        if len(parts) > 2 and parts[2]:
            files.add(parts[2])
        files.update(extra_paths)
        if adds == "-" or dels == "-":
            binary = True
        else:
            additions += int(adds)
            deletions += int(dels)
    return additions, deletions, binary, files


def _stat_rows(output):
    """-z stat rows: 'adds\tdels[\tpath]' heads, renames carry their paths as NUL tokens."""
    rows, tokens, index = [], _z_tokens(output), 0
    while index < len(tokens):
        head = tokens[index]
        if "\t" not in head:
            raise PatchRejected("diff-malformed")
        index += 1
        extra = []
        while index < len(tokens) and "\t" not in tokens[index]:
            extra.append(tokens[index])
            index += 1
        rows.append((head, extra))
    return rows


def authorize(patch, base_sha, objects_dir):
    """Apply the patch in a credential-free quarantine and authorize the resulting TREE.

    On success the caller owns the returned quarantine directory and must discard it
    only after the publisher independently resolves and verifies the candidate tree.
    """
    deadline = time.monotonic() + MAX_PARSE_S
    try:
        size = len(patch.encode("utf-8"))
    except UnicodeEncodeError:  # lone surrogates are undecodable bytes, never a policy key
        return {"ok": False, "reason": "encoding"}
    if size > MAX_PATCH_BYTES:
        return {"ok": False, "reason": "oversize:bytes"}
    policy = load_policy()
    if policy is None:
        return {"ok": False, "reason": "policy-unreadable"}
    root = None
    try:
        # 1. The decoded patch-operation footprint, before anything runs.
        keys, nfkc_sources, ops_seen, endpoint_uses = {}, {}, [], {}
        for op in _header_ops(patch):
            if (op["old"], op["new"]) in {(o["old"], o["new"]) for o in ops_seen}:
                raise PatchRejected("duplicate-path", [op["old"]])
            ops_seen.append(op)
            if op.get("rename_from") not in (None, op["old"]) \
                    or op.get("rename_to") not in (None, op["new"]):
                raise PatchRejected("patch-malformed", [op["old"], op["new"]])
            for role in ("old", "new", "rename_from", "rename_to", "old_content", "new_content"):
                value = op.get(role)
                if value is None or value == "":
                    continue
                if role in ("old_content", "new_content") and value not in (op["old"], op["new"]):
                    raise PatchRejected("patch-malformed", [value])
                key, plain = canonical_key(value)
                if key in keys and keys[key] != value:
                    raise PatchRejected("duplicate-path", [value])
                keys[key] = value
                nfkc_sources[key] = plain
            for endpoint in {op["old"], op["new"]}:
                if endpoint:
                    endpoint_uses[endpoint] = endpoint_uses.get(endpoint, 0) + 1
        # R5: the same endpoint in two operations is a duplicate or intermediate op.
        repeated = sorted(path for path, count in endpoint_uses.items() if count > 1)
        if repeated:
            raise PatchRejected("duplicate-path", repeated)
        # A compatibility-normalized path only matters when it collides with another
        # path or with a protected key; identical keys above already caught collisions.
        for key, plain in nfkc_sources.items():
            if key != plain and policy_violation(key, policy):
                raise PatchRejected("collision", [nfkc_sources[key]])
        for key in keys:
            if policy_violation(key, policy):
                raise PatchRejected(f"sensitive:{keys[key]}", [keys[key]])

        # 2. Quarantine scaffold: bare temp repo, alternates read-only at the clone.
        tmp = Path(tempfile.mkdtemp(prefix="cloud-quarantine-"))
        root = tmp / "quarantine.git"
        _qgit({"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LANG": "C",
               "HOME": str(tmp / "home"), "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null"},
              ["init", "--bare", str(root)])
        (tmp / "home").mkdir()
        (root / "objects/info").mkdir(parents=True, exist_ok=True)
        (root / "objects/info/alternates").write_text(str(objects_dir) + "\n")
        env = _quarantine_env(root, tmp / "home")

        # 3. Resolve and record the pinned base, then stage it into a temporary index.
        resolved = _qgit(env, ["rev-parse", f"{base_sha}^{{tree}}"])
        if resolved.returncode != 0:
            raise PatchRejected("base-unresolved")
        base_tree = resolved.stdout.strip()
        if _qgit(env, ["read-tree", base_sha]).returncode != 0:
            raise PatchRejected("base-unreadable")
        if time.monotonic() > deadline:
            raise PatchRejected("parse-timeout")

        # 4. Apply strictly: --check first, then the real apply into the temp index.
        for step in ("--check", ""):
            args = ["apply", "--cached"] + ([step] if step else []) + ["-"]
            if _qgit(env, args, input_text=patch).returncode != 0:
                raise PatchRejected("patch-rejected")
        written = _qgit(env, ["write-tree"])
        if written.returncode != 0:
            raise PatchRejected("write-tree-failed")
        cand_tree = written.stdout.strip()
        if not HEX40.fullmatch(cand_tree):
            raise PatchRejected("write-tree-failed")
        if time.monotonic() > deadline:
            raise PatchRejected("parse-timeout")

        # 5. The patch's own numstat must agree with the tree diff's file set.
        patch_stat = _qgit(env, ["apply", "--numstat", "-z", "-"], input_text=patch)
        patch_files = set()
        for head, extra_paths in _stat_rows(patch_stat.stdout if not patch_stat.returncode else ""):
            parts = head.split("\t")
            if len(parts) > 2 and parts[2]:
                patch_files.add(parts[2])
            patch_files.update(extra_paths)
        records = _diff_records(env, base_tree, cand_tree)
        additions, deletions, binary, tree_files = _numstat_totals(env, base_tree, cand_tree)
        # A rename's patch numstat names only the destination; the tree names both ends.
        if patch_stat.returncode != 0 or not patch_files <= tree_files \
                or len(patch_files) != len(records):
            raise PatchRejected("patch-partially-consumed")

        # 6. Authorize the tree: modes, types, duplicates, sizes, policy.
        touched = []
        for record in records:
            if record["status"] == "T":
                raise PatchRejected("type-change")
            for mode in (record["old_mode"], record["new_mode"]):
                if mode in ("120000", "160000"):
                    raise PatchRejected("gitlink" if mode == "160000" else "symlink")
                if mode not in ("", "0", "000000", "100644", "100755"):
                    raise PatchRejected(f"mode:{mode}")
            if record["old_mode"] not in ("", "0", "000000") \
                    and record["new_mode"] not in ("", "0", "000000") \
                    and record["old_mode"] != record["new_mode"]:
                raise PatchRejected("mode-change")
            for path in record["paths"]:
                key, _plain = canonical_key(path)
                if key in keys and keys[key] != path:
                    raise PatchRejected("duplicate-path", [path])
                keys[key] = path
                touched.append(path)
                if policy_violation(key, policy):
                    # A copy/rename source never named in a patch header is still
                    # discovered here: the TREE is authorized, not the headers.
                    raise PatchRejected(f"sensitive:{path}", [path])
        if binary:
            raise PatchRejected("binary")
        if len(touched) != len(set(touched)):
            raise PatchRejected("duplicate-path", touched)
        if len(touched) > MAX_FILES:
            raise PatchRejected("oversize:files", touched)
        if additions + deletions > MAX_LINES:
            raise PatchRejected("oversize:lines")
        if time.monotonic() > deadline:
            raise PatchRejected("parse-timeout")
        return {"ok": True, "candTree": cand_tree, "baseTree": base_tree, "baseSha": base_sha,
                "paths": sorted(touched), "files": len(touched), "additions": additions,
                "deletions": deletions, "quarantine": root.parent, "repo": root}
    except PatchRejected as error:
        if root is not None:
            shutil.rmtree(root.parent, ignore_errors=True)
        return {"ok": False, "reason": error.reason, "paths": error.paths}
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        if root is not None:
            shutil.rmtree(root.parent, ignore_errors=True)
        return {"ok": False, "reason": f"quarantine-failed:{type(error).__name__}"}


def discard(quarantine):
    """Delete a quarantine only the publisher has already verified."""
    shutil.rmtree(quarantine, ignore_errors=True)


# ------------------------------------------------------------------------ publication

def pr_body(issue, task, base_sha, cand_tree, paths):
    """Fixed template only: no model text, no @mentions, no closing keywords."""
    lines = [f"Refs {issue.upper()}", f"Codex-Cloud-Task: {task}",
             f"Base: {base_sha}", f"Tree: {cand_tree}", "", "Files:"]
    lines += [f"- {path}" for path in sorted(p for p in paths if isinstance(p, str) and p)]
    return "\n".join(lines)


def ls_remote_main(url, *, run_git=None):
    def git(args):
        return run_git(args) if run_git else subprocess.run(args, capture_output=True, text=True,
                                                            timeout=60)
    result = git(["git", "ls-remote", url, "refs/heads/main"])
    if result.returncode != 0:
        return None
    line = (result.stdout or "").strip().splitlines()
    return line[0].split("\t")[0] if line and HEX40.fullmatch(line[0].split("\t")[0]) else None


def _pgit(repo_dir, args, run_git=None):
    cmd = ["git", "-C", str(repo_dir), "-c", "core.hooksPath=/dev/null", *args]
    return run_git(cmd) if run_git else subprocess.run(cmd, capture_output=True, text=True, timeout=180)


def _fence(path, issue, task, stage, token, extra=None):
    """Persist an intent row under the ledger lock; a stale collector or an orphan
    intent (crash between intent and result) refuses the effect forever."""
    path = Path(path or ledger_path())
    with path.with_suffix(path.suffix + ".lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        events = read(path)
        claims = [e for e in events if e.get("issue") == issue and e["stage"] in CLAIM_STAGES]
        if not claims or claims[-1].get("fencingToken") != token:
            return "stale-token"
        results = {"intent:push": ("pushed",), "intent:pr": ("pr_opened",)}
        for intent, done in results.items():
            if any(e["stage"] == intent and e.get("task") == task for e in events) and \
                    not any(e["stage"] in done and e.get("task") == task for e in events):
                return "reconcile"
        row = {"issue": issue, "task": task, "stage": stage, "fencingToken": token, "at": time.time()}
        if extra:
            row.update(extra)
        append(row, path)
        return None


def publish_candidate(issue, task, quarantine, cand_tree, base_sha, branch, *, repo_dir,
                      url=DEFAULT_PUSH_URL, path=None, fencing_token=None, gh=None,
                      run_git=None, now=time.time, paths=()):
    """Draft-only publication: verified object transfer, one commit, expected-absent push."""
    path = Path(path or ledger_path())
    allow = PUSH_URL_RE  # tests patch this module attribute for local remotes
    if not allow.fullmatch(url):
        return {"route": "held", "reason": "push-url-invalid"}
    rewrite = _pgit(repo_dir, ["config", "--get-regexp", URL_REWRITE_CONFIG], run_git=run_git)
    if rewrite.returncode not in (0, 1) or rewrite.stdout.strip():
        return {"route": "held", "reason": "push-url-rewrite"}
        return {"route": "held", "reason": "push-url-rewrite"}
    live_main = ls_remote_main(url, run_git=run_git)
    if live_main != base_sha:
        return {"route": "held", "reason": "base-moved"}
    existing = _pgit(repo_dir, ["ls-remote", url, f"refs/heads/{branch}"], run_git=run_git)
    if existing.returncode != 0:
        return {"route": "held", "reason": "remote-unreadable"}
    if (existing.stdout or "").strip():
        return {"route": "held", "reason": "branch-exists"}
    # R1: candidate objects cross only via an explicit, verified object transfer.
    qenv = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LANG": "C",
            "GIT_DIR": str(quarantine / "quarantine.git"),
            "GIT_OBJECT_DIRECTORY": str(quarantine / "quarantine.git/objects"),
            "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null",
            "HOME": str(quarantine / "home")}
    if _qgit(qenv, ["update-ref", f"refs/cloud-candidate/{cand_tree}", cand_tree]).returncode != 0:
        return {"route": "held", "reason": "quarantine-ref-failed"}
    if _pgit(repo_dir, ["fetch", "--no-tags", str(quarantine / "quarantine.git"),
                        f"refs/cloud-candidate/{cand_tree}"], run_git=run_git).returncode != 0:
        return {"route": "held", "reason": "object-transfer-failed"}
    kind = _pgit(repo_dir, ["cat-file", "-t", cand_tree], run_git=run_git)
    if kind.returncode != 0 or kind.stdout.strip() != "tree":
        return {"route": "held", "reason": "object-transfer-failed"}
    commit = _pgit(repo_dir, ["-c", "user.name=cloud lane", "-c", "user.email=cloud-lane@jov.ie",
                              "commit-tree", cand_tree, "-p", base_sha, "-m",
                              f"cloud lane candidate {task} on {base_sha}"], run_git=run_git)
    commit_sha = commit.stdout.strip()
    if commit.returncode != 0 or not HEX40.fullmatch(commit_sha):
        return {"route": "held", "reason": "commit-failed"}
    tree_check = _pgit(repo_dir, ["rev-parse", f"{commit_sha}^{{tree}}"], run_git=run_git)
    parents = _pgit(repo_dir, ["rev-list", "--parents", "-n", "1", commit_sha], run_git=run_git)
    if (tree_check.returncode != 0 or tree_check.stdout.strip() != cand_tree
            or parents.returncode != 0 or parents.stdout.strip().split() != [commit_sha, base_sha]):
        return {"route": "held", "reason": "commit-verification-failed"}
    blocked = _fence(path, issue, task, "intent:push", fencing_token,
                     {"branch": branch, "commitSha": commit_sha, "repo": REPO})
    if blocked:
        return {"route": "held", "reason": blocked}
    pushed = _pgit(repo_dir, ["push", f"--force-with-lease=refs/heads/{branch}:", "--no-verify",
                              url, f"{commit_sha}:refs/heads/{branch}"], run_git=run_git)
    if pushed.returncode != 0:
        return {"route": "held", "reason": "push-failed"}
    append({"issue": issue, "task": task, "provider": "codex", "stage": "pushed",
            "fencingToken": fencing_token, "branch": branch, "commitSha": commit_sha,
            "repo": REPO, "at": now()}, path)
    blocked = _fence(path, issue, task, "intent:pr", fencing_token,
                     {"branch": branch, "commitSha": commit_sha, "repo": REPO})
    if blocked:
        return {"route": "held", "reason": blocked}
    body = pr_body(issue, task, base_sha, cand_tree, paths)
    def gh_call(args):
        return gh(args) if gh else subprocess.run(["gh", *args], capture_output=True, text=True,
                                                 timeout=120)
    created = gh_call(["pr", "create", "--draft", "--repo", REPO, "--base", "main",
                       "--head", branch, "--title", f"{issue.upper()}: cloud lane draft ({task})",
                       "--body", body])
    if created.returncode != 0:
        return {"route": "held", "reason": "pr-create-failed", "commitSha": commit_sha}
    url_match = re.search(r"/pull/(\d+)$", (created.stdout or "").strip().splitlines()[-1] \
                          if (created.stdout or "").strip() else "")
    if not url_match:
        return {"route": "held", "reason": "pr-create-failed", "commitSha": commit_sha}
    number = int(url_match.group(1))
    readback = gh_call(["pr", "view", str(number), "--repo", REPO, "--json",
                        "number,isDraft,baseRefName,headRefName,headRefOid,url"])
    try:
        live = json.loads(readback.stdout or "")
    except ValueError:
        live = {}
    if (readback.returncode != 0 or live.get("number") != number or live.get("isDraft") is not True
            or live.get("baseRefName") != "main" or live.get("headRefName") != branch
            or live.get("headRefOid") != commit_sha
            or not str(live.get("url", "")).startswith(f"https://github.com/{REPO}/pull/")):
        return {"route": "held", "reason": "readback-mismatch", "pr": number, "commitSha": commit_sha}
    append({"issue": issue, "task": task, "provider": "codex", "stage": "pr_opened",
            "pr": number, "prUrl": live["url"], "branch": branch, "commitSha": commit_sha,
            "repo": REPO, "at": now()}, path)
    _disposition(issue, "codex", "cloud-draft-created", "pr-opened", path, now(), task=task,
                 branch=branch, fencing_token=fencing_token, extra={"pr": number, "prUrl": live["url"]})
    return {"route": "pr_opened", "pr": number, "prUrl": live["url"], "commitSha": commit_sha,
            "branch": branch}


def live_claim(issue, path=None):
    """The latest cloud claim for an issue; live claims block every ordinary lane."""
    try:
        events = read(path)
    except (ValueError, OSError):
        return {"issue": issue, "stage": "cloud-held", "reason": "ledger-unreadable"}
    claims = [e for e in events if e.get("issue") == issue and e["stage"] in CLAIM_STAGES]
    return claims[-1] if claims else None


def read_evidence(path=None):
    """One ledger read for batch origin checks; UNREADABLE means fail closed."""
    try:
        return read(path)
    except (ValueError, OSError):
        return UNREADABLE


def is_cloud_origin(pr, evidence=None):
    """Draft-only authority (R3): repository-scoped, host-independent, fail closed.

    A cloud/ branch prefix OR trusted ledger evidence for this repository's branch
    blocks adoption, repair and promotion; either alone blocks; neither is proof
    that publication is permitted.
    """
    ref = pr.get("headRefName") or ""
    if ref.startswith("cloud/"):
        return True
    if evidence is None:
        evidence = read_evidence()
    if evidence is UNREADABLE:
        return True
    return any(event.get("branch") == ref and event.get("repo", REPO) == REPO for event in evidence)


def reconcile(*, path=None, repo_dir=None, url=DEFAULT_PUSH_URL, run=None, gh=None,
              run_git=None, guard=None, now=time.time):
    """The worker's reconciliation turn for live cloud claims: status -> collect ->
    authorize -> draft-publish, or an explicit held_* disposition. Never resubmits."""
    try:
        events = read(path)
    except (ValueError, OSError):
        return [{"disposition": "held", "reason": "ledger-unreadable"}]
    out = []
    claims = {}
    for event in events:
        if event["stage"] in CLAIM_STAGES:
            claims[event["issue"]] = event
    for issue, claim in sorted(claims.items()):
        if claim["stage"] != "cloud-pending":
            out.append({"issue": issue, "disposition": claim["stage"]})
            continue
        out.append(_reconcile_one(claim, path=path, repo_dir=repo_dir, url=url, run=run,
                                  gh=gh, run_git=run_git, guard=guard, now=now))
    return out


def _reconcile_one(claim, *, path, repo_dir, url, run, gh, run_git, guard, now):
    issue, task, branch = claim["issue"], claim.get("task"), claim.get("branch")

    def held(reason, extra=None):
        _disposition(issue, "codex", "cloud-held", reason, path, now(), task=task, branch=branch,
                     fencing_token=claim.get("fencingToken"), extra=extra)
        return {"issue": issue, "disposition": "cloud-held", "reason": reason, **(extra or {})}

    for stage, done in (("intent:push", "pushed"), ("intent:pr", "pr_opened")):
        try:
            events = read(path)
        except (ValueError, OSError):
            return {"issue": issue, "disposition": "held", "reason": "ledger-unreadable"}
        if any(e["stage"] == stage and e.get("task") == task for e in events) and \
                not any(e["stage"] == done and e.get("task") == task for e in events):
            return held("reconcile")
    state = status(issue, run=run, path=path)
    if state["state"] in ("pending", "applied", "unknown"):
        return {"issue": issue, "disposition": "wait", "state": state["state"]}
    if state["state"] == "error":
        return held("cloud-error")
    collected = collect(issue, run=run, path=path)
    if not collected.get("ok"):
        return held(collected.get("reason", "collect-failed"))
    base_sha = claim.get("baseSha") or collected.get("baseSha")
    if not base_sha or ls_remote_main(url, run_git=run_git) != base_sha:
        return held("base-moved")
    if guard is not None:
        try:
            guard(branch)
        except Exception as error:
            return held(f"revoked:{type(error).__name__}")
    objects = _pgit(repo_dir, ["rev-parse", "--git-path", "objects"], run_git=run_git)
    if objects.returncode != 0:
        return held("repo-unreadable")
    objects_dir = (Path(repo_dir) / objects.stdout.strip()).resolve()
    verdict = authorize(collected["patch"], base_sha, objects_dir)
    if not verdict.get("ok"):
        reason = verdict["reason"]
        extra = {"paths": verdict.get("paths")} if verdict.get("paths") else None
        if reason.startswith("sensitive:"):
            return held("held_sensitive:" + reason, extra)
        if reason.startswith("oversize:"):
            return held("held_oversize:" + reason, extra)
        return held(reason, extra)
    try:
        result = publish_candidate(issue, task, verdict["quarantine"], verdict["candTree"],
                                   base_sha, branch, repo_dir=repo_dir, url=url, path=path,
                                   fencing_token=claim.get("fencingToken"), gh=gh, run_git=run_git,
                                   now=now, paths=verdict["paths"])
    finally:
        discard(verdict["quarantine"])
    if result.get("route") == "pr_opened":
        return {"issue": issue, "disposition": "cloud-draft-created", "pr": result["pr"],
                "prUrl": result["prUrl"], "commitSha": result["commitSha"]}
    return held(result.get("reason", "publish-failed"))


def pct(values, q):
    if not values:
        return None
    values = sorted(values)
    return values[min(len(values) - 1, int(q * len(values)))]


def stats(events):
    out = {}
    for provider in sorted({e["provider"] for e in events if e.get("provider")}):
        mine = [e for e in events if e.get("provider") == provider]
        submitted = {e["issue"]: e["at"] for e in mine if e["stage"] == "submitted"}
        done = {e["issue"]: e["at"] for e in mine if e["stage"] == "pr_opened"}
        times = [done[issue] - submitted[issue] for issue in done if issue in submitted]
        held = [e.get("reason", "") for e in mine if e["stage"] == "cloud-held"]
        out[provider] = {
            "tasks": len(submitted), "prs": len(done),
            "success_rate": len(done) / len(submitted) if submitted else None,
            "time_to_pr_p50_s": pct(times, .5), "time_to_pr_p95_s": pct(times, .95),
            "held_sensitive": sum(r.startswith("held_sensitive:") for r in held),
            "held_oversize": sum(r.startswith("held_oversize:") for r in held),
            "held_reconcile": sum(r == "reconcile" or r.startswith("reconcile") for r in held),
            "provenance_mismatch": sum(r.startswith(("provenance", "environment-", "attempt-",
                                                     "task-not-listed", "list-")) for r in held),
            "cost_usd": None, "cost_basis": "subscription; marginal spend unmeasured"}
    return out


def main(argv=None):
    if (argv if argv is not None else sys.argv[1:])[:1] != ["stats"]:
        print("usage: cloud_lane.py stats", file=sys.stderr)
        return 2
    print(json.dumps(stats(read()), indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
