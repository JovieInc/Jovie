"""Complete, stable merge windows for the existing lane doctor and HUD.

Adapts JOV-5004's repository-connection/two-scan contract into the canonical
lanes runtime after scripts/symphony retired (JOV-6637). No search-result cap,
background collector, attribution policy, or new persisted authority. The doctor (every
dispatch tick) and the HUD read the same 24 h window, so `collect_shared` lets them share
one complete read for a few minutes instead of each re-reading it twice per refresh.
"""
from __future__ import annotations

from datetime import datetime
import json
import math
import os
from pathlib import Path
import subprocess
import time

QUERY = '''query($owner:String!,$name:String!,$cursor:String){
  repository(owner:$owner,name:$name){
    pullRequests(states:MERGED,orderBy:{field:UPDATED_AT,direction:DESC},first:100,after:$cursor){
      totalCount pageInfo{hasNextPage endCursor}
      nodes{number title headRefName headRefOid mergeCommit{oid} baseRefName createdAt updatedAt mergedAt}
    }
  }
}'''


class IncompleteMergeEvidence(RuntimeError):
    pass


def _epoch(value):
    if not isinstance(value, str):
        raise ValueError('invalid timestamp')
    stamp = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if stamp.tzinfo is None:
        raise ValueError('timestamp requires timezone')
    return stamp.timestamp()


def collect(repository: str, since: float, until: float, *, fetch_page=None,
            max_pages: int = 20, timeout_s: float = 60) -> dict:
    """Return typed incomplete evidence on every bounded-read failure; never partial counts."""
    result = {'schema': 'jovie-merge-window/v1', 'complete': False, 'reason': None,
              'window': {'since': since, 'until': until}, 'pages': 0, 'scans': 0, 'prs': []}
    def incomplete(reason):
        return {**result, 'reason': reason, 'prs': []}
    if (not all(isinstance(v, (float, int)) and not isinstance(v, bool) and math.isfinite(v)
                for v in (since, until, timeout_s)) or since >= until or timeout_s <= 0
            or type(max_pages) is not int or not 1 <= max_pages <= 100
            or not isinstance(repository, str) or len(repository.split('/')) != 2
            or not all(repository.split('/'))):
        return incomplete('invalid_fetch_options')
    owner, name = repository.split('/')
    deadline = time.monotonic() + timeout_s
    def remote(cursor):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError()
        args = ['gh', 'api', 'graphql', '-f', 'query=' + QUERY, '-f', 'owner=' + owner, '-f', 'name=' + name]
        if cursor is not None:
            args += ['-f', 'cursor=' + cursor]
        response = subprocess.run(args, capture_output=True, text=True, timeout=remaining)
        if response.returncode:
            raise RuntimeError('github_read_failed')
        data = json.loads(response.stdout)
        if not isinstance(data, dict):
            raise ValueError('malformed graphql response')
        if data.get('errors'):
            raise RuntimeError('github_graphql_errors')
        return data['data']['repository']['pullRequests']
    fetch = fetch_page or remote
    previous = None
    for scan in range(2):
        result['scans'] = scan + 1
        seen, cursors, rows = set(), set(), []
        cursor, total, last_updated = None, None, math.inf
        for _ in range(max_pages):
            if time.monotonic() >= deadline:
                return incomplete('deadline_exceeded')
            try:
                page = fetch(cursor)
            except (subprocess.TimeoutExpired, TimeoutError):
                return incomplete('deadline_exceeded')
            except (OSError, ValueError, KeyError, TypeError, RuntimeError, subprocess.SubprocessError):
                return incomplete('fetch_failed')
            result['pages'] += 1
            if time.monotonic() >= deadline:
                return incomplete('deadline_exceeded')
            if not isinstance(page, dict):
                return incomplete('malformed_page')
            nodes, info, count = page.get('nodes'), page.get('pageInfo'), page.get('totalCount')
            if (not isinstance(nodes, list) or len(nodes) > 100 or not isinstance(info, dict)
                    or type(count) is not int or count < 0
                    or type(info.get('hasNextPage')) is not bool
                    or 'endCursor' not in info
                    or (info.get('endCursor') is not None and not isinstance(info['endCursor'], str))):
                return incomplete('malformed_page')
            if total is not None and total != count:
                return incomplete('unstable_snapshot')
            total = count
            for row in nodes:
                if (not isinstance(row, dict) or type(row.get('number')) is not int or row['number'] < 1
                        or not all(isinstance(row.get(k), str) for k in
                                   ('title', 'headRefName', 'baseRefName', 'createdAt', 'updatedAt', 'mergedAt'))):
                    return incomplete('malformed_pr')
                try:
                    created, merged, updated = (_epoch(row[k]) for k in ('createdAt', 'mergedAt', 'updatedAt'))
                except (ValueError, OverflowError):
                    return incomplete('malformed_pr')
                if not created <= merged <= updated:
                    return incomplete('malformed_pr')
                if updated > last_updated:
                    return incomplete('unstable_page_order')
                last_updated = updated
                if row['number'] in seen:
                    return incomplete('duplicate_pr')
                seen.add(row['number'])
                if since <= merged < until:
                    rows.append(row)
            if len(seen) > total:
                return incomplete('result_count_mismatch')
            if not info['hasNextPage']:
                if len(seen) != total:
                    return incomplete('result_count_mismatch')
                break
            next_cursor = info.get('endCursor')
            if not nodes or not next_cursor or next_cursor in cursors:
                return incomplete('malformed_cursor')
            cursors.add(next_cursor)
            if last_updated < since:
                break  # updatedAt >= mergedAt proves every remaining row outside the window
            cursor = next_cursor
        else:
            return incomplete('max_pages_reached')
        rows.sort(key=lambda row: row['number'])
        if previous is not None and rows != previous:
            return incomplete('unstable_snapshot')
        previous = rows
    return {**result, 'complete': True, 'prs': previous}


# Every collect() is two full scans; the doctor ran it each dispatch tick and the HUD every
# refresh, about 140 GraphQL reads an hour on Gem for one 24 h stat (2026-10-12 gh ledger).
SHARED_TTL_S = 300


def collect_shared(repository: str, since: float, until: float, cache: Path | None, *,
                   ttl_s: float = SHARED_TTL_S, collect_fn=None) -> dict:
    """collect(), reused across a host's lanes processes for up to ttl_s.

    Only complete evidence is shared. A reused read keeps its own `until`: rows merged
    after it are simply not counted yet, never reported as read."""
    collect_fn = collect_fn or collect
    if cache is None:
        return collect_fn(repository, since, until)
    try:
        shared = json.loads(Path(cache).read_text())
        evidence = shared['evidence']
        window = evidence['window']
        if (shared['repository'] == repository and evidence['complete'] is True
                and window['since'] <= since and 0 <= until - window['until'] < ttl_s):
            rows = [row for row in evidence['prs'] if since <= _epoch(row['mergedAt'])]
            return {**evidence, 'window': {'since': since, 'until': window['until']}, 'prs': rows}
    except (OSError, ValueError, KeyError, TypeError):
        pass
    evidence = collect_fn(repository, since, until)
    if evidence.get('complete') is True:
        try:
            Path(cache).parent.mkdir(parents=True, exist_ok=True)
            tmp = Path(cache).with_name(f'{Path(cache).name}.{os.getpid()}.tmp')
            tmp.write_text(json.dumps({'repository': repository, 'evidence': evidence}))
            os.replace(tmp, cache)
        except OSError:
            pass  # an unwritable cache only costs the next reader a fresh read
    return evidence


def require_complete(evidence: dict) -> list[dict]:
    if not evidence['complete']:
        raise IncompleteMergeEvidence('merged-pr-evidence:' + evidence['reason'])
    return evidence['prs']
