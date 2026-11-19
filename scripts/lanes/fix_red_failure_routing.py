"""Bound shared evidence failures to their existing owner; never run a collector here."""
from __future__ import annotations

import hashlib
import json
import re
import subprocess

# Inherited design identities removed on main need the existing one-sync-per-head
# route before source repair. Accept the failed Vitest summary or the CLI's
# failure plus a typed identity or an error with zero baseline growth.
DESIGN_SOURCE_CLI = re.compile(
    r"(?:AssertionError: |##\[error\])\[design-system-source-ratchet\] FAIL — \d+ identities \(0 new / baseline \d+\)|"
    r"\bFAIL\b[^\n]*lib/__tests__/design-system-source-ratchet\.test\.mjs[^\n]*"
    r">[^\n]*exits zero from the CLI on the live tree|"
    r"\[design-system-source-ratchet\] FAIL[^\n]*\n[^\n]*new design identity: "
    r"(?:apps/web|packages/ui)/[^\t\n]+\t"
    r"(?:raw-hex-color|raw-palette-class|off-scale-step|duplicate-component)\t[^\n]+")

# A local TS2307 can mean a prerequisite has landed on main while the PR is
# BLOCKED rather than BEHIND. Use the existing one-sync-per-head route before
# asking a model to recreate modules. Unresolved errors still fall back to it.
LOCAL_MODULE_PREREQUISITE = re.compile(
    r"\b[\w./-]+\.[cm]?[jt]sx?\(\d+,\d+\): error TS2307: "
    r"Cannot find module ['\"]@/[\w./-]+['\"]")

def has_source_prerequisite_failure(route, logs):
    """Source failures stay out of infrastructure retries even in a mixed route."""
    return any(pattern.search(logs.get(name) or "") for name in route["checks"]
               for pattern in (LOCAL_MODULE_PREREQUISITE, DESIGN_SOURCE_CLI))


ALIAS_ACTION = 'alias-graduation-owner'
COLLECTOR = 'scripts/lib/public-profile-alias-graduation.mjs'
_ALIAS_ERROR = re.compile(
    r'Error: public-profile alias graduation review was due '
    r'\d{4}-\d\d-\d\dT[\d:.]+Z \((?P<issue>JOV-[1-9]\d*)\) '
    r'and its \d+h grace ended \d{4}-\d\d-\d\dT[\d:.]+Z; re-review and refresh it\.')
_ANSI = re.compile(r'\x1b\[[0-9;]*m')
# `gh run view --log-failed` prefixes each line `job \t step \t` before the timestamp.
_LOG_FAILED_PREFIX = re.compile(r'^[^\t]+\t[^\t]+\t(?=\d{4}-\d\d-\d\dT|##\[error\])')
_HOLD = re.compile(r'class=deterministic-source;n=[1-9]\d*;run=([1-9]\d*);try=([1-9]\d*)')
_SHA = re.compile(r'[0-9a-f]{40}')
_ROLLUPS = {'ci-fast', 'PR Ready', 'Product Lane Receipt'}
_RED = {'FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'STARTUP_FAILURE'}

# The budget CLI checks the committed policy against current origin/main.
# A stale head can retain ceilings main already lowered (#25125), including
# inside disk-read CLI tests. Sync once through the existing owner; persistent
# growth still needs a source repair, never a raised budget or an infra retry.
# ##[error] is the build annotation. ::error:: is the same finding when the CLI
# integration test prints it, including AssertionError: ::error:: lines.
_BUDGET_GROWTH_LINE = re.compile(
    r'^(?:\d{4}-\d\d-\d\dT[\d:.]+Z )?(?:AssertionError: )?'
    r'(?:##\[error\]|::error::)'
    r'(?:routes\.\S+|firstLoad\.baselines\.\S+|groups\.[A-Za-z]+\.baselineKb)'
    r' grew (\d+(?:\.\d+)?) -> (\d+(?:\.\d+)?)\s*$')
_OTHER_FAILURE = re.compile(
    r'\bFAIL\b|\b(?:Error|AssertionError|TypeError|ReferenceError|SyntaxError):|error TS\d+:')


def _budget_log_rejects(line):
    """A non-growth failure in the same log is a real repair, not a stale ceiling."""
    if '##[error]' in line and 'Process completed with exit code 1.' not in line:
        return True
    return _OTHER_FAILURE.search(line) is not None


class RouteBudgetGrowth:
    """Try the existing bounded main sync for stale ceilings, never relax a budget."""

    def search(self, text):
        clean = _ANSI.sub('', str(text or ''))
        matches = []
        for line in clean.splitlines():
            line = _LOG_FAILED_PREFIX.sub('', line, count=1)
            match = _BUDGET_GROWTH_LINE.fullmatch(line)
            if match:
                if float(match[2]) <= float(match[1]):
                    return None
                matches.append(match)
            elif _budget_log_rejects(line):
                return None
        return matches[0] if matches else None


ROUTE_BUDGET_GROWTH = RouteBudgetGrowth()


# Exact-head Coverage compares apps/web/scripts/route-render-modes.json with
# origin/main. A stale head keeps HTML bytes or a mode main already tightened
# (#25599). Sync once; a loss that remains is a real regression, and claim_route
# will not sync that head again. Never loosen the snapshot or add an override.
_RENDER_SNAPSHOT_LINE = re.compile(
    r'^(?:\d{4}-\d\d-\d\dT[\d:.]+Z )?(?:##\[error\]|::error::)\s?'
    r'/\S+ baseline weakened: '
    r'(?:html (?P<prev>\d+) -> (?P<next>\d+) bytes'
    r'|render mode \S+ -> \S+'
    r'|revalidate window \d+ s -> \d+ s)\b')


def _snapshot_log_rejects(line):
    """Another marked failure in the same log is a repair, not a stale snapshot."""
    if '##[error]' in line and 'Process completed with exit code 1.' not in line:
        return True
    if '::error::' in line:
        return True
    if 'prerendered HTML grew' in line or 'lost cacheability' in line:
        return True
    return _OTHER_FAILURE.search(line) is not None


class RenderModeSnapshotDrift:
    """Sync main when the only coverage errors are inherited snapshot loosenings."""

    def search(self, text):
        clean = _ANSI.sub('', str(text or ''))
        matches = []
        for raw in clean.splitlines():
            line = _LOG_FAILED_PREFIX.sub('', raw, count=1)
            match = _RENDER_SNAPSHOT_LINE.match(line)
            if match:
                nxt = match.group('next')
                if nxt is not None and int(nxt) <= int(match.group('prev')):
                    return None
                matches.append(match)
            elif _snapshot_log_rejects(line):
                return None
        return matches[0] if matches else None


RENDER_MODE_SNAPSHOT = RenderModeSnapshotDrift()


# PR Size Guard counts the PR head for repository hygiene and the merged tree
# for the combined-tree budget. A head that has not yet merged a main prune
# (drizzle snapshots, #25664) fails while the live base tip is already under
# budget. sync_claim allows one sync per head against that tip. The same tip
# does not sync again. A later tip, after an up-to-date sync burned the old
# key, gets its own claim. A head still over after that sync is a real shrink.
_TREE_BYTE_LINE = re.compile(
    r'(?:##\[error\]|::error::)\s*\d+ bytes of tracked regular files '
    r'\(merged tree; base \d+ [+-]\d+\) exceeds the \d+-byte combined-tree budget')
_TREE_HYGIENE_LINE = re.compile(
    r'of tracked regular files exceeds the .+ repository budget')
_TREE_ERROR_MARK = re.compile(r'(?:##\[error\]|::error::)')
_TREE_FOLLOWER = re.compile(
    r'(?:##\[error\]|::error::).*(?:'
    r'Process completed with exit code 1'
    r'|No files were found with the provided path: repo-health-receipt\.json'
    r')')
_TREE_STAMP = re.compile(r'^\d{4}-\d\d-\d\dT[\d:.]+Z\s*')


class TreeByteBudget:
    """Sync main when the only size-guard failure is the tracked-byte ceiling."""

    def search(self, text):
        clean = _ANSI.sub('', str(text or ''))
        hit = None
        for raw in clean.splitlines():
            line = _TREE_STAMP.sub('', _LOG_FAILED_PREFIX.sub('', raw, count=1))
            if _TREE_BYTE_LINE.search(line) or _TREE_HYGIENE_LINE.search(line):
                hit = line
                continue
            # Hygiene violations are plain bullets, not Actions annotations.
            # The bounded log tail may no longer contain the section header.
            if line.lstrip().startswith('- '):
                return None
            if _TREE_ERROR_MARK.search(line) and not _TREE_FOLLOWER.search(line):
                return None
        return hit


TREE_BYTE_BUDGET = TreeByteBudget()


def base_tip(pr) -> str:
    """Current base branch tip, or "" when the pull request does not name one."""
    if not isinstance(pr, dict):
        return ""
    ref = pr.get("baseRef")
    oid = None
    if isinstance(ref, dict):
        target = ref.get("target")
        if isinstance(target, dict):
            oid = target.get("oid")
    if not isinstance(oid, str):
        oid = pr.get("baseRefOid")
    return oid if isinstance(oid, str) and _SHA.fullmatch(oid) else ""


def base_moved(pr) -> bool:
    """Recorded base snapshot differs from the live base tip.

    A pending jovie-execution status hides BEHIND as UNSTABLE, so an empty
    failure list dispatched a model (fix-red-e3b0c44298). Missing or equal
    oids stay false; base_tip's snapshot fallback must not count as a move.
    """
    if not isinstance(pr, dict):
        return False
    recorded, ref = pr.get("baseRefOid"), pr.get("baseRef")
    target = ref.get("target") if isinstance(ref, dict) else None
    tip = target.get("oid") if isinstance(target, dict) else None
    valid = isinstance(recorded, str) and isinstance(tip, str) and _SHA.fullmatch(recorded) and _SHA.fullmatch(tip)
    return bool(valid and recorded != tip)


def sync_claim(pr, action: str) -> str:
    """Route claim key. sync-main is once per head and base tip.

    A no-op sync records the unqualified key `sync-main` on that head. Main
    can then land a prune without changing the head. The qualified key
    `sync-main:<tip>` is free, so the lane merges the new tip instead of
    dispatching a model. Other actions stay once per head.
    """
    if action != "sync-main":
        return action
    tip = base_tip(pr)
    return f"sync-main:{tip}" if tip else action


class SoleAliasReviewFailure:
    """Signature matcher used by the existing ordered failure-class table."""

    def search(self, text):
        clean = _ANSI.sub('', str(text or ''))
        matches = list(_ALIAS_ERROR.finditer(clean))
        if not matches or len({m['issue'] for m in matches}) != 1:
            return None
        if _ALIAS_ERROR.fullmatch(clean.strip()):
            return matches[0]
        if any(int(n) != 1 for n in re.findall(r'\b(?:Tests|Test Files|Suites)\s+(\d+)\s+failed\b', clean)):
            return None
        if not re.search(r'\bTests\s+1\s+failed\b', clean):
            return None
        annotated = re.search(r'##\[error\]Structural command \d+/\d+ failed[^\n]*', clean)
        failed_test = re.search(r'\bFAIL\s+[^\n]*lib/__tests__/production-release-supersession\.test\.mjs', clean)
        if not ((annotated and _ALIAS_ERROR.search(annotated[0])) or failed_test):
            return None
        for line in clean.splitlines():
            if re.search(r'\bFAIL\s+', line) and 'production-release-supersession.test.mjs' not in line:
                return None
            if re.search(r'\berror TS\d+:', line):
                return None
            if re.search(r'\b(?:AssertionError|TypeError|ReferenceError|SyntaxError|Error):', line) and not _ALIAS_ERROR.search(line):
                return None
            if '##[error]' in line and not (_ALIAS_ERROR.search(line) or
                    'Structural Contract failed.' in line or 'Process completed with exit code 1.' in line):
                return None
        if len(re.findall(r'\|\s*\d+\s*\|[^\n]*\|\s*fail(?:ure)?\s*\|', clean)) > 1:
            return None
        return matches[0]


ALIAS_REVIEW_FAILURE = SoleAliasReviewFailure()


def alias_owner_metadata(names, logs):
    matches = [ALIAS_REVIEW_FAILURE.search(logs.get(name) or '') for name in names]
    if not matches or any(match is None for match in matches):
        return None
    issues = {match['issue'] for match in matches}
    if len(issues) != 1:
        return None
    return {'issue': issues.pop(), 'collector': COLLECTOR, 'scope': 'main',
            'featureRepairAllowed': False}


def owner_handoff_reason(route):
    if not isinstance(route, dict) or route.get('action') != ALIAS_ACTION:
        return None
    owner = route.get('evidenceOwner') or {}
    if (not re.fullmatch(r'JOV-[1-9]\d*', str(owner.get('issue') or ''))
            or owner.get('collector') != COLLECTOR or owner.get('scope') != 'main'
            or owner.get('featureRepairAllowed') is not False):
        return None
    # This is not an infra-rerun: the existing attempt count and failure hold stay intact.
    return 'shared-evidence:alias-graduation:' + owner['issue']


def _json_read(read, argv):
    response = read(argv)
    if response.returncode != 0 or len(response.stdout or '') > 1_000_000:
        return None
    value = json.loads(response.stdout or 'null')
    return value if isinstance(value, dict) else None


def _current_queue_failure(pr, read, repository):
    head, number = pr.get('headRefOid'), pr.get('number')
    if not isinstance(head, str) or not _SHA.fullmatch(head) or type(number) is not int:
        return None
    status = _json_read(read, ['api', f'repos/{repository}/commits/{head}/status?per_page=100'])
    if not status or status.get('sha') != head:
        return None
    statuses = status.get('statuses')
    if not isinstance(statuses, list) or status.get('total_count') != len(statuses) or len(statuses) > 100:
        return None
    if any(row.get('context') == 'jovie-queue-failure-retry/v1' for row in statuses):
        return None
    holds = [row for row in statuses if row.get('context') == 'jovie-queue-failure-hold/v1']
    if len(holds) != 1 or holds[0].get('state') != 'success':
        return None
    match = _HOLD.fullmatch(holds[0].get('description') or '')
    if not match:
        return None
    run_id, attempt = map(int, match.groups())
    if holds[0].get('target_url') != f'https://github.com/{repository}/actions/runs/{run_id}':
        return None
    run = _json_read(read, ['api', f'repos/{repository}/actions/runs/{run_id}'])
    if (not run or run.get('id') != run_id or run.get('event') != 'merge_group'
            or run.get('status') != 'completed' or run.get('conclusion') != 'failure'
            or run.get('run_attempt') != attempt
            or not _SHA.fullmatch(str(run.get('head_sha') or ''))
            or not re.fullmatch(rf'gh-readonly-queue/main/pr-{number}-[0-9a-f]{{40}}',
                                str(run.get('head_branch') or ''))):
        return None
    listing = _json_read(read, ['api', f'repos/{repository}/actions/runs/{run_id}/attempts/{attempt}/jobs?per_page=100'])
    jobs = (listing or {}).get('jobs')
    if not isinstance(jobs, list) or listing.get('total_count') != len(jobs) or len(jobs) > 100:
        return None
    if any(job.get('run_id') != run_id or job.get('status') != 'completed'
           or job.get('conclusion') not in {'success', 'skipped', 'neutral', 'failure'} for job in jobs):
        return None
    failed = [job for job in jobs if job.get('conclusion') == 'failure']
    leaves = [job for job in failed if job.get('name') not in _ROLLUPS]
    if len(leaves) != 1 or leaves[0].get('name') != 'ci-fast (remaining)':
        return None
    job_id = leaves[0].get('id')
    if type(job_id) is not int or job_id < 1:
        return None
    response = read(['run', 'view', '--repo', repository, '--job', str(job_id), '--log-failed'])
    if response.returncode or not response.stdout or len(response.stdout) > 250_000:
        return None
    return response.stdout, {'sourceHead': head, 'runId': run_id, 'attempt': attempt,
                             'combinedHead': run['head_sha'], 'jobId': job_id}


def classify_repair(host, pr, read_logs, classify, read, repository):
    """Use own-head failures first; legacy queue excerpts alone carry no routing authority."""
    if pr.get('mergeStateStatus') == 'DIRTY' or pr.get('reviewDecision') == 'CHANGES_REQUESTED':
        return None
    try:
        route = classify(pr, read_logs(host, pr) or {})
        if route.get('checks') or any(str(check.get('conclusion') or '').upper() in _RED
                                     for check in pr.get('statusCheckRollup') or []):
            return route
        if any(str(check.get('state') if check.get('__typename') == 'StatusContext'
                   else check.get('conclusion') or '').upper() not in {'SUCCESS', 'SKIPPED', 'NEUTRAL'}
               for check in pr.get('statusCheckRollup') or []):
            return route
        if not pr.get('queueFailure') and 'dequeued' not in (pr.get('eventKinds') or []):
            return route
        evidence = _current_queue_failure(pr, read, repository)
        if evidence:
            text, binding = evidence
            name = 'merge-group:ci-fast (remaining)'
            candidate = classify({**pr, 'statusCheckRollup': [{'name': name, 'conclusion': 'FAILURE'}]}, {name: text})
            if candidate.get('action') == ALIAS_ACTION:
                candidate['evidenceOwner'].update(binding)
                return candidate
        return route
    except (OSError, ValueError, KeyError, TypeError, AttributeError, subprocess.SubprocessError):
        return None


def error_signature(text: str) -> str:
    """Prefer the failed-test summary to setup/mock output; normalize volatile tokens."""
    text = re.sub(r"\x1b\[[0-9;]*m", "", str(text or ""))
    text = re.split(r"(?m)^.*?\bFailed (?:Tests|Suites) [1-9]\d*\s*[⎯─-]*\s*$", text)[-1]
    for line in text.splitlines():
        if re.search(r"\b(error|fail(?:ed|ure)?|assert|expected|unwired|violation)\b", line, re.IGNORECASE):
            line = re.sub(r"^\S*\d{4}-\d\d-\d\dT[\d:.]+Z\s*", "", line.strip())
            line = re.sub(r"\b[0-9a-f]{7,40}\b|\d+", "#", line)
            return re.sub(r"\s+", " ", line)[:120]
    return ""


def fingerprint_key(cls: str, names: list[str], signature: str = "") -> str:
    parts = [cls, *sorted({re.sub(r"\s+", " ", str(name)).strip().lower() for name in names})]
    if cls in {"other", "mixed"}:
        parts.append(signature)
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:12]


def not_shippable_reason(output: str) -> str | None:
    """The agent's explicit decline, e.g. already fixed on main; routed to Triage, never retried."""
    found = re.findall(r"NOT-SHIPPABLE:\s*(.+)", output)
    return found[-1].strip()[:500] if found else None


LANE_CRASH_SIGNATURES = (
    ("codex-account-metadata-timeout", re.compile(r"TimeoutError: account/read: app-server response unavailable")),
)
DECLINE_INFRA = re.compile(
    r"rate limit|HTTP 40[38]|HTTP 5\d\d|infrastructure|timed out fetching|outage|flak|Doppler",
    re.IGNORECASE)
DECLINE_BASE_RED = re.compile(
    r"origin/main|untouched main|\bmain\b|merge base|pre-existing|preexisting|inherited|unrelated|"
    r"identically|already fixed", re.IGNORECASE)


def classify_unpushed_repair(exit_code, log_text: str) -> list[str]:
    """Specific reason codes for a fix run that pushed nothing. The first code is the cause.

    lane-crash:<signature>      the provider wrapper died before an agent worked (attempt refunded)
    agent-exit:<n>              the agent exited non-zero without pushing
    agent-declined:<class>:<why> NOT-SHIPPABLE; class infra | base-red | other (infra and
                                base-red spend the head's budget: a second read declines again)
    no-change:agent-ended-without-push  the agent finished cleanly and pushed nothing
    """
    if exit_code not in (0, None):
        for name, pattern in LANE_CRASH_SIGNATURES:
            if pattern.search(log_text):
                return [f"lane-crash:{name}", f"agent-exit:{exit_code}"]
        return [f"agent-exit:{exit_code}"]
    declined = not_shippable_reason(log_text)
    if declined:
        kind = "infra" if DECLINE_INFRA.search(declined) else "base-red" if DECLINE_BASE_RED.search(declined) else "other"
        return [f"agent-declined:{kind}:{declined[:160]}"]
    return ["no-change:agent-ended-without-push"]
