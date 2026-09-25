"""Project native Codex notifications into candidate worker/commit evidence.

This is not a terminal outcome: the existing consumer must independently verify
its task/lease, official runtime session, stopped execution, CI, merge and release.
No prompts, tool output, account identity or credentials enter the projection.
"""
from __future__ import annotations

from datetime import datetime, timezone
from copy import deepcopy
import hashlib
import json
import re
from typing import Callable

SCHEMA = "symphony-shipping-worker-candidate/v1"
SHA = re.compile(r"[a-f0-9]{40}")
DIGEST = re.compile(r"[a-f0-9]{64}")
IDENTIFIER = re.compile(r"JOV-[1-9][0-9]{0,6}")
ID = re.compile(r"[A-Za-z0-9_-]{1,256}")


def digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                     ensure_ascii=False).encode()).hexdigest()


def git_snapshot(value: object) -> dict:
    if (not isinstance(value, dict) or set(value) != {"head", "clean"}
            or not isinstance(value["head"], str) or not SHA.fullmatch(value["head"])
            or type(value["clean"]) is not bool):
        raise ValueError("worker evidence Git snapshot invalid")
    return dict(value)


class NativeTurnEvidence:
    """One bound native app-server stream; ambiguous lifecycle poisons proof.

    The caller supplies a verified admission binding and reads Git directly from
    that worker's verified workspace. Notification payloads never select paths,
    commands, credentials, task identity, or the runtime generation.
    """

    def __init__(self, binding: dict, *, git: Callable[[], dict],
                 now: Callable[[], datetime] = lambda: datetime.now(timezone.utc)):
        required = {"taskDigest", "issueId", "identifier", "invocationId",
                    "runtimeGeneration", "workspace", "producerSha256"}
        if (not isinstance(binding, dict) or set(binding) != required
                or any(not isinstance(binding[key], str) for key in required)
                or not all(DIGEST.fullmatch(binding[key]) for key in
                           ("taskDigest", "runtimeGeneration", "producerSha256"))
                or not re.fullmatch(r"[a-f0-9]{32}", binding["invocationId"])
                or not re.fullmatch(r"[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}", binding["issueId"])
                or not IDENTIFIER.fullmatch(binding["identifier"])
                or not binding["workspace"].startswith("/")
                or ".." in binding["workspace"].split("/")
                or any(ord(char) < 32 for char in binding["workspace"])):
            raise ValueError("worker evidence binding invalid")
        self.binding = dict(binding)
        self.git = git
        self.now = now
        self.thread_id = None
        self.base = None
        self.active = None
        self.seen = set()
        self.candidate = None
        self.poisoned = False
        self.last_observed = None

    def _time(self) -> str:
        now = self.now()
        if now.tzinfo is None or now.utcoffset().total_seconds() != 0:
            raise ValueError("worker evidence clock must be UTC")
        if self.last_observed is not None and now < self.last_observed:
            raise ValueError("worker evidence clock moved backwards")
        self.last_observed = now
        return now.isoformat().replace("+00:00", "Z")

    def observe(self, notification: object) -> dict | None:
        if self.poisoned:
            raise ValueError("worker evidence stream is poisoned")
        try:
            return self._observe(notification)
        except Exception:
            self.candidate = None
            self.poisoned = True
            raise

    def _observe(self, notification: object) -> dict | None:
        # Responses and nested tool text are never lifecycle notifications.
        if not isinstance(notification, dict) or "id" in notification:
            return None
        method = notification.get("method")
        if method not in {"thread/started", "turn/started", "turn/completed"}:
            return None
        params = notification.get("params")
        if not isinstance(params, dict):
            raise ValueError("worker evidence notification malformed")
        if method == "thread/started":
            thread = params.get("thread")
            if (self.thread_id is not None or not isinstance(thread, dict)
                    or not isinstance(thread.get("id"), str) or not ID.fullmatch(thread["id"])
                    or thread.get("cwd") != self.binding["workspace"]):
                raise ValueError("worker evidence thread is ambiguous or cross-bound")
            self.thread_id = thread["id"]
            self.base = git_snapshot(self.git())
            if not self.base["clean"]:
                raise ValueError("worker evidence initial workspace is dirty")
            self.thread_started_at = self._time()
            return None
        turn = params.get("turn")
        if (self.thread_id is None or params.get("threadId") != self.thread_id
                or not isinstance(turn, dict) or not isinstance(turn.get("id"), str)
                or not ID.fullmatch(turn["id"])):
            raise ValueError("worker evidence turn is cross-bound")
        turn_id = turn["id"]
        if method == "turn/started":
            # A later turn invalidates the previous candidate until it completes.
            self.candidate = None
            if (self.active is not None or turn_id in self.seen or len(self.seen) >= 256
                    or turn.get("status") != "inProgress"):
                raise ValueError("worker evidence turn lifecycle invalid")
            self.seen.add(turn_id)
            self.active = {"id": turn_id, "startedAt": self._time()}
            return None
        if self.active is None or self.active["id"] != turn_id:
            raise ValueError("worker evidence completion has no matching start")
        status = turn.get("status")
        if status not in {"completed", "failed", "interrupted"}:
            raise ValueError("worker evidence completion status invalid")
        started_at = self.active["startedAt"]
        self.active = None
        self.candidate = None
        observed_at = self._time()
        # Completion is not proof that useful work occurred. Failed/interrupted
        # turns and unchanged/dirty Git heads cannot become useful candidates.
        if status != "completed" or turn.get("error") is not None:
            return None
        final = git_snapshot(self.git())
        if not final["clean"] or final["head"] == self.base["head"]:
            return None
        value = {
            "schema": SCHEMA, **self.binding,
            "threadId": self.thread_id, "turnId": turn_id,
            "sessionId": f"{self.thread_id}-{turn_id}",
            "sessionIds": [f"{self.thread_id}-{seen}" for seen in sorted(self.seen)],
            "threadStartedAt": self.thread_started_at,
            "startedAt": started_at, "observedAt": observed_at,
            "executionBaseHead": self.base["head"], "executionFinalHead": final["head"],
            "turnStatus": "completed", "executionTerminated": False,
        }
        self.candidate = {**value, "digest": digest(value)}
        return deepcopy(self.candidate)

    def finish(self) -> dict | None:
        """EOF is not execution proof; incomplete final turns produce no candidate."""
        if self.poisoned or self.active is not None or self.candidate is None:
            return None
        return deepcopy(self.candidate)


def capture_stream(source, destination, reader: NativeTurnEvidence, publish: Callable[[dict], None],
                   *, max_line_bytes: int = 1024 * 1024) -> bool:
    """Copy native stdout exactly; publish only after complete, valid stream EOF.

    Oversized, partial, malformed or ambiguous lifecycle input invalidates this
    evidence attempt while preserving protocol output. A broken downstream pipe
    stops immediately and never publishes a candidate. Publication errors surface.
    """
    if type(max_line_bytes) is not int or max_line_bytes < 1:
        raise ValueError("worker evidence line bound invalid")
    pending = bytearray()
    invalid = False
    skipping = False
    while True:
        chunk = source.read1(65536)
        if not chunk:
            break
        for part_index, part in enumerate(chunk.split(b"\n")):
            if part_index:
                if pending and not skipping and not invalid:
                    try:
                        reader.observe(json.loads(pending.decode("utf-8")))
                    except Exception:
                        # Optional observation must not corrupt the native stream.
                        # The reader poisons this attempt before propagating.
                        invalid = True
                pending.clear()
                skipping = False
            if not skipping:
                if len(pending) + len(part) > max_line_bytes:
                    pending.clear()
                    skipping = True
                    invalid = True
                else:
                    pending.extend(part)
        # Observe each completed notification before releasing its newline to
        # Symphony, which may immediately start work or remove the workspace.
        destination.write(chunk)
        destination.flush()
    # Native JSON-RPC is newline-delimited. Never repair truncated JSON at EOF.
    candidate = reader.finish()
    if invalid or pending or skipping or candidate is None:
        return False
    publish(candidate)
    return True
