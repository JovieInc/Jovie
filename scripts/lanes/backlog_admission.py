"""Fail-closed Backlog admission observations; never transition or dispatch authority.

The collector joins actual canonical reads before using ``project``. Native
worker predicates are reused, never reimplemented. This module has no admission
writer, provider invocation, claim, reservation or reentry grant.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime
import hashlib
import base64
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import stat
import sys
import subprocess
import time
from types import SimpleNamespace
import zlib

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import execution_attempt

SCHEMA = "jovie.backlog-admission-observation/v1"
MAX_AGE_S = 60
FLEET_OBSERVER_SOURCES = ("gem-priority-gate.py", "closure_health.py", "gem_gate_contract.py",
                          "summer_ci_audit.py", "symphony_proof_context.py")
ISSUE_OWNER = "Summer backlog governor / JOV-7073"
RUNTIME_OWNER = "Symphony admission owner / JOV-8022"
ATTEMPT_OWNER = "Symphony execution reentry owner / JOV-7089"
RESOURCE_OWNER = "Symphony capacity-before-lease owner / JOV-6030"
IDENTITY_FIELDS = ("id", "identifier", "state", "updatedAt", "priority")
RUNTIME_FIELDS = ("installedPath", "sourceHash", "policyHash", "releaseTree")
MAX_PAGES = 100
CONNECTIONS = {
    "labels": "id name",
    "comments": "id body createdAt user{id name}",
    "attachments": "id title url",
    "children": "id identifier state{name type}",
    "relations": "id type relatedIssue{id identifier}",
    "inverseRelations": "id type issue{id identifier}",
}
CORE = ("id identifier title description createdAt updatedAt priority archivedAt "
        "state{name type} assignee{id name} delegate{id name} parent{id identifier}")


class Unavailable(RuntimeError):
    """A named read boundary failed; never include transport secrets in its text."""


def _json_file(path, schema=None):
    value = json.loads(path.read_text())
    if not isinstance(value, dict) or schema and value.get("schema") != schema:
        raise Unavailable("canonical-file-schema:" + path.name)
    return value


def _work_input_digest(path: Path) -> str | None:
    """Bound raw-byte evidence to one stable regular inode, without blocking FIFO opens.

    Same bounded descriptor pattern as lane_runner.maintenance_json. The raw
    bytes (not reserialized JSON) remain the preimage. Missing is evidence only
    when the initial lstat was missing, never after an observed inode disappears.
    """
    limit = 1024 * 1024
    try:
        before = path.lstat()
    except FileNotFoundError:
        return None
    fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
    try:
        opened = os.fstat(fd)
        identity = lambda info: (info.st_dev, info.st_ino, info.st_size,
                                 info.st_mtime_ns, info.st_ctime_ns)
        if (not stat.S_ISREG(opened.st_mode) or opened.st_size > limit
                or identity(before) != identity(opened)):
            raise ValueError("fleet-work-input-not-bounded-regular")
        with os.fdopen(fd, "rb", closefd=False) as handle:
            raw = handle.read(limit + 1)
        if (len(raw) > limit or len(raw) != opened.st_size
                or identity(os.fstat(fd)) != identity(opened)
                or identity(path.lstat()) != identity(opened)):
            raise ValueError("fleet-work-input-changed-during-read")
        return hashlib.sha256(raw).hexdigest()
    finally:
        os.close(fd)

def _fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _paged(fetch, *, limit=100, maximum=MAX_PAGES, recheck=True):
    """Read bounded REST pages, then detect insertions or edits of the first page.

    The caller retains the START timestamp. A later completion never freshens an
    earlier page. A full final page requires another page proving termination.
    """
    pages = []
    for number in range(1, maximum + 1):
        page = fetch(number)
        if not isinstance(page, list) or len(page) > limit:
            raise Unavailable("malformed-page")
        pages.append(page)
        if len(page) < limit:
            if recheck and _fingerprint(fetch(1)) != _fingerprint(pages[0]):
                raise Unavailable("paged-history-changed")
            return pages
    raise Unavailable("pagination-bound-exhausted")


def _dependency_ids(issue):
    # Linear stores prerequisite `blocks` edges on inverseRelations. Outgoing
    # blocked_by variants remain supported; an outgoing blocks edge is a child.
    outgoing = [r.get("relatedIssue", {}).get("id") for r in issue["relations"]["nodes"]
                if r.get("type") in {"blocked_by", "blockedBy"}]
    incoming = [r.get("issue", {}).get("id") for r in issue["inverseRelations"]["nodes"]
                if r.get("type") == "blocks"]
    if any(not isinstance(value, str) or not value for value in outgoing + incoming):
        raise Unavailable("dependency-identity-unreadable")
    return sorted(set(outgoing + incoming))


def _issue_digest(issue):
    value = dict(issue)
    for name in CONNECTIONS:
        connection = issue.get(name) or {}
        nodes = connection.get("nodes")
        if not isinstance(nodes, list) or (connection.get("pageInfo") or {}).get("hasNextPage") is not False:
            raise Unavailable("prepared-issue-connection-incomplete")
        value[name] = {"nodes": sorted(nodes, key=lambda row: row["id"])}
    return _fingerprint(value)


def _metadata_projection(issue):
    value = {key: issue.get(key) for key in ("id", "identifier", "title", "description", "createdAt", "updatedAt", "priority", "archivedAt", "state", "assignee", "delegate", "parent")}
    connection = issue.get("labels") or {}
    if not isinstance(connection.get("nodes"), list) or (connection.get("pageInfo") or {}).get("hasNextPage") is not False:
        raise Unavailable("global-cohort-labels-incomplete")
    value["labels"] = sorted(connection["nodes"], key=lambda row: row["id"])
    return value


def _metadata_digest(issue):
    return _fingerprint(_metadata_projection(issue))


def _as_native(lane, row):
    return lane.Issue(row["id"], row["identifier"], row.get("title") or "", row.get("description") or "",
                      row["priority"], row["createdAt"], [label["name"] for label in row["labels"]["nodes"]])


def _pr_digest(rows, *, raw=False):
    if raw:
        rows = [{"number": row["number"], "title": row.get("title"), "body": row.get("body"),
                 "headRefName": (row.get("head") or {}).get("ref"), "headRefOid": (row.get("head") or {}).get("sha"),
                 "baseRefName": (row.get("base") or {}).get("ref"), "baseRefOid": (row.get("base") or {}).get("sha"),
                 "labels": row.get("labels"), "isDraft": row.get("draft")} for row in rows]
    keys = ("number", "title", "body", "headRefName", "headRefOid", "baseRefName", "baseRefOid", "isDraft")
    return _fingerprint(sorted(({**{key: row.get(key) for key in keys},
                                "labels": sorted(label["name"] for label in row.get("labels") or [])}
                               for row in rows), key=lambda row: row["number"]))


class _SharedReads:
    """Private prepared context owns its actual snapshots; no caller packet/cache."""
    def __init__(self, native, cohort):
        self.native = native
        self.cohort_digest = _fingerprint([(row["id"], _metadata_digest(row)) for row in cohort])
        self.metadata_preimages = {row["id"]: _metadata_digest(row) for row in cohort}
        self.issue_preimages, self.full_rows = {}, {}
        self.core_preimages, self.local_preimages, self.file_preimages, self.runtime_preimages = {}, {}, {}, {}
        self._local_only, self._codex_proof = False, None
        self.ordering_pool = [_as_native(native.lane, row) for row in cohort
                              if row["state"]["name"] == "Todo" or "agent-ready" in _as_native(native.lane, row).labels]
        self.pr_observed_at = time.time()
        self._prs = native.open_prs()
        self.history_observed_at = time.time()
        self._history = native.history()
        self.attempts = _attempt_receipts(self._history)

    def __getattr__(self, name):
        return getattr(self.native, name)

    def issue(self, identity, *, full=True):
        row = self.native.issue(identity, full=full)
        if full:
            if row["id"] in self.metadata_preimages and _metadata_digest(row) != self.metadata_preimages[row["id"]]:
                raise Unavailable("prepared-cohort-issue-metadata-changed")
            digest = _issue_digest(row)
            if row["id"] in self.issue_preimages and digest != self.issue_preimages[row["id"]]:
                raise Unavailable("prepared-issue-dependency-preimage-changed")
            self.issue_preimages[row["id"]] = digest
            self.full_rows[row["id"]] = row
        else:
            digest = _fingerprint(row)
            if row["id"] in self.core_preimages and digest != self.core_preimages[row["id"]]:
                raise Unavailable("prepared-dependency-state-changed")
            self.core_preimages[row["id"]] = digest
        return row

    def observe_local(self, preimages):
        if any(path in self.local_preimages and digest != self.local_preimages[path] for path, digest in preimages.items()):
            raise Unavailable("prepared-native-custody-changed")
        self.local_preimages.update(preimages)

    def observe_file(self, path, value):
        digest = _fingerprint(value)
        if path in self.file_preimages and digest != self.file_preimages[path]:
            raise Unavailable("prepared-native-history-changed")
        self.file_preimages[path] = digest

    def observe_runtime(self, row, runtime):
        value = {**runtime, "resources": {key: value for key, value in runtime["resources"].items() if key != "observedAt"}}
        value.pop("observedAt", None)
        digest = _fingerprint(value)
        previous = self.runtime_preimages.get(row["id"])
        if previous and digest != previous[1]:
            raise Unavailable("prepared-native-eligibility-changed")
        self.runtime_preimages[row["id"]] = (row, digest)

    def assert_local(self):
        """Local-only checks; no query, GH call, cache fill, lease or lock."""
        if any(not 0 <= time.time() - stamp <= MAX_AGE_S for stamp in (self.pr_observed_at, self.history_observed_at)):
            raise Unavailable("prepared-shared-read-stale")
        self.native.validate_runtime()
        if any(_fingerprint(_json_file(path)) != digest for path, digest in self.local_preimages.items()):
            raise Unavailable("prepared-native-custody-changed")
        if any(_fingerprint(path.read_text()) != digest for path, digest in self.file_preimages.items()):
            raise Unavailable("prepared-native-history-changed")
        self._local_only = True
        try:
            for row, _ in list(self.runtime_preimages.values()):
                runtime, _, _, preimages = _native_runtime(self, row, self._prs, self.native.binding, time.time())
                self.observe_local(preimages)
                self.observe_runtime(row, runtime)
        finally:
            self._local_only = False

    def open_prs(self):
        return self._prs

    def history(self):
        return self._history

    def recheck(self):
        now = time.time()
        if any(not 0 <= now - stamp <= MAX_AGE_S for stamp in (self.pr_observed_at, self.history_observed_at)):
            raise Unavailable("prepared-shared-read-stale")
        rows = self.native.cohort()
        digest = _fingerprint([(row["id"], _metadata_digest(row)) for row in rows])
        if digest != self.cohort_digest:
            raise Unavailable("global-cohort-preimage-changed")
        for identity, digest in list(self.issue_preimages.items()):
            if _issue_digest(self.native.issue(identity)) != digest:
                raise Unavailable("prepared-issue-dependency-preimage-changed")
        for identity, digest in list(self.core_preimages.items()):
            if _fingerprint(self.native.issue(identity, full=False)) != digest:
                raise Unavailable("prepared-dependency-state-changed")
        metadata = [row for page in self.native.pr_metadata() for row in page]
        if _pr_digest(metadata, raw=True) != _pr_digest(self._prs):
            raise Unavailable("prepared-open-pr-preimage-changed")
        first = self.native.gh("repos/JovieInc/Jovie/commits/" + execution_attempt.GITHUB_LEDGER_ANCHOR + "/statuses?per_page=100&page=1")
        if _fingerprint(first) != _fingerprint(self._history[0]):
            raise Unavailable("prepared-attempt-first-page-changed")
        self.native.validate_runtime()
        if hasattr(self.native, "canonical_main"):
            self.native.canonical_main(revalidate=True)
        if any(not 0 <= time.time() - stamp <= MAX_AGE_S for stamp in (self.pr_observed_at, self.history_observed_at)):
            raise Unavailable("prepared-shared-read-stale")
        return rows


class _PreparedGuard:
    """One isolated, non-authorizing read pass; contains no locks or writers.

    ``revalidate`` performs network reads. Its caller owns lock scheduling and
    the canonical writer fence. It must not hold global claim.lock while doing a
    slow network preparation. This object never acquires or hands off a lock.
    """
    def __init__(self, state, identifier, *, reads=None, row=None, binding=None, started=None, failure=None):
        self.canonical_state_path = str(state)
        self.issue_id = row.get("id") if row else None
        self.priority = row.get("priority") if row else None
        self._identifier, self._row, self._binding = identifier, row, binding
        self._started, self._native = started, reads
        if reads is not None:
            reads.binding = binding
        self._reads, self._cohort = None, []
        self._observation = failure or _observation(identifier, [])
        if failure is None:
            self._run(first=True)

    @property
    def observation(self):
        # Returning a copy cannot change the private prepared preimage.
        return json.loads(json.dumps(self._observation))

    def _unknown(self, code, evidence):
        return _hold(code, RUNTIME_OWNER, evidence,
                     "Re-observe through the incumbent governor/native owner; unknown higher-priority eligibility never clears a lower candidate.")

    def _project(self, row, *, ordering=False):
        if any(name not in row for name in CONNECTIONS):
            row = self._reads.full_rows.get(row["id"]) or self._reads.issue(row["id"])
        value = _collect_packet(self._reads, row, self._binding, self._started)
        return project_backlog_admission(value, now=time.time(), canonical_state_path=self.canonical_state_path,
                                         _ordering_only=ordering)

    def _readiness_hold(self, row):
        if row["state"]["name"] == "Backlog" and "agent-ready" not in _as_native(self._native.lane, row).labels:
            return _hold("backlog-readiness-not-established", ISSUE_OWNER, row["identifier"],
                         "Existing Summer readiness owner must qualify the work before canonical Backlog admission.")
        return None

    def _cheap_hold(self, row):
        native = _as_native(self._native.lane, row)
        if row.get("archivedAt"):
            return _hold("parent-or-archived", ISSUE_OWNER, row["identifier"], "Preserve the parent contract and advance its actual leaf owner.")
        if type(row.get("priority")) is not int or row["priority"] not in (1, 2, 3, 4):
            return _hold("priority-invalid", ISSUE_OWNER, row["identifier"], "The existing priority owner must supply a valid explicit tier; no Urgent value is inferred.")
        readiness = self._readiness_hold(row)
        if readiness:
            return readiness
        work_key = execution_attempt.identity("linear-work", {"issue": row["identifier"], "outcome": "draft-pr"}, {})["workKey"]
        if work_key in self._reads.attempts:
            return _hold("existing-attempt-reentry-owner-hold", ATTEMPT_OWNER, row["identifier"], "Use the existing certified reentry owner; preserve prior custody.")
        runtime, own_prs, pending, preimages = _native_runtime(self._reads, row, self._reads.open_prs(), self._binding, time.time())
        self._reads.observe_local(preimages)
        worker = runtime["worker"]
        if own_prs or pending or any(worker[key] for key in ("rejection", "poolRejection", "heldBack", "inFlight", "claims")):
            return _hold("native-worker-held", RUNTIME_OWNER,
                         {"identifier": row["identifier"], "worker": worker, "prs": own_prs, "pending": pending},
                         "Preserve the existing native worker, custody, routing, repair or hotspot owner.")
        row = self._reads.issue(row["id"])
        if row["children"]["nodes"]:
            return _hold("parent-or-archived", ISSUE_OWNER, row["identifier"], "Preserve the parent contract and advance its actual leaf owner.")
        for identity in _dependency_ids(row):
            dep = self._reads.issue(identity, full=False)
            if not isinstance(dep.get("state"), dict) or not all(isinstance(dep["state"].get(key), str) for key in ("name", "type")):
                raise Unavailable("dependency-state-unreadable")
            if dep["state"]["type"] != "completed" or dep["state"]["name"] != "Done":
                return _hold("dependency-not-fulfilled", (dep.get("assignee") or {}).get("name") or dep["identifier"] + " owner",
                             {"issue": row["identifier"], "dependency": dep["identifier"], "state": dep.get("state")},
                             "The prerequisite owner must finish its actual acceptance contract.")
        return None

    def _run(self, *, first=False):
        try:
            if first:
                self._cohort = self._native.cohort()
                if self.issue_id not in {row["id"] for row in self._cohort}:
                    raise Unavailable("selected-issue-outside-authorized-cohort")
                self._reads = _SharedReads(self._native, self._cohort)
                self._reads.issue_preimages[self.issue_id] = _issue_digest(self._row)
            else:
                self._cohort = self._reads.recheck()
            current = Path(self.canonical_state_path) / "current"
            if str(current.resolve()) != self._binding["installedPath"]:
                raise Unavailable("installed-runtime-changed")
            row = self._reads.issue(self.issue_id)
            # Urgent/P0 cohort membership ranks work; it does not establish the
            # readiness required of both the selected issue and predecessors.
            readiness = self._readiness_hold(row)
            if readiness:
                self._observation = _observation(self._identifier, [readiness],
                                                 {"statePath": self.canonical_state_path, "observedAt": self._started, "readOnly": True})
                return self.observation
            selected = _as_native(self._native.lane, row)
            rank_now = time.time()
            rank = (self._native.lane.admission_order(selected, rank_now), selected.id)
            higher = sorted((other for other in self._cohort if other["id"] != selected.id),
                            key=lambda other: (self._native.lane.admission_order(_as_native(self._native.lane, other), rank_now), other["id"]))
            holds, predecessor_holds = [], []
            for other in higher:
                if (self._native.lane.admission_order(_as_native(self._native.lane, other), rank_now), other["id"]) >= rank:
                    continue
                if other["state"]["name"] == "Todo":
                    predecessor_holds.append({"issue": other["identifier"], "code": "already-admitted-native-Todo-ordering",
                                              "owner": RUNTIME_OWNER, "evidence": {"state": "Todo", "updatedAt": other["updatedAt"]},
                                              "nextAction": "Preserve existing workers and let native claim ordering select eligible Urgent Todo before lower-priority unclaimed work."})
                    continue
                try:
                    cheap = self._cheap_hold(other)
                    projected = None if cheap else self._project(other, ordering=True)
                except (OSError, ValueError, KeyError, TypeError, AttributeError, RuntimeError, subprocess.SubprocessError) as exc:
                    reason = str(exc) if isinstance(exc, Unavailable) else type(exc).__name__
                    holds.append(self._unknown("higher-ranked-candidate-unknown", {"issue": other["identifier"], "reason": reason}))
                    break
                if cheap:
                    predecessor_holds.append({"issue": other["identifier"], **cheap})
                    continue
                if projected["allowed"]:
                    holds.append(_hold("higher-ranked-candidate-eligible", ISSUE_OWNER,
                                       {"issue": other["identifier"], "priority": other["priority"], "state": other["state"]["name"]},
                                       "The sole Fleet writer must advance this eligible predecessor before the prepared lower candidate."))
                elif any(hold["code"] not in {"dependency-not-fulfilled", "accepted-custody-held", "native-worker-held", "existing-attempt-reentry-owner-hold"}
                         for hold in projected["holds"]):
                    holds.append(self._unknown("higher-ranked-candidate-unknown", {"issue": other["identifier"], "holds": projected["holds"]}))
                else:
                    predecessor_holds.append({"issue": other["identifier"], "holds": projected["holds"]})
                if holds:
                    break  # One positive/unknown predecessor already fences this candidate.
            result = self._project(row)
            result["holds"].extend(holds)
            result["allowed"] = not result["holds"]
            result["evidence"].update(observedAt=self._started, completedAt=time.time(), revalidatedAt=None if first else time.time(), readOnly=True,
                                      cohortDigest=self._reads.cohort_digest, cohortCount=len(self._cohort),
                                      cohortMetadataPreimages={item["id"]: _metadata_projection(item) for item in self._cohort},
                                      predecessorHolds=predecessor_holds, prObservedAt=self._reads.pr_observed_at,
                                      historyObservedAt=self._reads.history_observed_at,
                                      linearPreimagesObservedAt=self._started,
                                      linearPreimages={identity: self._reads.full_rows[identity]
                                                       for identity in sorted({self.issue_id, *_dependency_ids(row)})})
            # Preparation also verifies a complete final cohort, PR and history
            # preimage. Revalidation never silently adopts a changed generation.
            self._reads.recheck()
            if not 0 <= time.time() - self._started <= MAX_AGE_S:
                raise Unavailable("prepared-cohort-read-stale")
            if str(current.resolve()) != self._binding["installedPath"]:
                raise Unavailable("installed-runtime-changed")
            self._observation = result
        except (OSError, ValueError, KeyError, TypeError, AttributeError, RuntimeError, subprocess.SubprocessError) as exc:
            reason = str(exc) if isinstance(exc, Unavailable) else type(exc).__name__
            self._observation = _observation(self._identifier, [self._unknown("prepared-backlog-guard-unavailable", reason)],
                                             {"statePath": self.canonical_state_path, "observedAt": self._started})
        return self.observation

    def revalidate(self):
        if self._reads is None:
            return self.observation
        return self._run()

    def assert_bound(self):
        """Cheap local fence for the parent's lock scope, never an authorization.

        Remote cohort/custody/history were revalidated outside the lock. This
        method asserts their retained freshness and unchanged local source and
        eligibility. It cannot claim atomic remote-system CAS or readback.
        """
        if self._reads is None or not self._observation["allowed"]:
            return self.observation
        try:
            if not 0 <= time.time() - self._started <= MAX_AGE_S:
                raise Unavailable("prepared-cohort-read-stale")
            if str((Path(self.canonical_state_path) / "current").resolve()) != self._binding["installedPath"]:
                raise Unavailable("installed-runtime-changed")
            digest = _fingerprint([(row["id"], _metadata_digest(row)) for row in self._cohort])
            if digest != self._reads.cohort_digest or _issue_digest(self._row) != self._reads.issue_preimages[self.issue_id]:
                raise Unavailable("retained-cohort-binding-changed")
            self._reads.assert_local()
            result = self.observation
            result["evidence"]["localBoundAt"] = time.time()
            return result
        except (OSError, ValueError, KeyError, TypeError, AttributeError, RuntimeError, subprocess.SubprocessError) as exc:
            reason = str(exc) if isinstance(exc, Unavailable) else type(exc).__name__
            self._observation = _observation(self._identifier, [self._unknown("prepared-backlog-local-fence-held", reason)])
            return self.observation


class _NativeReads:
    """Existing authenticated transports, with GET/query-only bounded entrypoints.

    Native Linear quota accounting and token refresh remain its transport's
    responsibility. Neither claim.lock nor a provider seat is taken here.
    """
    def __init__(self, current, state):
        import lane_runner as lane
        if Path(lane.__file__).resolve() != current / "lane_runner.py":
            raise Unavailable("native-module-not-installed")
        self.lane, self.current, self.state = lane, current, state
        self.validate_runtime()
        self.host = lane.Host(state=state)
        self.linear = lane.Linear(self.host.linear_env)
        try:
            lane.load_github_env(_fleet_observation=True)
        except lane.FleetObservationHeld as error:
            raise Unavailable(str(error)) from None
        self.canonical_main()

    def validate_runtime(self):
        manifest = _json_file(self.current / ".release.json", "jovie-lane-release-bundle/v1")
        if manifest.get("bundleDigest") != self.current.parent.parent.name:
            raise Unavailable("installed-release-bundle-mismatch")
        objects = manifest.get("objects")
        policy = objects.get("scripts/fleet-gate/scoped_admission.py") if isinstance(objects, dict) else None
        if not isinstance(policy, str) or not re.fullmatch(r"[a-f0-9]{40}", policy):
            raise Unavailable("installed-fleet-policy-not-manifest-bound")
        self.lane.lifecycle.validate_release(self.current.parent.parent, manifest)
        if getattr(self, "_main_sha", None) is not None:
            if not 0 <= time.time() - self._main_observed_at <= MAX_AGE_S:
                raise Unavailable("canonical-main-observation-stale")

    def canonical_main(self, *, revalidate=False):
        previous = getattr(self, "_main_sha", None)
        if previous is not None and not 0 <= time.time() - self._main_observed_at <= MAX_AGE_S:
            raise Unavailable("canonical-main-observation-stale")
        if previous is None or revalidate:
            started = time.time()
            value = self.gh("repos/JovieInc/Jovie/git/ref/heads/main")
            obj = value.get("object") if isinstance(value, dict) else None
            if (not isinstance(value, dict) or value.get("ref") != "refs/heads/main" or not isinstance(obj, dict) or obj.get("type") != "commit"
                    or not isinstance(obj.get("sha"), str) or not re.fullmatch(r"[a-f0-9]{40}", obj["sha"])):
                raise Unavailable("canonical-main-read-unavailable")
            if previous is not None and obj["sha"] != previous:
                raise Unavailable("canonical-main-changed")
            if previous is None:
                self._main_sha, self._main_observed_at = obj["sha"], started
        if not 0 <= time.time() - self._main_observed_at <= MAX_AGE_S:
            raise Unavailable("canonical-main-observation-stale")
        return self._main_sha

    def query(self, query, variables):
        if not self.linear.admit(1):
            raise Unavailable("linear-native-budget-held")
        value = self.linear.gql(query, variables)
        if not isinstance(value, dict) or value.get("errors"):
            raise Unavailable("linear-query-unreadable")
        return value.get("data", value)

    def issue(self, identity, *, full=True):
        nested = " ".join(name + "(first:50){pageInfo{hasNextPage endCursor} nodes{" + fields + "}}"
                          for name, fields in CONNECTIONS.items()) if full else ""
        row = self.query("query($id:String!){issue(id:$id){" + CORE + " " + nested + "}}", {"id": identity}).get("issue")
        if not isinstance(row, dict) or not row.get("id"):
            raise Unavailable("linear-issue-unreadable")
        if full:
            for name, fields in CONNECTIONS.items():
                nodes, cursor, seen = [], None, set()
                connection = row.get(name) or {}
                for _ in range(MAX_PAGES):
                    page, info = connection.get("nodes"), connection.get("pageInfo") or {}
                    if not isinstance(page, list) or len(page) > 50 or type(info.get("hasNextPage")) is not bool:
                        raise Unavailable("linear-connection-unreadable:" + name)
                    for node in page:
                        if not isinstance(node, dict) or not node.get("id") or node["id"] in seen:
                            raise Unavailable("linear-connection-duplicate-or-unreadable:" + name)
                        seen.add(node["id"])
                    nodes.extend(page)
                    if not info["hasNextPage"]:
                        row[name] = {"nodes": nodes, "pageInfo": {"hasNextPage": False}}
                        break
                    next_cursor = info.get("endCursor")
                    if not isinstance(next_cursor, str) or not next_cursor or next_cursor == cursor:
                        raise Unavailable("linear-cursor-unreadable:" + name)
                    cursor = next_cursor
                    if _ == MAX_PAGES - 1:
                        raise Unavailable("linear-pagination-bound:" + name)
                    value = self.query("query($id:String!,$after:String){issue(id:$id){updatedAt " + name
                                       + "(first:50,after:$after){pageInfo{hasNextPage endCursor} nodes{"
                                       + fields + "}}}}", {"id": row["id"], "after": cursor}).get("issue")
                    if not isinstance(value, dict) or value.get("updatedAt") != row.get("updatedAt"):
                        raise Unavailable("linear-issue-changed-during-pagination")
                    connection = value.get(name) or {}
                else:
                    raise Unavailable("linear-pagination-bound:" + name)
        return row

    def cohort(self):
        """Complete current urgent/P0 and ready High pool; never reclassify priority.

        High admission uses the existing agent-ready + dispatch-next designation,
        preserving the authorized compounding scope without a topical classifier.
        """
        filters = {"team": {"key": {"eq": "JOV"}}, "state": {"name": {"in": ["Backlog", "Todo"]}},
                   "or": [{"priority": {"eq": 1}},
                          {"and": [{"priority": {"eq": 2}}, {"labels": {"some": {"name": {"eq": "agent-ready"}}}},
                                   {"labels": {"some": {"name": {"eq": "dispatch-next"}}}}]},
                          {"labels": {"some": {"name": {"eq": "P0"}}}},
                          {"title": {"startsWith": "P0"}}, {"title": {"startsWith": "[P0]"}}]}
        nested = "labels(first:50){pageInfo{hasNextPage endCursor} nodes{id name}}"
        query = ("query($filter:IssueFilter!,$after:String){issues(first:50,after:$after,includeArchived:false,filter:$filter)"
                 "{pageInfo{hasNextPage endCursor} nodes{" + CORE + " " + nested + "}}}")
        rows, cursor, cursors, identities = [], None, set(), set()
        for _ in range(MAX_PAGES):
            value = self.query(query, {"filter": filters, "after": cursor}).get("issues") or {}
            page, info = value.get("nodes"), value.get("pageInfo") or {}
            if not isinstance(page, list) or len(page) > 50 or type(info.get("hasNextPage")) is not bool:
                raise Unavailable("global-cohort-page-unreadable")
            for row in page:
                if not isinstance(row, dict) or not row.get("id") or row["id"] in identities:
                    raise Unavailable("global-cohort-identity-unreadable")
                identities.add(row["id"])
                incomplete = False
                for name in ("labels",):
                    connection = row.get(name) or {}
                    if not isinstance(connection.get("nodes"), list) or type((connection.get("pageInfo") or {}).get("hasNextPage")) is not bool:
                        raise Unavailable("global-cohort-connection-unreadable")
                    incomplete |= connection["pageInfo"]["hasNextPage"]
                complete = self.issue(row["id"]) if incomplete else row
                _metadata_digest(complete)
                labels = {label["name"] for label in complete["labels"]["nodes"]}
                priority, title = complete.get("priority"), complete.get("title") or ""
                if not (priority == 1 or priority == 2 and {"agent-ready", "dispatch-next"} <= labels
                        or "P0" in labels or title.startswith(("P0", "[P0]"))):
                    raise Unavailable("global-cohort-scope-filter-unproven")
                rows.append(complete)
            if not info["hasNextPage"]:
                return sorted(rows, key=lambda row: row["id"])
            cursor = info.get("endCursor")
            if not isinstance(cursor, str) or not cursor or cursor in cursors:
                raise Unavailable("global-cohort-cursor-unreadable")
            cursors.add(cursor)
        raise Unavailable("global-cohort-pagination-bound")

    def pr_metadata(self):
        return _paged(lambda page: self.gh(f"repos/JovieInc/Jovie/pulls?state=open&per_page=100&page={page}"))

    def gh(self, endpoint):
        result = subprocess.run(["gh", "api", "-X", "GET", endpoint], capture_output=True, text=True, timeout=30)
        if result.returncode:
            raise Unavailable("github-read-unavailable")
        return json.loads(result.stdout)

    def _read_gh_command(self, command, *, timeout=30):
        if command[:3] != ["gh", "api", "graphql"]:
            # A legacy REST/file-cache fallback is not an inline scope witness.
            return SimpleNamespace(returncode=1, stdout="", stderr="scope-read-unavailable")
        return subprocess.run(command, capture_output=True, text=True, timeout=min(timeout, 30))

    def open_prs(self):
        proxy = SimpleNamespace(REPO_SLUG="JovieInc/Jovie", sh=self._read_gh_command)
        report = {}
        original_cache = self.lane.pr_events.pr_files_cache
        self.lane.pr_events.pr_files_cache = lambda node: None
        try:
            prs = self.lane.pr_events.open_prs_state(proxy, report)
        finally:
            self.lane.pr_events.pr_files_cache = original_cache
        if not isinstance(prs, list) or report.get("complete") is not True:
            raise Unavailable("native-open-pr-inventory-incomplete")
        for pr in prs:
            if pr.get("labelsComplete") is not True or pr.get("filesComplete") is not True:
                raise Unavailable("native-open-pr-scope-incomplete")
            # Inline exact head/base files are maintained scope evidence. A
            # legacy cached or REST fallback must never certify a negative.
            evidence = pr.get("inlineFilesEvidence")
            if pr.get("files") and not self.lane.pr_events._valid_target_file_evidence(evidence, "JovieInc/Jovie", time.time()):
                raise Unavailable("native-open-pr-inline-scope-unavailable:" + str(pr.get("number")))
        final = [row for page in self.pr_metadata() for row in page]
        if _pr_digest(final, raw=True) != _pr_digest(prs):
            raise Unavailable("github-open-pr-set-changed")
        return prs

    def history(self):
        endpoint = "repos/JovieInc/Jovie/commits/" + execution_attempt.GITHUB_LEDGER_ANCHOR + "/statuses?per_page=100"
        pages = execution_attempt._gh({}, "GET", endpoint)
        if (not isinstance(pages, list) or not 1 <= len(pages) <= MAX_PAGES
                or any(not isinstance(page, list) or len(page) > 100 for page in pages)):
            raise Unavailable("canonical-attempt-history-unbounded-or-unreadable")
        if _fingerprint(self.gh(endpoint + "&page=1")) != _fingerprint(pages[0]):
            raise Unavailable("paged-history-changed")
        return pages

    def ownership(self, issue):
        base = self.current.parent / "backlog-orchestrator"
        paths = [base / name for name in ("admission-disposition.mjs", "admission-policy.mjs",
                                         "ownership-inventory.mjs", "ownership-inventory.json")]
        if any(not path.is_file() or not path.resolve().is_relative_to(self.current.parent.parent) for path in paths):
            raise Unavailable("installed-custody-interpreter-unavailable")
        program = ("import {classifyAdmissionDisposition} from " + json.dumps(paths[0].as_uri()) + ";"
                   "import {isFounderSteeringAssignee} from " + json.dumps(paths[1].as_uri()) + ";"
                   "let input='';for await(const c of process.stdin)input+=c;const i=JSON.parse(input);"
                   "console.log(JSON.stringify({ownership:classifyAdmissionDisposition(i).ownership,"
                   "founder:isFounderSteeringAssignee(i),founderComments:(i.comments?.nodes||[])"
                   ".filter(c=>isFounderSteeringAssignee({assignee:c.user})).map(c=>c.id)}));")
        result = subprocess.run(["node", "--input-type=module", "-e", program], input=json.dumps(issue),
                                capture_output=True, text=True, timeout=15)
        if result.returncode:
            raise Unavailable("installed-custody-interpreter-failed")
        value = json.loads(result.stdout)
        if not isinstance(value.get("ownership"), dict) or type(value.get("founder")) is not bool:
            raise Unavailable("installed-custody-result-unreadable")
        return value

    def fleet_max_age(self):
        path = self.current.parent / "fleet-gate/scoped_admission.py"
        spec = importlib.util.spec_from_file_location("backlog_fleet_scoped_policy", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.MAX_AGE.total_seconds()

    def prepare_fleet_observation(self, *, preparation_started=None, parent_control_fd=None):
        """One genuine installed work observation, before issue/cohort preimages.

        This is preparation only. Neither a local fence nor revalidation may
        invoke the observer or refresh its retained start timestamp.
        """
        if getattr(self, "_fleet_prepared", False):
            raise Unavailable("fleet-work-observation-already-prepared")
        self._fleet_prepared = True
        self.validate_runtime()
        manifest = _json_file(self.current / ".release.json", "jovie-lane-release-bundle/v1")
        for name in FLEET_OBSERVER_SOURCES:
            value = manifest.get("objects", {}).get("scripts/fleet-gate/" + name)
            if not isinstance(value, str) or not re.fullmatch(r"[a-f0-9]{40}", value):
                raise Unavailable("installed-fleet-observer-not-manifest-bound")
        gate = self.current.parent / "fleet-gate/gem-priority-gate.py"
        before = _work_input_digest(gate)
        request = self.lane.FleetObservationRequest(
            time.monotonic() if preparation_started is None else preparation_started, parent_control_fd)
        try:
            result = self.lane.run_agent([sys.executable, "-I", "-B", "-S", "-X", "pycache_prefix=/dev/null", str(gate), "--observe-work-admission"],
                                         self.current, None, MAX_AGE_S, _fleet_observation=request)
        except self.lane.FleetObservationHeld as error:
            raise Unavailable(str(error)) from None
        if result.returncode or len(result.stdout) > 262144:
            raise Unavailable("fleet-work-observation-failed")
        value = json.loads(result.stdout)
        if not isinstance(value, dict) or value.get("gateSHA256") != before:
            raise Unavailable("fleet-work-observation-source-mismatch")
        # Re-observe canonical main outside the fence; a changed head is held,
        # never silently adopted by the already prepared proof.
        self.canonical_main(revalidate=True)
        self._fleet_observation = value
        try:
            self.fleet_observation()
        except Exception:
            self._fleet_observation = None
            raise

    def fleet_observation(self):
        """Retained proof plus local checks only; never spawn, query or restamp."""
        value = getattr(self, "_fleet_observation", None)
        if not isinstance(value, dict) or value.get("schema") != "jovie.fleet-work-observation/v1":
            raise Unavailable("fleet-work-observation-unprepared")
        self.validate_runtime()
        home = self.state.parents[2]
        fleet = home / "gem-workspace/state/gem-priority-gate"
        paths = {str(fleet.parent / "integrity.json"), str(fleet.parent / "concurrency.json"),
                 str(fleet / "independent-review.json"), str(fleet / "latest.json"), str(self.state / "tick.json")}
        inputs = value.get("localInputs")
        work, closure = value.get("workAdmission"), value.get("closureAdmission")
        if (value.get("repo") != "JovieInc/Jovie" or value.get("statePath") != str(fleet)
                or value.get("nativeStatePath") != str(self.state)
                or value.get("mainSha") != self._main_sha
                or value.get("authorizesTransition") is not False or value.get("authorizesDispatch") is not False
                or not isinstance(inputs, dict) or set(inputs) != paths
                or not isinstance(work, dict) or not isinstance(closure, dict)
                or any(type(work.get(key)) is not bool for key in ("allowed", "newImplementationAllowed", "newIssueLeaseAllowed"))
                or not isinstance(work.get("productNewIssueLeaseAllowed"), dict)
                or type(work["productNewIssueLeaseAllowed"].get("jovie")) is not bool
                or type(closure.get("newIssueIntakeAllowed")) is not bool):
            raise Unavailable("fleet-work-observation-binding-invalid")
        started, completed = _epoch(value.get("observedAt")), _epoch(value.get("completedAt"))
        now = time.time()
        if (started is None or completed is None or not started <= completed <= now
                or not 0 <= now - started <= self.fleet_max_age()):
            raise Unavailable("fleet-typed-work-stale")
        gate = self.current.parent / "fleet-gate/gem-priority-gate.py"
        if _work_input_digest(gate) != value.get("gateSHA256"):
            raise Unavailable("fleet-work-observation-source-changed")
        for name, expected in inputs.items():
            path = Path(name)
            actual = _work_input_digest(path)
            if actual != expected:
                raise Unavailable("fleet-work-observation-input-changed")
        return json.loads(json.dumps(value))

    def acceptance(self, issue):
        """Use an existing owner source-binding receipt; verify its actual merge.

        This proves only an implementation prerequisite, never deployment,
        dogfood or founder product acceptance. A generic Done/docs link cannot
        produce this evidence. Unknown contracts stay with their current owner.
        """
        ownership = self.ownership(issue)
        for comment in reversed(issue["comments"]["nodes"]):
            body = comment.get("body") or ""
            if comment["id"] not in ownership["founderComments"] or "source binding correction" not in body.lower():
                continue
            shas = set(re.findall(r"\b[a-f0-9]{40}\b", body))
            numbers = re.findall(r"https://github\.com/JovieInc/Jovie/pull/(\d+)\b", body)
            for number in dict.fromkeys(numbers):
                pr = self.gh(f"repos/JovieInc/Jovie/pulls/{number}")
                merge, head = pr.get("merge_commit_sha"), (pr.get("head") or {}).get("sha")
                if not pr.get("merged") or merge not in shas or head not in shas:
                    continue
                files = _paged(lambda page: self.gh(f"repos/JovieInc/Jovie/pulls/{number}/files?per_page=100&page={page}"), recheck=False)
                paths = [entry["filename"] for page in files for entry in page
                         if entry.get("filename") in body and Path(entry["filename"]).suffix in {".py", ".ts", ".tsx", ".mjs", ".swift"}]
                if not paths or all("/tests/" in path or path.endswith(".test.ts") for path in paths):
                    continue
                repo = self.host.repo
                source = subprocess.run(["git", "-C", str(repo), "rev-parse", "origin/main"], capture_output=True, text=True, timeout=10)
                source_sha = source.stdout.strip()
                ancestor = subprocess.run(["git", "-C", str(repo), "merge-base", "--is-ancestor", merge, source_sha], capture_output=True, timeout=10)
                if source.returncode or ancestor.returncode or not re.fullmatch(r"[a-f0-9]{40}", source_sha):
                    continue
                if source_sha != self.canonical_main():
                    raise Unavailable("local-origin-main-not-current-canonical")
                accepted_source = None
                for revision in sorted(shas - {merge, head}):
                    equal = True
                    for path in paths:
                        blobs = subprocess.run(["git", "-C", str(repo), "rev-parse", revision + ":" + path, source_sha + ":" + path],
                                               capture_output=True, text=True, timeout=10)
                        values = blobs.stdout.splitlines()
                        if blobs.returncode or len(values) != 2 or values[0] != values[1]:
                            equal = False
                            break
                    if equal:
                        accepted_source = revision
                        break
                if accepted_source is None:
                    continue
                return {"kind": "implemented-source", "mergeSha": merge, "sourceSha": source_sha, "paths": paths,
                        "receipt": "https://linear.app/jovie/issue/" + issue["identifier"] + "#comment-" + comment["id"]}
        return None


def _epoch(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value) if math.isfinite(value) else None
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed.timestamp() if parsed.tzinfo is not None else None
        except ValueError:
            pass
    return None


def _observation(identifier, holds, evidence=None):
    return {"schema": SCHEMA, "issue": identifier, "allowed": not holds,
            "authorizesTransition": False, "authorizesDispatch": False,
            "holds": holds, "evidence": evidence or {}}


def _hold(code, owner, evidence, next_action):
    return {"code": code, "owner": owner, "evidence": evidence,
            "nextAction": next_action}


def _bounded_attempt_receipt(value):
    # Same canonical URL-safe zlib/JSON representation, bounded before parsing.
    packed = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    inflater = zlib.decompressobj()
    raw = inflater.decompress(packed, 65537)
    if len(raw) > 65536 or inflater.unconsumed_tail or not inflater.eof or inflater.unused_data:
        raise ValueError("attempt-receipt-decoded-bound-or-incomplete")
    return json.loads(raw)


def _attempt_receipts(pages):
    receipts = {}
    for status in (status for page in pages for status in page):
        if not isinstance(status, dict): raise ValueError("malformed-status")
        context = status.get("context")
        if not isinstance(context, str): raise ValueError("malformed-context")
        if not context.startswith("jovie-execution/"): continue
        if not execution_attempt._trusted_creator(status.get("creator")): raise ValueError("untrusted-creator")
        target = status.get("target_url") or ""
        if not isinstance(target, str) or len(target) > 32768 or "#jovie-execution=" not in target: raise ValueError("missing-receipt")
        row = _bounded_attempt_receipt(target.split("#jovie-execution=", 1)[1])
        if (not isinstance(row, dict) or row.get("schema") != execution_attempt.SCHEMA
                or not isinstance(row.get("workKey"), str)
                or not re.fullmatch(r"[a-z][a-z0-9-]*:[a-f0-9]{64}", row["workKey"])
                or not isinstance(row.get("executionGeneration"), str)
                or not re.fullmatch(r"[a-f0-9]{64}", row["executionGeneration"])
                or row.get("identityDigest") != execution_attempt.digest({"workKey": row["workKey"], "generation": row["executionGeneration"]})
                or context != "jovie-execution/" + str(row.get("identityDigest"))):
            raise ValueError("receipt-context-mismatch")
        receipts.setdefault(row["workKey"], []).append({"statusId": status.get("id"), "identityDigest": row.get("identityDigest"),
                           "generation": row.get("executionGeneration"), "event": row.get("event"), "terminalState": row.get("terminalState")})
    return receipts


def project_backlog_admission(packet, *, now, canonical_state_path, _ordering_only=False):
    """Pure projection of a trusted collector's bound reads, including all attempts.

    ``allowed`` only means no hold was found in this observation. It is never a
    grant. The maintained writer still owns provenance validation, its exclusive
    fence and a fresh prewrite check. Caller-provided ``allowed``/reentry flags
    have no effect. Missing or malformed evidence cannot become runnable work.
    """
    holds = []
    packet = packet if isinstance(packet, dict) else {}
    issue = packet.get("issue")
    issue = issue if isinstance(issue, dict) else {}
    identifier = issue.get("identifier")
    def hold(code, owner, evidence, action):
        holds.append(_hold(code, owner, evidence, action))
    clock = _epoch(now)
    if clock is None:
        hold("clock-unavailable", RUNTIME_OWNER, "A finite current time is required.",
             "Re-observe the canonical host clock.")
        return _observation(identifier, holds)
    now = clock
    def fresh(row, name, owner):
        seen = _epoch(row.get("observedAt")) if isinstance(row, dict) else None
        if seen is None or not 0 <= now - seen <= MAX_AGE_S:
            hold(name + "-stale-or-unreadable", owner, {"observedAt": row.get("observedAt") if isinstance(row, dict) else None},
                 "Refresh this complete canonical read; do not extend its timestamp.")
            return False
        return True
    expected = packet.get("expected")
    if (not isinstance(expected, dict) or not all(issue.get(key) is not None and issue.get(key) == expected.get(key)
                                               for key in IDENTITY_FIELDS)):
        hold("issue-preimage-changed", ISSUE_OWNER, {key: issue.get(key) for key in IDENTITY_FIELDS},
             "Reassess the current issue identity, version and explicit priority.")
    fresh(issue, "issue", ISSUE_OWNER)
    allowed_states = {"Backlog": "backlog"}
    if _ordering_only:
        allowed_states["Todo"] = "unstarted"
    if (not isinstance(issue.get("id"), str) or not issue["id"] or not isinstance(identifier, str)
            or not re.fullmatch(r"JOV-\d+", identifier)
            or not isinstance(issue.get("state"), str) or issue["state"] not in allowed_states
            or allowed_states[issue["state"]] != issue.get("stateType") or not isinstance(issue.get("updatedAt"), str)
            or _epoch(issue.get("updatedAt")) is None or type(issue.get("priority")) is not int
            or issue["priority"] not in (1, 2, 3, 4) or issue.get("labelsComplete") is not True):
        hold("issue-not-a-complete-backlog-candidate", ISSUE_OWNER, "Identity/state/version/priority/labels must be complete.",
             "Refresh authoritative Linear data; retain the existing priority tier.")
    dependency_ids = issue.get("dependencyIds")
    deps = packet.get("dependencies")
    deps = deps if isinstance(deps, dict) else {}
    fresh(deps, "dependencies", ISSUE_OWNER)
    rows = deps.get("rows")
    if (not isinstance(dependency_ids, list) or any(not isinstance(value, str) for value in dependency_ids)
            or len(set(dependency_ids)) != len(dependency_ids) or deps.get("complete") is not True
            or deps.get("issueId") != issue.get("id") or deps.get("issueUpdatedAt") != issue.get("updatedAt")
            or not isinstance(rows, list) or any(not isinstance(row, dict) or not isinstance(row.get("id"), str) for row in rows)
            or sorted(row.get("id", "") for row in rows if isinstance(row, dict)) != sorted(dependency_ids)):
        hold("dependency-set-unproven", ISSUE_OWNER, "The complete fresh dependency set must match this issue version.",
             "Read every linked prerequisite and its acceptance through the existing owner.")
    else:
        for row in rows:
            fresh(row, "dependency:" + row["id"], ISSUE_OWNER)
            acceptance = row.get("sourceAcceptance")
            if row.get("state") != "Done" or row.get("stateType") != "completed":
                hold("dependency-not-fulfilled", row.get("owner") or ISSUE_OWNER, row["id"],
                     "The prerequisite owner must finish its actual acceptance contract.")
            elif (not isinstance(acceptance, dict) or acceptance.get("kind") != "implemented-source"
                    or not all(isinstance(acceptance.get(key), str) and re.fullmatch(r"[a-f0-9]{40}", acceptance[key])
                               for key in ("mergeSha", "sourceSha"))
                    or not isinstance(acceptance.get("paths"), list) or not acceptance["paths"]
                    or any(not isinstance(path, str) or not path for path in acceptance["paths"])
                    or not isinstance(acceptance.get("receipt"), str) or not acceptance["receipt"]):
                hold("dependency-acceptance-unproven", row.get("owner") or ISSUE_OWNER, row["id"],
                     "Bind the actual implementing merge and current source; Done or a docs merge alone is insufficient.")
    custody = packet.get("custody")
    custody = custody if isinstance(custody, dict) else {}
    fresh(custody, "custody", RUNTIME_OWNER)
    required_sources = {"linear-comments", "native-claims", "open-prs"}
    if (custody.get("complete") is not True or custody.get("issueId") != issue.get("id")
            or custody.get("issueUpdatedAt") != issue.get("updatedAt")
            or not isinstance(custody.get("sources"), list) or any(not isinstance(item, str) for item in custody["sources"])
            or set(custody["sources"]) != required_sources
            or not isinstance(custody.get("holders"), list) or not isinstance(custody.get("unknown"), list)):
        hold("accepted-custody-unproven", RUNTIME_OWNER, "Complete current and legacy custody is required.",
             "Use the incumbent ownership interpreter; never infer clearance from assignment or labels.")
    elif custody["holders"] or custody["unknown"]:
        hold("accepted-custody-held", RUNTIME_OWNER, {"holders": custody["holders"], "unknown": custody["unknown"]},
             "Preserve the incumbent owner and obtain its existing handoff/reentry evidence.")
    runtime = packet.get("runtime")
    runtime = runtime if isinstance(runtime, dict) else {}
    fresh(runtime, "runtime", RUNTIME_OWNER)
    expected_runtime = packet.get("expectedRuntime")
    canonical = str(canonical_state_path)
    installed = runtime.get("installedPath")
    if (not Path(canonical).is_absolute() or runtime.get("statePath") != canonical
            or not isinstance(installed, str) or not Path(installed).is_absolute() or ".." in Path(installed).parts
            or not Path(installed).is_relative_to(Path(canonical) / "releases")
            or len(Path(installed).relative_to(Path(canonical) / "releases").parts) != 3
            or Path(installed).parts[-2:] != ("scripts", "lanes")
            or not re.fullmatch(r"[a-f0-9]{64}", Path(installed).parts[-3])
            or not isinstance(expected_runtime, dict)
            or any(runtime.get(key) is None or runtime.get(key) != expected_runtime.get(key) for key in RUNTIME_FIELDS)
            or not all(isinstance(runtime.get(key), str) and re.fullmatch(rf"[a-f0-9]{{{length}}}", runtime[key])
                       for key, length in (("sourceHash", 64), ("policyHash", 64), ("releaseTree", 40)))
            or runtime.get("issueId") != issue.get("id") or runtime.get("issueUpdatedAt") != issue.get("updatedAt")):
        hold("installed-runtime-preimage-unproven", RUNTIME_OWNER, {"statePath": runtime.get("statePath"), "installedPath": installed},
             "Read actual canonical host state and installed source/policy; scratch LANES_STATE is not admission truth.")
    worker = runtime.get("worker")
    worker = worker if isinstance(worker, dict) else {}
    source_functions = worker.get("sourceFunctions")
    required_functions = {"admission_rejection", "pool_rejections", "held_back_issues", "in_flight_issues"}
    if (not isinstance(source_functions, list) or any(not isinstance(item, str) for item in source_functions)
            or set(source_functions) != required_functions
            or worker.get("sourceHash") != runtime.get("sourceHash") or not isinstance(worker.get("provider"), str)
            or any(key not in worker for key in ("rejection", "poolRejection", "heldBack", "inFlight", "claims"))
            or type(worker.get("heldBack")) is not bool or type(worker.get("inFlight")) is not bool
            or not isinstance(worker.get("claims"), list)
            or any(worker.get(key) is not None and not isinstance(worker.get(key), str) for key in ("rejection", "poolRejection"))):
        hold("native-worker-predicates-unavailable", RUNTIME_OWNER, "Installed predicate output and source binding are required.",
             "Run the existing installed predicates with complete fresh inputs; do not copy sensitivity/routing rules.")
    elif worker["rejection"] or worker["poolRejection"] or worker["heldBack"] or worker["inFlight"] or worker["claims"]:
        hold("native-worker-held", RUNTIME_OWNER, worker,
             "The named native hold owner must resolve the existing predicate; preserve its worker/PR/repair.")
    overlap = runtime.get("fileOverlap")
    if not isinstance(overlap, dict) or overlap.get("allowed") is not True or not isinstance(overlap.get("decisions"), list):
        hold("native-file-overlap-held-or-unknown", RUNTIME_OWNER, overlap,
             "Read and preserve the installed file_overlap.admission_policy decision; never turn an unknown preview into approval.")
    resources = runtime.get("resources")
    resources = resources if isinstance(resources, dict) else {}
    fresh(resources, "resources", RESOURCE_OWNER)
    if (resources.get("workAdmission") != "allowed" or resources.get("newIssueLease") != "allowed"
            or resources.get("budget") != "within-budget" or resources.get("disk") != "admitted"
            or resources.get("quota") != "available" or type(resources.get("intakeSlots")) is not int
            or type(resources.get("freeSlots")) is not int or resources["intakeSlots"] <= 0 or resources["freeSlots"] <= 0):
        hold("native-resource-held-or-unknown", RESOURCE_OWNER, resources,
             "Wait for existing event-driven capacity and re-observe typed work/resource gates; never raise capacity or budgets.")
    history = packet.get("attemptHistory")
    history = history if isinstance(history, dict) else {}
    fresh(history, "attempt-history", ATTEMPT_OWNER)
    pages = history.get("pages")
    if (history.get("repository") != "JovieInc/Jovie" or history.get("anchor") != execution_attempt.GITHUB_LEDGER_ANCHOR
            or history.get("complete") is not True or history.get("hasNextPage") is not False
            or not isinstance(pages, list) or not 1 <= len(pages) <= 100
            or any(not isinstance(page, list) or len(page) > 100 for page in pages)):
        hold("canonical-attempt-history-unavailable", ATTEMPT_OWNER, "Complete canonical anchor pagination is required.",
             "Read the canonical GitHub attempt anchor across every workKey generation; missing history is a hold.")
    else:
        work_key = execution_attempt.identity("linear-work", {"issue": identifier, "outcome": "draft-pr"}, {})["workKey"]
        prior = []
        try:
            prior = _attempt_receipts(pages).get(work_key, [])
            if prior:
                hold("existing-attempt-reentry-owner-hold", ATTEMPT_OWNER, prior,
                     "Use the existing certified reentry protocol. No new generation or caller flag grants reentry here.")
        except (ValueError, TypeError, KeyError, RuntimeError, zlib.error) as exc:
            hold("canonical-attempt-history-unreadable", ATTEMPT_OWNER, type(exc).__name__,
                 "Repair/read the authentic history; never treat a malformed or untrusted receipt as absent.")
    return _observation(identifier, holds, {"issueUpdatedAt": issue.get("updatedAt"),
                        "priority": issue.get("priority"), "installedPath": installed,
                        "sourceHash": runtime.get("sourceHash"), "policyHash": runtime.get("policyHash")})


def _kernel_free(path, locked):
    try:
        stat = path.stat()
    except FileNotFoundError:
        return True
    return (os.major(stat.st_dev), os.minor(stat.st_dev), stat.st_ino) not in locked


def _pinned_codex_status(reads, codex, now):
    """Discover login outside the fence; native status rereads only bound local state."""
    keys = ("CODEX_LANE_AUTH_MODE", "CODEX_HOME", "CODEX_LANE_SUBSCRIPTION_PROFILES",
            "CODEX_LANE_LOGIN_SLOTS", "CODEX_ACCOUNTS_ROOT", "CODEX_LANE_CLI", "LANES_STATE")
    config = {key: os.environ.get(key) for key in keys}
    path = codex.STATE.resolve()
    if path != reads.state.resolve() / "codex-accounts.json":
        raise Unavailable("noncanonical-codex-banking-state")
    banking = _json_file(path)
    if any(not isinstance(row, dict) for row in banking.values()):
        raise Unavailable("codex-banking-state-unreadable")
    proof = getattr(reads, "_codex_proof", None)
    if proof is None:
        if getattr(reads, "_local_only", False):
            raise Unavailable("codex-account-proof-not-prepared")
        started, names = time.time(), codex.accounts()
        if (not isinstance(names, list) or not names or len(set(names)) != len(names)
                or any(not isinstance(name, str) or not name or not banking.get(name) for name in names)):
            raise Unavailable("codex-account-banking-proof-unreadable")
        proof = {"observedAt": started, "names": tuple(names), "config": config, "banking": _fingerprint(banking)}
        reads._codex_proof = proof
    if (not 0 <= time.time() - proof["observedAt"] <= MAX_AGE_S or config != proof["config"]
            or _fingerprint(banking) != proof["banking"]
            or {key: os.environ.get(key) for key in keys} != config
            or _fingerprint(_json_file(path)) != proof["banking"]):
        raise Unavailable("codex-account-proof-stale-or-changed")
    if any((not ({"runs", "capacityLease", "exhaustedUntil"} & banking[name].keys()))
           or ("runs" in banking[name] and (type(banking[name]["runs"]) is not int or banking[name]["runs"] < 0))
           or ("capacityLease" in banking[name] and not isinstance(banking[name]["capacityLease"], dict))
           or ("exhaustedUntil" in banking[name] and (type(banking[name]["exhaustedUntil"]) not in (int, float)
               or not math.isfinite(banking[name]["exhaustedUntil"]))) for name in proof["names"]):
        raise Unavailable("codex-banking-state-unreadable")
    if isinstance(reads, _SharedReads):
        reads.observe_local({path: proof["banking"]})
    native_status = codex.status
    def status(at=None):
        current = _json_file(path)
        if (_fingerprint(current) != proof["banking"] or {key: os.environ.get(key) for key in keys} != proof["config"]
                or not 0 <= time.time() - proof["observedAt"] <= MAX_AGE_S):
            raise Unavailable("codex-account-proof-stale-or-changed")
        return native_status(time.time() if at is None else at, names=list(proof["names"]), state=current)
    return status


@contextmanager
def _observed_slots(lane, reads=None, now=None):
    """Reuse native routing/quota without its acquire-and-release flock probes.

    Linux's kernel lock inventory is an observation, not a seat reservation. The
    writer and eventual worker must still acquire through the normal boundary.
    Unsupported/unreadable kernels fail closed rather than claiming capacity.
    """
    locked = set()
    for line in Path("/proc/locks").read_text().splitlines():
        for token in line.replace(" -> ", " ").split():
            fields = token.split(":")
            if len(fields) == 3:
                try:
                    locked.add((int(fields[0], 16), int(fields[1], 16), int(fields[2])))
                except ValueError:
                    raise Unavailable("kernel-lock-inventory-unreadable") from None
    original_slot, original_codex = lane.slot_free, lane.codex_lane_module
    codex = original_codex()
    original_free, original_status = codex._free_slots, getattr(codex, "status", None)
    if reads is not None:
        codex.status = _pinned_codex_status(reads, codex, now)
    lane.slot_free = lambda host, name, slots: any(_kernel_free(host.state / "slots" / f"{name}.{i}.lock", locked) for i in range(slots))
    codex._free_slots = lambda name: sum(_kernel_free(path, locked) for path in codex._slot_paths(name))
    lane.codex_lane_module = lambda: codex
    try:
        yield locked, codex
    finally:
        lane.slot_free, lane.codex_lane_module = original_slot, original_codex
        codex._free_slots = original_free
        if original_status is not None:
            codex.status = original_status


def _native_runtime(reads, row, prs, binding, observed_at):
    lane, host, state = reads.lane, reads.host, reads.state
    claims_path, outbox_path = state / "linear/claims.json", state / "linear/outbox.json"
    originals = {claims_path: _json_file(claims_path, lane.linear_sync.CLAIMS),
                 outbox_path: _json_file(outbox_path, lane.linear_sync.OUTBOX),
                 state / "linear/mirror-JOV.json": _json_file(state / "linear/mirror-JOV.json", lane.linear_sync.MIRROR)}
    claims = originals[claims_path].get("claims")
    outbox = originals[outbox_path].get("entries")
    mirror = originals[state / "linear/mirror-JOV.json"].get("issues")
    if not isinstance(claims, dict) or not isinstance(outbox, list) or not isinstance(mirror, dict):
        raise Unavailable("native-custody-ledger-unreadable")
    # Any unfinished native write involving this issue belongs to that owner.
    pending = [entry["key"] for entry in outbox if entry.get("issueId") == row["id"] and not entry.get("sentAt")]
    issue = lane.Issue(row["id"], row["identifier"], row.get("title") or "", row.get("description") or "",
                       row["priority"], row["createdAt"], [label["name"] for label in row["labels"]["nodes"]])
    pool_by_id = {r["id"]: lane.Issue(r["id"], r["identifier"], r["title"], r["description"], r["priority"], r["createdAt"], r["labels"])
                  for r in lane.linear_sync.todo(state, "JOV")}
    pool_by_id.update({item.id: item for item in getattr(reads, "ordering_pool", [])})
    pool_by_id[issue.id] = issue
    pool = list(pool_by_id.values())
    original_shared = lane.shared
    lane.shared = lambda tag, ttl, fetch: prs
    try:
        witnessed_inflight = lane.in_flight_issues()
    finally:
        lane.shared = original_shared
    if witnessed_inflight is None:
        raise Unavailable("native-inflight-inventory-unavailable")
    inflight = {value.lower() for value in witnessed_inflight}
    own_prs = []
    for pr in prs:
        branch = lane.LANE_BRANCH.match(pr.get("headRefName") or "")
        marker = lane.ISSUE_MARKER.search(pr.get("body") or "")
        keys = {key.lower() for key in (branch and branch.group("issue"), marker and marker.group(1)) if key}
        # Preserve parked PR ownership too; its reentry is not granted here.
        if issue.identifier.lower() in keys or re.search(r"\b" + re.escape(issue.identifier) + r"\b",
                                                       (pr.get("title") or "") + "\n" + (pr.get("body") or ""), re.I):
            own_prs.append({"number": pr["number"], "headSha": pr["headRefOid"]})
    failures = _json_file(state / "failures.json")
    cooldown = lane.handoff_cooldown_path(host)
    if cooldown.exists():
        _json_file(cooldown)
    for marker in (state / "worktrees").glob("*/" + lane.disk_guard.PRESERVED_REPAIR):
        _json_file(marker)
    held = lane.held_back_issues(host, observed_at)
    providers, policy = lane.load_providers(), lane.read_json(lane.ROUTING_POLICY)
    if not providers or not policy:
        raise Unavailable("native-routing-policy-unreadable")
    choices = []
    account_reads = reads if any((spec.get("quota") or {}).get("source") == "codex-accounts" for spec in providers.values()) else None
    with _observed_slots(lane, account_reads, observed_at) as (locked, codex):
        # No caller owns a seat: an empty self-name makes the maintained router
        # inspect health/cooling/free seats for every prospective provider.
        route = lane.issue_router(host, "", providers, policy)
        for provider, spec in providers.items():
            if not isinstance(spec, dict):
                raise Unavailable("native-provider-policy-unreadable")
            rejection = lane.admission_rejection(issue, failures, observed_at, frozenset(inflight), provider, route)
            slots = host.slots(provider, spec.get("slots", 1))
            free_slots = sum(_kernel_free(state / "slots" / f"{provider}.{i}.lock", locked) for i in range(max(0, slots)))
            quota = lane.quota_pressure(host, provider, spec, observed_at)
            # Native quota_pressure historically permits unread account data.
            # The Backlog collector cannot establish provider capacity from it.
            if (spec.get("quota") or {}).get("source") == "codex-accounts":
                status = codex.status(observed_at)
                if not status.get("accounts"):
                    quota = {"ok": False, "why": "accounts-unread"}
                free_slots = min(free_slots, sum(r["freeSlots"] for r in status.get("accounts", {}).values() if r.get("available")))
            choices.append({"provider": provider, "rejection": rejection, "quota": quota,
                            "intakeSlots": host.intake_slots(provider, spec.get("slots", 1)), "freeSlots": free_slots,
                            "budget": lane.new_issue_budget(provider, slots, prs)})
    # Preserve installed route selection. Only a native accepted route can win.
    selected = next((c for c in choices if c["rejection"] is None and c["quota"].get("ok") and c["intakeSlots"] > 0 and c["freeSlots"] > 0),
                    next((c for c in choices if c["rejection"] is None), choices[0] if choices else None))
    if selected is None:
        raise Unavailable("native-provider-route-unavailable")
    overlap_state = _json_file(lane.file_overlap._state_path(state), "symphony-file-overlap/v1")
    if not isinstance(overlap_state.get("tasks"), dict) or not isinstance(overlap_state.get("active"), dict):
        raise Unavailable("native-overlap-custody-unreadable")
    original_summary = lane.overlap_prs_summary
    lane.overlap_prs_summary = lambda: prs
    try:
        inventory = lane.overlap_inventory(host, reads.linear)
    finally:
        lane.overlap_prs_summary = original_summary
    if inventory is None:
        raise Unavailable("native-overlap-inventory-unavailable")
    overlap = lane.file_overlap.admission_policy(issue, *inventory, lane.workstreams.classify, now=observed_at)
    fleet = reads.fleet_observation()
    if _epoch(fleet.get("observedAt")) is None or not 0 <= observed_at - _epoch(fleet["observedAt"]) <= reads.fleet_max_age():
        raise Unavailable("fleet-typed-work-stale")
    work, closure = fleet.get("workAdmission") or {}, fleet.get("closureAdmission") or {}
    work_allowed = work.get("allowed") is True and work.get("newImplementationAllowed") is True
    lease_allowed = (work.get("newIssueLeaseAllowed") is True and (work.get("productNewIssueLeaseAllowed") or {}).get("jovie") is True
                     and closure.get("newIssueIntakeAllowed") is True)
    disk = lane.disk_guard.free_pct(state)
    worker = {"sourceFunctions": ["admission_rejection", "pool_rejections", "held_back_issues", "in_flight_issues"],
              "sourceHash": binding["sourceHash"], "provider": selected["provider"], "rejection": selected["rejection"],
              "poolRejection": lane.pool_rejections(pool, lane.hotspot_holds(prs), now=observed_at).get(issue.identifier),
              "heldBack": issue.identifier in held, "inFlight": issue.identifier.lower() in inflight,
              "claims": ([{"status": (claims[issue.id] or {}).get("status")}] if issue.id in claims else [])}
    runtime = {**binding, "statePath": str(state), "issueId": issue.id, "issueUpdatedAt": row["updatedAt"],
               "observedAt": observed_at, "worker": worker,
               "resources": {"observedAt": observed_at, "workAdmission": "allowed" if work_allowed else "hold",
                             "newIssueLease": "allowed" if lease_allowed else "hold", "fleetGeneration": fleet.get("inputGeneration"),
                             "budget": selected["budget"].get("reason"), "disk": "admitted" if disk is not None and disk > lane.disk_guard.CRITICAL_PCT else "hold",
                             "quota": "available" if selected["quota"].get("ok") else "hold",
                             "intakeSlots": selected["intakeSlots"], "freeSlots": selected["freeSlots"]},
               "fileOverlap": overlap, "providerObservations": choices}
    if isinstance(reads, _SharedReads):
        reads.observe_runtime(row, runtime)
    return runtime, own_prs, pending, {path: _fingerprint(value) for path, value in originals.items()}


def _collect_packet(reads, row, binding, observed_at):
    identifier = row["identifier"]
    deps, dependency_preimages = [], {}
    for dependency_id in _dependency_ids(row):
        started = time.time()
        dep = reads.issue(dependency_id)
        dependency_preimages[dependency_id] = _issue_digest(dep)
        deps.append({"id": dep["id"], "owner": (dep.get("assignee") or {}).get("name") or dep["identifier"] + " owner",
                     "state": (dep.get("state") or {}).get("name"), "stateType": (dep.get("state") or {}).get("type"),
                     "observedAt": started, "sourceAcceptance": reads.acceptance(dep)})
    pr_started = time.time()
    prs = reads.open_prs()
    pr_started = min(pr_started, getattr(reads, "pr_observed_at", pr_started))
    history_started = time.time()
    pages = reads.history()
    history_started = min(history_started, getattr(reads, "history_observed_at", history_started))
    runtime, own_prs, pending, preimages = _native_runtime(reads, row, prs, binding, time.time())
    if isinstance(reads, _SharedReads):
        reads.observe_local(preimages)
    ownership = reads.ownership(row)
    holders, unknown = [], []
    if row.get("assignee") and not ownership["founder"]:
        holders.append({"source": "linear-assignee", "owner": row["assignee"].get("name") or row["assignee"].get("id")})
    if row.get("delegate"):
        holders.append({"source": "linear-delegate", "owner": row["delegate"].get("name") or row["delegate"].get("id")})
    if ownership["ownership"].get("status") != "unowned":
        holders.append({"source": "installed-ownership-interpreter", **ownership["ownership"]})
    holders.extend({"source": "open-pr", **pr} for pr in own_prs)
    holders.extend({"source": "native-outbox", "key": key} for key in pending)
    # No maintained release protocol interprets these old custody receipts. Their
    # presence must not disappear merely because assignment/labels changed.
    custody_text = [{"id": "issue-description", "body": row.get("description") or ""}, *row["comments"]["nodes"]]
    for comment in custody_text:
        if any(marker in (comment.get("body") or "") for marker in ("jovie-active-lease", "jovie.work-order/v1")):
            unknown.append({"source": "legacy-active-lease", "commentId": comment["id"]})
    ledger = reads.state / "runs/ledger.jsonl"
    if ledger.stat().st_size > 64_000_000:
        raise Unavailable("native-attempt-ledger-read-bound")
    ledger_original = ledger.read_text()
    if isinstance(reads, _SharedReads):
        reads.observe_file(ledger, ledger_original)
    for line in ledger_original.splitlines():
        entry = json.loads(line)
        if not isinstance(entry, dict):
            raise Unavailable("native-attempt-ledger-unreadable")
        if str(entry.get("issue") or entry.get("identifier") or "").lower() == identifier.lower():
            unknown.append({"source": "native-prior-attempt", "startedAt": entry.get("startedAt"), "provider": entry.get("provider")})
    fresh = reads.issue(row["id"])
    if _issue_digest(fresh) != _issue_digest(row):
        raise Unavailable("linear-preimage-changed")
    if any(_issue_digest(reads.issue(identity)) != digest for identity, digest in dependency_preimages.items()):
        raise Unavailable("dependency-preimage-changed")
    if ledger.read_text() != ledger_original:
        raise Unavailable("native-attempt-ledger-changed")
    if any(_fingerprint(_json_file(path)) != digest for path, digest in preimages.items()):
        raise Unavailable("native-custody-preimage-changed")
    normalized = {**row, "state": row["state"]["name"], "stateType": row["state"]["type"], "labelsComplete": True,
                  "dependencyIds": _dependency_ids(row), "observedAt": observed_at}
    if row.get("archivedAt") or row["children"]["nodes"]:
        raise Unavailable("archived-or-parent-candidate")
    return {"issue": normalized, "expected": {key: normalized[key] for key in IDENTITY_FIELDS},
            "expectedRuntime": binding, "runtime": runtime,
            "dependencies": {"issueId": row["id"], "issueUpdatedAt": row["updatedAt"], "observedAt": observed_at, "complete": True, "rows": deps},
            "custody": {"issueId": row["id"], "issueUpdatedAt": row["updatedAt"], "observedAt": min(observed_at, pr_started), "complete": True,
                        "sources": ["linear-comments", "native-claims", "open-prs"], "holders": holders, "unknown": unknown},
            "attemptHistory": {"repository": "JovieInc/Jovie", "anchor": execution_attempt.GITHUB_LEDGER_ANCHOR,
                               "observedAt": history_started, "complete": True, "hasNextPage": False, "pages": pages}}


def prepare_backlog_guard(identifier, expected_version, *, home=None, module_path=None,
                          preparation_started=None, parent_control_fd=None):
    """Join actual native reads. Caller supplies only issue identity and version."""
    preparation_started = time.monotonic() if preparation_started is None else preparation_started
    home = (Path.home() if home is None else Path(home)).resolve()
    state = home / ".local/state/jovie-lanes"
    path = Path(__file__).resolve() if module_path is None else Path(module_path).resolve()
    current = (state / "current").resolve()
    evidence = {"statePath": str(state), "installedPath": str(current), "expectedVersion": expected_version}
    holds = []
    if (not isinstance(identifier, str) or not re.fullmatch(r"JOV-\d+", identifier)
            or _epoch(expected_version) is None):
        holds.append(_hold("request-identity-version-invalid", ISSUE_OWNER, "Issue and canonical updatedAt are required.",
                           "Supply the exact current Linear issue identity and version."))
    if path != current / "backlog_admission.py" or not current.is_relative_to(state / "releases"):
        holds.append(_hold("collector-not-installed-canonical-runtime", RUNTIME_OWNER, str(path),
                           "Install the protected, qualified release through the existing native updater."))
    configured = os.environ.get("LANES_STATE")
    if configured and Path(configured).resolve() != state.resolve():
        holds.append(_hold("noncanonical-state-environment", RUNTIME_OWNER, "LANES_STATE differs from canonical host state.",
                           "Run the installed adapter against the actual canonical host, not CI scratch state."))
    if holds:
        return _PreparedGuard(state, identifier, failure=_observation(identifier, holds, evidence))
    try:
        mirror_path = state / "linear/mirror-JOV.json"
        mirror = json.loads(mirror_path.read_text())
        matching = [row for row in mirror["issues"].values() if row.get("identifier") == identifier]
        if len(matching) != 1 or matching[0].get("updatedAt") != expected_version:
            raise ValueError("mirror identity/version mismatch")
        binding = {"installedPath": str(current), "sourceHash": hashlib.sha256((current / "lane_runner.py").read_bytes()).hexdigest(),
                   "policyHash": _fingerprint({name: hashlib.sha256((current / name).read_bytes()).hexdigest() for name in ("routing.json", "providers.json")}),
                   "releaseTree": (current / ".tree").read_text().strip()}
        evidence.update(binding)
        reads = _NativeReads(current, state)
        reads.prepare_fleet_observation(preparation_started=preparation_started, parent_control_fd=parent_control_fd)
        started = time.time()
        row = reads.issue(matching[0]["id"])
        if row.get("identifier") != identifier or row.get("updatedAt") != expected_version:
            raise Unavailable("fresh-linear-identity-version-mismatch")
        return _PreparedGuard(state, identifier, reads=reads, row=row, binding=binding, started=started)
    except (OSError, ValueError, KeyError, TypeError, AttributeError, RuntimeError, subprocess.SubprocessError) as exc:
        # Only our deliberately non-sensitive boundary names leave this process.
        reason = str(exc) if isinstance(exc, Unavailable) else type(exc).__name__
        holds.append(_hold("canonical-native-join-unavailable", RUNTIME_OWNER, reason,
                           "Resolve this exact canonical read/predicate boundary with its incumbent owner, then re-observe; no transition or dispatch is authorized."))
        return _PreparedGuard(state, identifier, failure=_observation(identifier, holds, evidence))


def collect_backlog_admission(identifier, expected_version, *, home=None, module_path=None):
    return prepare_backlog_guard(identifier, expected_version, home=home, module_path=module_path).observation


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--issue", required=True)
    parser.add_argument("--expected-version", required=True)
    args = parser.parse_args(argv)
    result = collect_backlog_admission(args.issue, args.expected_version)
    print(json.dumps(result, sort_keys=True))
    return 0 if result["allowed"] else 2


if __name__ == "__main__":
    sys.exit(main())
