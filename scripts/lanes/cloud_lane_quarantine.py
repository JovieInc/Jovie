"""Credential-free patch quarantine and fail-closed tree authorization."""
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import unicodedata
from pathlib import Path

from atomic_state import atomic_write_text
from cloud_lane_state import HEX40

POLICY_PATH = Path(__file__).with_name("cloud-sensitive-paths.json")

MAX_FILES = 40

MAX_LINES = 500

MAX_PATCH_BYTES = 1024 * 1024

MAX_PARSE_S = 10.0

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
        atomic_write_text(root / "objects/info/alternates", str(objects_dir) + "\n")
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
