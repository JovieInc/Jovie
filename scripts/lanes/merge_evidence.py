"""Complete merge windows for the existing lane doctor and HUD.

Reads merged PRs through the search API's `merged:` qualifier, which filters on mergedAt
itself. The repository connection's UPDATED_AT order lags (2026-10-13: #21435 at 22:41Z
listed ahead of #21430 at 23:19Z), so the old two-scan early-stop reader reported
`unstable_page_order` and an unknown 24 h window most of the time. Search caps a query at
1000 results and a page at 100, so a window with more matches than one page is split in
half until every slice fits one page: no cursor, no ordering assumption. Incomplete now
means a real read failure or a malformed reply. No background collector, attribution
policy, or new persisted authority. The doctor (every dispatch tick) and the HUD read the
same 24 h window, so `collect_shared` lets them share one complete read for a few minutes.
"""
from __future__ import annotations

from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import subprocess
import time

QUERY = '''query($q:String!){
  search(query:$q,type:ISSUE,first:100){
    issueCount
    nodes{... on PullRequest{number title url author{login} mergedBy{login} headRefName headRefOid
      mergeCommit{oid} baseRefName createdAt updatedAt mergedAt}}
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


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def collect(repository: str, since: float, until: float, *, fetch_page=None,
            max_pages: int = 20, timeout_s: float = 60) -> dict:
    """Return typed incomplete evidence on every bounded-read failure; never partial counts.

    `fetch_page(lo, hi)` returns one search page ({issueCount, nodes}) for PRs merged in
    [lo, hi] (whole seconds, inclusive as search is); rows are kept half-open per slice."""
    result = {'schema': 'jovie-merge-window/v1', 'complete': False, 'reason': None,
              'window': {'since': since, 'until': until}, 'pages': 0, 'scans': 1, 'prs': []}
    def incomplete(reason):
        return {**result, 'reason': reason, 'prs': []}
    if (not all(isinstance(v, (float, int)) and not isinstance(v, bool) and math.isfinite(v)
                for v in (since, until, timeout_s)) or since >= until or timeout_s <= 0
            or type(max_pages) is not int or not 1 <= max_pages <= 100
            or not isinstance(repository, str) or len(repository.split('/')) != 2
            or not all(repository.split('/'))):
        return incomplete('invalid_fetch_options')
    deadline = time.monotonic() + timeout_s
    def remote(lo, hi):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError()
        query = f'repo:{repository} is:pr is:merged merged:{_iso(lo)}..{_iso(hi)}'
        response = subprocess.run(['gh', 'api', 'graphql', '-f', 'query=' + QUERY, '-f', 'q=' + query],
                                  capture_output=True, text=True, timeout=remaining)
        if response.returncode:
            raise RuntimeError('github_read_failed')
        data = json.loads(response.stdout)
        if not isinstance(data, dict):
            raise ValueError('malformed graphql response')
        if data.get('errors'):
            raise RuntimeError('github_graphql_errors')
        return data['data']['search']
    fetch = fetch_page or remote
    rows, slices = {}, [(math.floor(since), math.ceil(until))]
    while slices:
        if result['pages'] >= max_pages:
            return incomplete('max_pages_reached')
        if time.monotonic() >= deadline:
            return incomplete('deadline_exceeded')
        lo, hi = slices.pop()
        try:
            page = fetch(lo, hi)
        except (subprocess.TimeoutExpired, TimeoutError):
            return incomplete('deadline_exceeded')
        except (OSError, ValueError, KeyError, TypeError, RuntimeError, subprocess.SubprocessError):
            return incomplete('fetch_failed')
        result['pages'] += 1
        if time.monotonic() >= deadline:
            return incomplete('deadline_exceeded')
        if not isinstance(page, dict):
            return incomplete('malformed_page')
        nodes, count = page.get('nodes'), page.get('issueCount')
        if not isinstance(nodes, list) or len(nodes) > 100 or type(count) is not int or count < len(nodes):
            return incomplete('malformed_page')
        if count > len(nodes):
            if hi - lo < 2:
                return incomplete('slice_too_dense')
            mid = (lo + hi) // 2
            slices += [(lo, mid), (mid + 1, hi)]  # search bounds are inclusive whole seconds
            continue
        for row in nodes:
            if (not isinstance(row, dict) or type(row.get('number')) is not int or row['number'] < 1
                    or not all(isinstance(row.get(k), str) for k in
                               ('title', 'headRefName', 'baseRefName', 'createdAt', 'updatedAt', 'mergedAt'))):
                return incomplete('malformed_pr')
            for actor in ('author', 'mergedBy'):
                value = row.get(actor)
                if value is not None and (not isinstance(value, dict)
                                          or not isinstance(value.get('login'), str)):
                    return incomplete('malformed_pr')
            if row.get('url') is not None and not isinstance(row['url'], str):
                return incomplete('malformed_pr')
            try:
                created, merged, updated = (_epoch(row[k]) for k in ('createdAt', 'mergedAt', 'updatedAt'))
            except (ValueError, OverflowError):
                return incomplete('malformed_pr')
            if not created <= merged <= updated:
                return incomplete('malformed_pr')
            if not since <= merged < until:
                continue
            if row['number'] in rows and rows[row['number']] != row:
                return incomplete('duplicate_pr')
            rows[row['number']] = row
    return {**result, 'complete': True, 'prs': [rows[number] for number in sorted(rows)]}


# The doctor ran collect() each dispatch tick and the HUD every refresh, about 140 GraphQL
# reads an hour on Gem for one 24 h stat (2026-10-12 gh ledger).
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
