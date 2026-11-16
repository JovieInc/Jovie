"""Durable, exact-input publication for the existing reason lane.

Model execution and admission stay in reason_lane. Callbacks preserve that
lane's parser, deadline and rendering contract without importing it here.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import subprocess
import uuid
from pathlib import Path

import lifecycle
from atomic_state import atomic_write_text

RESULT_SCHEMA = "summer.reasoning-result/v1"
RESULT_MARKER = "<!-- summer-reasoning-result:v1 -->"


def _memo_document(raw: str, slug: str) -> str | None:
    # Known page wrappers from page_precedent/parsePage, and the MCP JSON/SSE
    # envelope from packages/research/mcp-wire.ts. Never broadly unescape text.
    try:
        if any(line.startswith("data: ") for line in raw.splitlines()):
            messages = [json.loads(line[6:]) for line in raw.splitlines() if line.startswith("data: ")]
            parsed = messages[-1]
        else:
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                return raw
        if not isinstance(parsed, dict) or parsed.get("error"):
            return None
        if "result" in parsed or isinstance(parsed.get("content"), list):
            result = parsed.get("result", parsed)
            if not isinstance(result, dict) or result.get("isError"):
                return None
            content = result.get("content")
            if not isinstance(content, list) or not content or content[0].get("type") != "text":
                return None
            text = content[0].get("text")
            if not isinstance(text, str):
                return None
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                return text
        if not isinstance(parsed, dict):
            return None
        page = parsed.get("page", parsed.get("data", parsed))
        if isinstance(page, dict):
            page = page.get("page", page)
        if not isinstance(page, dict) or page.get("slug", slug) != slug:
            return None
        return next((page[key] for key in ("content", "body", "compiled_truth", "compiledTruth", "text")
                     if isinstance(page.get(key), str) and page[key]), None)
    except (ValueError, TypeError, AttributeError, IndexError):
        return None


def write_gbrain(slug: str, title: str, body: str, run=lifecycle.run) -> bool:
    """Stored means read back with the body in it (JOV-7715). The page goes on stdin, which
    both the gbrain CLI and Gem's MCP wrapper read (the wrapper ignored `--content` and stored
    an empty page). Exit codes are advisory: the wrapper exits 0 on a failed call and the CLI
    can hang after a successful write, so only the read-back proves the memo exists."""
    page = f"---\ntype: decision\ntitle: {json.dumps(title[:150])}\ntags: [summer, reasoning-router]\n---\n\n{body}\n"
    if not body.strip():
        return False
    try:
        run(["gbrain", "put", slug], input=page, capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        pass
    except OSError:
        return False
    try:
        stored = run(["gbrain", "get", slug], capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.SubprocessError):
        return False
    document = _memo_document(stored.stdout or "", slug)
    if document is None:
        return False
    # Compare the whole memo, including its middle. GBrain may return its page
    # frontmatter or only the compiled body; final newline is not content.
    actual = re.sub(r"\A---\s*\n.*?\n---\s*(?:\n|$)", "", document, flags=re.S)
    return stored.returncode == 0 and actual.rstrip("\n") == body.rstrip("\n")


PUBLICATION_SCHEMA = "jovie.reason-publication/v1"
PUBLICATION_INPUT_QUERY = 'query($id:String!){issue(id:$id){id identifier title description state{name}}}'
PUBLICATION_FIELDS = ("input", "inputDigest", "outcome", "outcomeDigest", "context", "memoTitle", "memoBody", "commentId")


def _digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                     ensure_ascii=False).encode()).hexdigest()


def _publication_input(issue: dict) -> dict:
    return {key: issue.get(key) or "" for key in ("id", "identifier", "title", "description")}


def publication_path(state: Path, issue: dict) -> Path:
    # Issue identifiers and fetched descriptions are not filesystem authority.
    return state / "reason-results" / (hashlib.sha256(str(issue["id"]).encode()).hexdigest() + ".json")


def pending_publication(state: Path, issue: dict) -> bool:
    path = publication_path(state, issue)
    return path.exists() or path.is_symlink()


def _save_publication(path: Path, value: dict) -> None:
    directory = path.parent
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if directory.is_symlink() or path.is_symlink() or directory.stat().st_uid != os.getuid():
        raise OSError("reason-result-path-unsafe")
    directory.chmod(0o700)
    previous = os.umask(0o077)
    try:
        atomic_write_text(path, json.dumps(value, ensure_ascii=False))
    finally:
        os.umask(previous)
    path.chmod(0o600)
    with path.open("rb") as handle:
        os.fsync(handle.fileno())
    fd = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _valid_publication(saved, issue: dict) -> bool:
    if not isinstance(saved, dict) or saved.get("schema") != PUBLICATION_SCHEMA:
        return False
    outcome, publication = saved.get("outcome"), saved.get("publication")
    if (not isinstance(outcome, dict) or not isinstance(outcome.get("record"), dict)
            or not isinstance(outcome.get("comment"), str) or not isinstance(publication, dict)
            or publication.get("status") not in {"pending", "blocked", "published"}):
        return False
    record = outcome["record"]
    if (record.get("schema") != RESULT_SCHEMA or record.get("job") != issue["identifier"]
            or record.get("confidence") not in {"failed", "low", "high", "research"}):
        return False
    try:
        digest = saved["inputDigest"]
        return (digest == _digest(_publication_input(issue)) == _digest(saved["input"])
                and saved["outcomeDigest"] == _digest(outcome)
                and saved["payloadDigest"] == _digest({key: saved[key] for key in PUBLICATION_FIELDS})
                and saved["commentId"] == str(uuid.uuid5(uuid.NAMESPACE_URL, "jovie-reason:" + issue["id"] + ":" + digest)))
    except (KeyError, TypeError, ValueError):
        return False


def _blocked_publication(record: dict, reason: str) -> dict:
    action = ("The incumbent must reconcile the retained result and obtain current deadline authority before "
              "any publication; do not rerun the model." if reason == "reason-result-deadline-passed" else
              "Reconcile this exact saved result and its destination readback; resume the existing job without "
              "another model run. Changed input or corrupt state requires the incumbent to preserve and reconcile "
              "the saved artifact first.")
    return {**record, "gbrainSlug": None, "publication": {"status": "blocked", "reason": reason,
            "owner": "reason-lane", "nextAction": action}}


def _queue_publication_retry(linear, issue: dict) -> None:
    # A worker releases its run lease on return. Restore only the exact input it
    # accepted; changed input/state remains with its authoritative current owner.
    try:
        data = linear.gql(PUBLICATION_INPUT_QUERY, {"id": issue["id"]})
        current = data.get("issue") if isinstance(data, dict) else None
        if (isinstance(current, dict) and _publication_input(current) == _publication_input(issue)
                and (current.get("state") or {}).get("name") == "In Progress"):
            linear.move(issue["id"], "Todo")
    except Exception:
        pass  # The durable blocked receipt still names the recovery owner.


def _publish_comment(linear, issue_id: str, comment_id: str, body: str) -> dict:
    # Same exact-ID readback and deterministic CommentCreateInput route as the
    # lane event-delivery journal. Linear.gql retains its budget/cooldown guard.
    def read():
        try:
            result = linear.gql('query($id:String!){comment(id:$id){id body createdAt issue{id}}}', {"id": comment_id})
        except RuntimeError as error:
            if str(error) == "linear: Entity not found: Comment":
                return None
            raise
        if not isinstance(result, dict) or "comment" not in result:
            raise RuntimeError("reason-comment-readback-unavailable")
        found = result["comment"]
        if found is not None and (not isinstance(found, dict) or found.get("id") != comment_id
                or found.get("body") != body or (found.get("issue") or {}).get("id") != issue_id
                or not found.get("createdAt")):
            raise RuntimeError("reason-comment-readback-mismatch")
        return found
    found = read()
    if found is None:
        linear.gql('mutation($i:CommentCreateInput!){commentCreate(input:$i){success}}',
                   {"i": {"id": comment_id, "issueId": issue_id, "body": body}})
        found = read()
    if found is None:
        raise RuntimeError("reason-comment-readback-unconfirmed")
    return found


def _publish_saved(linear, issue: dict, saved: dict, path: Path, run, is_expired) -> dict:
    record = saved["outcome"]["record"]
    expected = "Canceled" if record["confidence"] == "failed" else "Done"
    def current():
        value = linear.gql(PUBLICATION_INPUT_QUERY, {"id": issue["id"]})
        actual = value.get("issue") if isinstance(value, dict) else None
        if not isinstance(actual, dict) or _digest(_publication_input(actual)) != saved["inputDigest"]:
            raise RuntimeError("reason-result-input-changed-or-unavailable")
        if (actual.get("state") or {}).get("name") not in {"Todo", "In Progress", expected}:
            raise RuntimeError("reason-result-owner-state-changed")
        if is_expired(actual):
            raise RuntimeError("reason-result-deadline-passed")
        return actual
    try:
        current()
        if record.get("gbrainSlug"):
            title = saved["memoTitle"]
            if not write_gbrain(record["gbrainSlug"], title, saved["memoBody"], run=run):
                raise RuntimeError("reason-memo-readback-unverified")
        current()  # Input may have changed while an external dependency ran.
        comment = _publish_comment(linear, issue["id"], saved["commentId"], saved["outcome"]["comment"])
        saved["publication"].update(linearCommentId=comment["id"], linearCreatedAt=comment["createdAt"])
        _save_publication(path, saved)
        actual = current()
        if (actual.get("state") or {}).get("name") != expected:
            linear.move(issue["id"], expected)
        if (current().get("state") or {}).get("name") != expected:
            raise RuntimeError("reason-result-terminal-state-unconfirmed")
        saved["publication"].update(status="published", reason=None, owner="reason-lane", nextAction=None)
        _save_publication(path, saved)
        return {**record, "publication": saved["publication"]}
    except Exception as error:
        safe = str(error) if str(error) in {"reason-memo-readback-unverified", "reason-result-input-changed-or-unavailable",
            "reason-result-owner-state-changed", "reason-comment-readback-unavailable", "reason-comment-readback-mismatch",
            "reason-comment-readback-unconfirmed", "reason-result-terminal-state-unconfirmed",
            "reason-result-deadline-passed"} else "reason-publication-unavailable"
        blocked = _blocked_publication(record, safe)
        saved["publication"].update(blocked["publication"])
        _save_publication(path, saved)
        _queue_publication_retry(linear, issue)
        return {**blocked, "publication": saved["publication"]}



def resume_result(linear, issue: dict, state: Path, *, is_expired, invalid_record, run) -> dict | None:
    """Recover the exact retained artifact before any new model work."""
    path = publication_path(state, issue)
    if pending_publication(state, issue):
        try:
            info, directory = path.lstat(), path.parent.lstat()
            if (not stat.S_ISREG(info.st_mode) or not stat.S_ISDIR(directory.st_mode)
                    or info.st_uid != os.getuid() or directory.st_uid != os.getuid()
                    or stat.S_IMODE(info.st_mode) != 0o600 or stat.S_IMODE(directory.st_mode) != 0o700):
                raise ValueError("unsafe result path")
            saved = json.loads(path.read_text())
            if not _valid_publication(saved, issue):
                raise ValueError("invalid result identity")
        except (OSError, ValueError, TypeError, KeyError):
            record = invalid_record()
            blocked = _blocked_publication(record, "reason-saved-result-invalid-or-input-changed")
            _save_publication(path.with_suffix(".blocked.json"), blocked)
            _queue_publication_retry(linear, issue)
            return blocked
        if is_expired(issue):
            blocked = _blocked_publication(saved["outcome"]["record"], "reason-result-deadline-passed")
            saved["publication"].update(blocked["publication"])
            _save_publication(path, saved)
            _queue_publication_retry(linear, issue)
            return blocked
        return _publish_saved(linear, issue, saved, path, run, is_expired)
    return None


def publish_result(linear, issue: dict, job: dict, config: dict, state: Path, outcome: dict,
                   context: str, source_digest: str, *, render, is_expired, run) -> dict:
    """Seal complete produced bytes, then verify the authorized destinations."""
    path = publication_path(state, issue)
    record = outcome["record"]
    source = _publication_input(issue)
    digest = _digest(source)
    provenance = {"inputDigest": digest, "configDigest": _digest(config),
                  "contextDigest": hashlib.sha256(context.encode()).hexdigest(),
                  "sourceDigest": source_digest}
    record["provenance"] = provenance
    if record.get("gbrainSlug"):
        record["gbrainSlug"] += "-" + digest[:12]
    outcome["comment"] = render(record, outcome.get("proposal"), outcome.get("review"), outcome.get("research"))
    title = f"Summer decision {job['identifier']}: {job['question'][:100]}"
    saved = {"schema": PUBLICATION_SCHEMA, "input": source, "inputDigest": digest, "outcome": outcome,
             "outcomeDigest": _digest(outcome), "context": context, "memoTitle": title,
             "memoBody": f"# {title}\n\n" + render(record, outcome.get("proposal"),
                 outcome.get("review"), outcome.get("research"), research_limit=None).replace(RESULT_MARKER, ""),
             "commentId": str(uuid.uuid5(uuid.NAMESPACE_URL, "jovie-reason:" + issue["id"] + ":" + digest)),
             "publication": {"status": "pending", "owner": "reason-lane", "reason": "not-yet-published",
                             "nextAction": "Publish and read back this exact saved result without model work."}}
    saved["payloadDigest"] = _digest({key: saved[key] for key in PUBLICATION_FIELDS})
    _save_publication(path, saved)  # Produced bytes survive before any result publication.
    return _publish_saved(linear, issue, saved, path, run, is_expired)

