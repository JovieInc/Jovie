"""Bounded observed merge windows for the existing lane doctor and HUD.

Search's merged: qualifier and exhausted slices enumerate the provider's search
index, not the repository population. On 2026-10-27 it omitted the independently
verified #22413 merge while its count matched the returned rows. Empty search is
therefore zero observations, never proof of zero merges. Preserve validated events
and the existing bounds/cache without adding a collector or changing read budgets.
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
      mergeCommit{oid} baseRefName createdAt updatedAt mergedAt body}}
  }
}'''
SEARCH_COVERAGE_REASON = 'provider-search-enumeration-not-transactional'


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


def _merged_epoch(row: dict) -> float:
    if (not isinstance(row, dict) or type(row.get('number')) is not int or row['number'] < 1
            or not all(isinstance(row.get(k), str) for k in
                       ('title', 'headRefName', 'baseRefName', 'createdAt', 'updatedAt', 'mergedAt'))):
        raise ValueError('malformed_pr')
    for actor in ('author', 'mergedBy'):
        value = row.get(actor)
        if value is not None and (not isinstance(value, dict) or not isinstance(value.get('login'), str)):
            raise ValueError('malformed_pr')
    if row.get('url') is not None and not isinstance(row['url'], str):
        raise ValueError('malformed_pr')
    created, merged, updated = (_epoch(row[k]) for k in ('createdAt', 'mergedAt', 'updatedAt'))
    if not created <= merged <= updated:
        raise ValueError('malformed_pr')
    return merged


def collect(repository: str, since: float, until: float, *, fetch_page=None,
            max_pages: int = 20, timeout_s: float = 60) -> dict:
    """Return observed rows with explicit unknown population coverage, never exact totals.

    `fetch_page(lo, hi)` returns one search page ({issueCount, nodes}) for PRs merged in
    [lo, hi] (whole seconds, inclusive as search is); rows are kept half-open per slice."""
    result = {'schema': 'jovie-merge-window/v1', 'complete': False, 'reason': None,
              'window': {'since': since, 'until': until}, 'pages': 0, 'scans': 1,
              'source': {'provider': 'github', 'method': 'search', 'repository': repository,
                         'atomicSnapshot': False},
              'providerEnumerationComplete': False, 'populationCoverage': 'unknown',
              'populationCount': None, 'observedCount': 0, 'enumeratedSlices': [], 'prs': []}
    rows = {}
    def incomplete(reason):
        return {**result, 'reason': reason, 'observedCount': len(rows),
                'prs': [rows[number] for number in sorted(rows)]}
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
    slices = [(math.floor(since), math.ceil(until))]
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
            try:
                merged = _merged_epoch(row)
            except (ValueError, OverflowError):
                return incomplete('malformed_pr')
            if not lo <= merged <= hi:
                return incomplete('malformed_pr')
            if not since <= merged < until:
                continue
            if row['number'] in rows and rows[row['number']] != row:
                del rows[row['number']]  # conflicting identity is not a retained observation
                return incomplete('duplicate_pr')
            rows[row['number']] = row
        result['enumeratedSlices'].append({'sinceInclusive': lo, 'untilInclusive': hi,
                                           'providerCount': count, 'returnedCount': len(nodes)})
    return {**incomplete(SEARCH_COVERAGE_REASON), 'providerEnumerationComplete': True}


def search_observations(evidence: dict, repository: str | None = None) -> bool:
    """Recognize this reader's bounded event evidence, not a population certificate.

    This also prevents legacy complete:true Search cache entries from restoring
    the old claim. Callers still check freshness and exact PR/head identities.
    """
    if not isinstance(evidence, dict):
        return False
    source, window, rows = evidence.get('source'), evidence.get('window'), evidence.get('prs')
    if not isinstance(source, dict) or not isinstance(window, dict) or not isinstance(rows, list):
        return False
    valid = (evidence.get('schema') == 'jovie-merge-window/v1'
            and evidence.get('complete') is False
            and evidence.get('populationCoverage') == 'unknown'
            and evidence.get('populationCount') is None
            and type(evidence.get('observedCount')) is int
            and evidence['observedCount'] == len(rows)
            and source.get('provider') == 'github' and source.get('method') == 'search'
            and isinstance(source.get('repository'), str)
            and source.get('atomicSnapshot') is False
            and (repository is None or source.get('repository') == repository)
            and all(isinstance(window.get(k), (int, float)) and not isinstance(window[k], bool)
                    and math.isfinite(window[k]) for k in ('since', 'until'))
            and window['since'] < window['until'])
    if not valid:
        return False
    try:
        merged_epochs = [_merged_epoch(row) for row in rows]
        if (not all(window['since'] <= merged < window['until'] for merged in merged_epochs)
                or len({row['number'] for row in rows}) != len(rows)):
            return False
        if evidence.get('providerEnumerationComplete') is True:
            slices = evidence.get('enumeratedSlices')
            if not isinstance(slices, list) or not 1 <= len(slices) <= 100:
                return False
            for part in slices:
                if (not isinstance(part, dict) or not all(type(part.get(k)) is int for k in
                        ('sinceInclusive', 'untilInclusive', 'providerCount', 'returnedCount'))
                        or part['sinceInclusive'] > part['untilInclusive']
                        or not 0 <= part['providerCount'] == part['returnedCount'] <= 100):
                    return False
                # Cache reuse may narrow the window, so retained rows can be
                # fewer than returned rows, but never exceed their own slice.
                if sum(part['sinceInclusive'] <= merged <= part['untilInclusive']
                       for merged in merged_epochs) > part['returnedCount']:
                    return False
            ordered = sorted(slices, key=lambda part: part['sinceInclusive'])
            if (ordered[0]['sinceInclusive'] > math.floor(window['since'])
                    or ordered[-1]['untilInclusive'] < math.ceil(window['until'])
                    or any(a['untilInclusive'] + 1 != b['sinceInclusive'] for a, b in zip(ordered, ordered[1:]))):
                return False
    except (ValueError, OverflowError, KeyError, TypeError):
        return False
    return True


# The doctor ran collect() each dispatch tick and the HUD every refresh, about 140 GraphQL
# reads an hour on Gem for one 24 h stat (2026-10-12 gh ledger).
SHARED_TTL_S = 300


def collect_shared(repository: str, since: float, until: float, cache: Path | None, *,
                   ttl_s: float = SHARED_TTL_S, collect_fn=None) -> dict:
    """collect(), reused across a host's lanes processes for up to ttl_s.

    Only exhausted provider enumeration is shared, still with unknown population
    coverage. A reused read keeps its own `until`; later events are not claimed."""
    collect_fn = collect_fn or collect
    if cache is None:
        return collect_fn(repository, since, until)
    try:
        shared = json.loads(Path(cache).read_text())
        evidence = shared['evidence']
        window = evidence['window']
        if (shared['repository'] == repository and search_observations(evidence, repository)
                and evidence.get('providerEnumerationComplete') is True
                and evidence.get('reason') == SEARCH_COVERAGE_REASON
                and window['since'] <= since < window['until']
                and 0 <= until - window['until'] < ttl_s):
            rows = [row for row in evidence['prs'] if since <= _epoch(row['mergedAt'])]
            return {**evidence, 'window': {'since': since, 'until': window['until']},
                    'observedCount': len(rows), 'prs': rows}
    except (OSError, ValueError, KeyError, TypeError):
        pass
    evidence = collect_fn(repository, since, until)
    if (search_observations(evidence, repository) and evidence.get('providerEnumerationComplete') is True
            and evidence.get('reason') == SEARCH_COVERAGE_REASON):
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
