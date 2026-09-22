import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  classifyStatus,
  collectInventory,
  fetchJson,
  main,
  PAGE_SIZE,
  SonarFetchError,
} from './fetch-sonar-issues.mjs';

const BASE = 'https://sonar.test';
const TOKEN = 'test-secret-token';
const noSleep = () => Promise.resolve();

function captureLogger() {
  const lines = [];
  return {
    lines,
    log: message => lines.push(`log:${message}`),
    warn: message => lines.push(`warn:${message}`),
    error: message => lines.push(`error:${message}`),
  };
}

function ok(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function httpError(status, headers = {}) {
  return new Response(JSON.stringify({ errors: [{ msg: `http ${status}` }] }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function makeIssue(index, extra = {}) {
  return {
    key: `K${index}`,
    rule: 'typescript:S100',
    component: `JovieInc_Jovie:apps/web/file-${index % 4}.ts`,
    severity: 'MAJOR',
    type: 'CODE_SMELL',
    status: 'OPEN',
    message: `issue ${index}`,
    creationDate: '2026-09-01T00:00:00+0000',
    ...extra,
  };
}

function paged(total, factory = makeIssue) {
  return url => {
    const page = Number(url.searchParams.get('p') ?? 1);
    const ps = Number(url.searchParams.get('ps') ?? PAGE_SIZE);
    const start = (page - 1) * ps;
    const count = Math.max(0, Math.min(ps, total - start));
    return ok({
      paging: { pageIndex: page, pageSize: ps, total },
      issues: Array.from({ length: count }, (_, k) => factory(start + k)),
    });
  };
}

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'jovie-sonar-fetch-'));
  mkdirSync(join(root, 'apps/web'), { recursive: true });
  return root;
}

/**
 * A complete stub "world" for collectInventory. `open` is the issues/search
 * responder for the unresolved query; `facets` answers facet calls by name.
 */
function world({
  openTotal = 0,
  open = null,
  acceptedTotal = 0,
  hotspotsTotal = 0,
  newCodeTotal = 0,
  analyses = ['A1'],
  revision = 'abc123',
  componentStatus = 200,
  measureMetrics = {},
  measures = null,
  facets = () =>
    ok({
      paging: { pageIndex: 1, pageSize: 1, total: 0 },
      issues: [],
      facets: [],
    }),
} = {}) {
  const calls = [];
  let analysisIndex = 0;
  const openResponder = open ?? paged(openTotal);
  const measuresResponder =
    measures ??
    (() =>
      ok({
        component: {
          measures: Object.entries(measureMetrics).map(([metric, value]) => ({
            metric,
            value: String(value),
          })),
        },
      }));

  const fetchImpl = async url => {
    calls.push(url);
    const parsed = new URL(url);
    const query = parsed.searchParams;

    if (parsed.pathname === '/api/components/show') {
      return componentStatus === 200
        ? ok({ component: { key: 'JovieInc_Jovie', name: 'Jovie' } })
        : httpError(componentStatus);
    }
    if (parsed.pathname === '/api/project_analyses/search') {
      const key = analyses[Math.min(analysisIndex, analyses.length - 1)];
      analysisIndex += 1;
      return ok({
        paging: { pageIndex: 1, pageSize: 1, total: 1 },
        analyses: key
          ? [{ key, date: '2026-09-20T00:00:00+0000', revision }]
          : [],
      });
    }
    if (parsed.pathname === '/api/issues/search') {
      if (query.get('facets')) return facets(query.get('facets'), parsed);
      if (query.get('inNewCodePeriod') === 'true') {
        return ok({
          paging: { pageIndex: 1, pageSize: 1, total: newCodeTotal },
          issues: [],
        });
      }
      if (query.get('resolved') === 'true') {
        return paged(acceptedTotal, index => ({
          key: `ACC${index}`,
          resolution: 'FALSE-POSITIVE',
        }))(parsed);
      }
      return openResponder(parsed);
    }
    if (parsed.pathname === '/api/hotspots/search') {
      const page = Number(query.get('p') ?? 1);
      const start = (page - 1) * PAGE_SIZE;
      const count = Math.max(0, Math.min(PAGE_SIZE, hotspotsTotal - start));
      return ok({
        paging: { pageIndex: page, pageSize: PAGE_SIZE, total: hotspotsTotal },
        hotspots: Array.from({ length: count }, (_, k) => ({
          key: `H${start + k}`,
          status: 'TO_REVIEW',
        })),
      });
    }
    if (parsed.pathname === '/api/measures/component') {
      return measuresResponder(parsed);
    }
    throw new Error(`unmocked request: ${url}`);
  };

  return { fetchImpl, calls };
}

function collect(worldOptions = {}, inventoryOptions = {}) {
  const { fetchImpl, calls } = world(worldOptions);
  const promise = collectInventory({
    baseUrl: BASE,
    token: TOKEN,
    fetchImpl,
    sleep: noSleep,
    env: { GITHUB_SHA: 'abc123' },
    cwd: process.cwd(),
    logger: captureLogger(),
    ...inventoryOptions,
  });
  return { promise, calls };
}

async function thrown(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return null;
}

describe('classifyStatus', () => {
  it('maps status codes onto the failure taxonomy', () => {
    expect(classifyStatus(401)).toBe('credentials');
    expect(classifyStatus(403)).toBe('credentials');
    expect(classifyStatus(404)).toBe('not_found');
    expect(classifyStatus(429)).toBe('rate_limited');
    expect(classifyStatus(500)).toBe('server');
    expect(classifyStatus(503)).toBe('server');
    expect(classifyStatus(400)).toBe('client');
    expect(classifyStatus(418)).toBe('client');
  });
});

describe('fetchJson error classification', () => {
  const url = `${BASE}/api/issues/search?p=1`;

  it('returns parsed JSON on success', async () => {
    const fetchImpl = async () => ok({ hello: 'world' });
    const json = await fetchJson(url, {
      token: TOKEN,
      fetchImpl,
      sleep: noSleep,
    });
    expect(json.hello).toBe('world');
  });

  it('classifies 401/403 as credentials and never retries', async () => {
    for (const status of [401, 403]) {
      let calls = 0;
      const fetchImpl = async () => {
        calls += 1;
        return httpError(status);
      };
      const error = await thrown(
        fetchJson(url, { token: TOKEN, fetchImpl, sleep: noSleep })
      );
      expect(error).toBeInstanceOf(SonarFetchError);
      expect(error.kind).toBe('credentials');
      expect(calls).toBe(1);
    }
  });

  it('retries 429 with backoff and honors Retry-After', async () => {
    const sleeps = [];
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return calls === 1
        ? httpError(429, { 'retry-after': '3' })
        : ok({ paging: { pageIndex: 1, pageSize: 500, total: 0 }, issues: [] });
    };
    await fetchJson(url, {
      token: TOKEN,
      fetchImpl,
      sleep: ms => {
        sleeps.push(ms);
        return noSleep();
      },
    });
    expect(calls).toBe(2);
    expect(sleeps[0]).toBeGreaterThanOrEqual(3000);
  });

  it('exhausts bounded retries on persistent 429', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return httpError(429);
    };
    const error = await thrown(
      fetchJson(url, { token: TOKEN, fetchImpl, sleep: noSleep })
    );
    expect(error.kind).toBe('rate_limited');
    expect(calls).toBe(4);
  });

  it('retries then succeeds on 5xx', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return calls < 3 ? httpError(503) : ok({ ok: true });
    };
    const json = await fetchJson(url, {
      token: TOKEN,
      fetchImpl,
      sleep: noSleep,
    });
    expect(json.ok).toBe(true);
    expect(calls).toBe(3);
  });

  it('classifies persistent 5xx as server', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return httpError(500);
    };
    const error = await thrown(
      fetchJson(url, { token: TOKEN, fetchImpl, sleep: noSleep })
    );
    expect(error.kind).toBe('server');
    expect(calls).toBe(4);
  });

  it('classifies transport failures as network', async () => {
    const fetchImpl = async () => {
      throw new TypeError('fetch failed');
    };
    const error = await thrown(
      fetchJson(url, {
        token: TOKEN,
        fetchImpl,
        sleep: noSleep,
        maxAttempts: 2,
      })
    );
    expect(error.kind).toBe('network');
  });

  it('classifies aborts as timeout', async () => {
    const fetchImpl = async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    };
    const error = await thrown(
      fetchJson(url, {
        token: TOKEN,
        fetchImpl,
        sleep: noSleep,
        maxAttempts: 1,
      })
    );
    expect(error.kind).toBe('timeout');
  });

  it('classifies unparseable bodies as malformed_json without retry', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response('<html>oops</html>', { status: 200 });
    };
    const error = await thrown(
      fetchJson(url, { token: TOKEN, fetchImpl, sleep: noSleep })
    );
    expect(error.kind).toBe('malformed_json');
    expect(calls).toBe(1);
  });
});

describe('collectInventory', () => {
  it('paginates on live paging metadata until exhausted', async () => {
    const { promise, calls } = collect({ openTotal: 1158 });
    const result = await promise;
    expect(result.status).toBe('COMPLETE');
    expect(result.issues).toHaveLength(1158);
    const pages = calls
      .map(c => new URL(c))
      .filter(
        url =>
          url.pathname === '/api/issues/search' &&
          url.searchParams.get('resolved') === 'false' &&
          !url.searchParams.get('facets') &&
          !url.searchParams.get('inNewCodePeriod')
      )
      .map(url => url.searchParams.get('p'));
    expect(pages).toEqual(['1', '2', '3']);
    expect(pages).not.toContain('4');
  });

  it('collects more than 1,500 findings across 4 pages', async () => {
    const { promise } = collect({ openTotal: 1600 });
    const result = await promise;
    expect(result.status).toBe('COMPLETE');
    expect(result.issues).toHaveLength(1600);
    expect(result.inventory.counts.open.fetched).toBe(1600);
  });

  it('treats a genuinely empty project as COMPLETE, not a failure', async () => {
    const { promise } = collect({ openTotal: 0 });
    const result = await promise;
    expect(result.status).toBe('COMPLETE');
    expect(result.issues).toHaveLength(0);
    expect(result.inventory.incompleteness).toHaveLength(0);
    expect(result.inventory.counts.open.apiTotal).toBe(0);
  });

  it('pins the branch on every issues/search call', async () => {
    const { promise, calls } = collect({ openTotal: 3 });
    await promise;
    const issueCalls = calls.filter(c => c.includes('/api/issues/search'));
    for (const call of issueCalls) {
      expect(new URL(call).searchParams.get('branch')).toBe('main');
    }
  });

  it('binds the inventory to project, branch, analysis, and observed sha', async () => {
    const { promise } = collect(
      { openTotal: 2, revision: 'abc123' },
      { env: { GITHUB_SHA: 'abc123' } }
    );
    const result = await promise;
    expect(result.inventory.projectKey).toBe('JovieInc_Jovie');
    expect(result.inventory.branch).toBe('main');
    expect(result.inventory.analysis).toEqual({
      key: 'A1',
      date: '2026-09-20T00:00:00+0000',
      revision: 'abc123',
    });
    expect(result.inventory.observedSha).toBe('abc123');
    expect(result.inventory.staleness.stale).toBe(false);
  });

  it('flags a stale analysis revision relative to the observed sha', async () => {
    const { promise } = collect(
      { openTotal: 1, revision: 'old-revision' },
      { env: { GITHUB_SHA: 'new-sha' } }
    );
    const result = await promise;
    expect(result.inventory.staleness.stale).toBe(true);
    expect(
      result.inventory.warnings.some(w => w.includes('lags observed commit'))
    ).toBe(true);
  });

  it('partitions on createdAt months when the 10k result cap is hit', async () => {
    const { promise, calls } = collect({
      open: url => {
        const after = url.searchParams.get('createdAfter');
        if (after === '2026-08-01') {
          return paged(6000, i => makeIssue(`aug-${i}`))(url);
        }
        if (after === '2026-09-01') {
          return paged(6000, i => makeIssue(`sep-${i}`))(url);
        }
        return paged(12000)(url);
      },
      facets: facet => {
        expect(facet).toBe('createdAt');
        return ok({
          paging: { pageIndex: 1, pageSize: 1, total: 12000 },
          issues: [],
          facets: [
            {
              property: 'createdAt',
              values: [
                { val: '2026-08', count: 6000 },
                { val: '2026-09', count: 6000 },
              ],
            },
          ],
        });
      },
    });
    const result = await promise;
    expect(result.status).toBe('COMPLETE');
    expect(result.issues).toHaveLength(12000);
    expect(
      calls.some(
        c =>
          c.includes('createdAfter=2026-08-01') &&
          c.includes('createdBefore=2026-08-31')
      )
    ).toBe(true);
    expect(calls.some(c => c.includes('createdAfter=2026-09-01'))).toBe(true);
  });

  it('sub-partitions an over-cap month by rule', async () => {
    const { promise, calls } = collect({
      open: url => {
        const rules = url.searchParams.get('rules');
        if (rules === 'typescript:S1') {
          return paged(6000, i => makeIssue(`r1-${i}`))(url);
        }
        if (rules === 'typescript:S2') {
          return paged(5000, i => makeIssue(`r2-${i}`))(url);
        }
        return paged(11000)(url);
      },
      facets: (facet, url) => {
        if (facet === 'createdAt') {
          return ok({
            paging: { pageIndex: 1, pageSize: 1, total: 11000 },
            issues: [],
            facets: [
              {
                property: 'createdAt',
                values: [{ val: '2026-09', count: 11000 }],
              },
            ],
          });
        }
        expect(facet).toBe('rules');
        expect(url.searchParams.get('createdAfter')).toBe('2026-09-01');
        return ok({
          paging: { pageIndex: 1, pageSize: 1, total: 11000 },
          issues: [],
          facets: [
            {
              property: 'rules',
              values: [
                { val: 'typescript:S1', count: 6000 },
                { val: 'typescript:S2', count: 5000 },
              ],
            },
          ],
        });
      },
    });
    const result = await promise;
    expect(result.status).toBe('COMPLETE');
    expect(result.issues).toHaveLength(11000);
    expect(calls.some(c => c.includes('rules=typescript%3AS1'))).toBe(true);
  });

  it('reports INCOMPLETE on a partition that still exceeds the cap', async () => {
    const { promise } = collect({
      open: url => paged(11000)(url),
      facets: (facet, url) => {
        if (facet === 'createdAt') {
          return ok({
            paging: { pageIndex: 1, pageSize: 1, total: 11000 },
            issues: [],
            facets: [
              {
                property: 'createdAt',
                values: [{ val: '2026-09', count: 11000 }],
              },
            ],
          });
        }
        return ok({
          paging: { pageIndex: 1, pageSize: 1, total: 11000 },
          issues: [],
          facets: [
            {
              property: 'rules',
              values: [{ val: 'typescript:S1', count: 11000 }],
            },
          ],
        });
      },
    });
    const result = await promise;
    expect(result.status).toBe('INCOMPLETE');
    expect(
      result.inventory.incompleteness.some(
        entry => entry.reason === 'result_cap_exceeded'
      )
    ).toBe(true);
    expect(result.issues.length).toBe(10000);
  });

  it('fails closed when a page errors mid-collection', async () => {
    const { promise } = collect({
      open: url => {
        const page = Number(url.searchParams.get('p') ?? 1);
        return page === 1 ? paged(1158)(url) : httpError(500);
      },
    });
    const error = await thrown(promise);
    expect(error).toBeInstanceOf(SonarFetchError);
    expect(error.kind).toBe('server');
  });

  it('deduplicates by stable issue key and counts drops', async () => {
    const { promise } = collect({
      openTotal: 600,
      open: url => {
        const page = Number(url.searchParams.get('p') ?? 1);
        const start = (page - 1) * PAGE_SIZE;
        const count = Math.max(0, Math.min(PAGE_SIZE, 600 - start));
        return ok({
          paging: { pageIndex: page, pageSize: PAGE_SIZE, total: 600 },
          issues: Array.from({ length: count }, (_, k) =>
            // Repeat key K0 on the second page.
            makeIssue(page === 2 && k === 0 ? 0 : start + k)
          ),
        });
      },
    });
    const result = await promise;
    // Unique fetches (599) under-run the API total (600) — reconciliation
    // must flag that rather than presenting the deduped set as complete.
    expect(result.status).toBe('INCOMPLETE');
    expect(result.issues).toHaveLength(599);
    expect(result.inventory.counts.open.duplicatesDropped).toBe(1);
    expect(
      result.inventory.incompleteness.some(
        entry => entry.reason === 'fetched_unique_below_api_total'
      )
    ).toBe(true);
  });

  it('warns on records missing a stable key', async () => {
    const { promise } = collect({
      openTotal: 2,
      open: paged(2, index =>
        index === 1 ? { ...makeIssue(index), key: undefined } : makeIssue(index)
      ),
    });
    const result = await promise;
    expect(result.issues).toHaveLength(2);
    expect(
      result.inventory.warnings.some(w =>
        w.includes('without a stable issue key')
      )
    ).toBe(true);
  });

  it('fails closed on a wrong branch (components/show 404)', async () => {
    const { promise } = collect({ componentStatus: 404 });
    const error = await thrown(promise);
    expect(error).toBeInstanceOf(SonarFetchError);
    expect(error.kind).toBe('not_found');
    expect(error.message).toMatch(/branch "main" not found|not found on/);
  });

  it('retries once on a mid-collection analysis change, then stays atomic', async () => {
    const { promise } = collect({ openTotal: 5, analyses: ['A1', 'A2'] });
    const result = await promise;
    expect(result.atomic).toBe(true);
    expect(result.inventory.analysis.key).toBe('A2');
  });

  it('marks the inventory non-atomic when analysis drifts twice', async () => {
    const { promise } = collect({
      openTotal: 5,
      analyses: ['A1', 'A2', 'A3', 'A4'],
    });
    const result = await promise;
    expect(result.atomic).toBe(false);
    expect(
      result.inventory.warnings.some(w => w.includes('analysis changed twice'))
    ).toBe(true);
  });

  it('degrades to measures=unsupported when metric keys are rejected', async () => {
    const { promise } = collect({
      openTotal: 3,
      measures: () => httpError(400),
    });
    const result = await promise;
    expect(result.status).toBe('COMPLETE');
    expect(result.inventory.reconciliation.measures.status).toBe('unsupported');
  });

  it('warns when published measures diverge from the issue inventory', async () => {
    const { promise } = collect({
      openTotal: 4,
      open: paged(4, index => makeIssue(index, { type: 'BUG' })),
      measureMetrics: { bugs: 99 },
    });
    const result = await promise;
    expect(result.inventory.reconciliation.measures.status).toBe('ok');
    expect(
      result.inventory.warnings.some(w => w.includes('measures diverge'))
    ).toBe(true);
  });

  it('flags empty-page shortfalls as INCOMPLETE', async () => {
    let firstPage = true;
    const { promise } = collect({
      open: url => {
        const after = url.searchParams.get('createdAfter');
        if (after === '2026-09-01') {
          return paged(150, i => makeIssue(`x-${i}`))(url);
        }
        if (firstPage) {
          firstPage = false;
          return paged(1500)(url); // p1 → 500 issues, total 1500
        }
        // p2 empty although total says more exist
        return ok({
          paging: { pageIndex: 2, pageSize: PAGE_SIZE, total: 1500 },
          issues: [],
        });
      },
      facets: facet => {
        expect(facet).toBe('createdAt');
        return ok({
          paging: { pageIndex: 1, pageSize: 1, total: 1500 },
          issues: [],
          facets: [
            {
              property: 'createdAt',
              values: [{ val: '2026-09', count: 1500 }],
            },
          ],
        });
      },
    });
    const result = await promise;
    // Partition only recovered 150 of the reported 1500 → INCOMPLETE.
    expect(result.status).toBe('INCOMPLETE');
    expect(
      result.inventory.incompleteness.some(
        entry => entry.reason === 'fetched_unique_below_api_total'
      )
    ).toBe(true);
  });

  it('rejects with credentials when no token is provided', async () => {
    const error = await thrown(collectInventory({ token: '' }));
    expect(error).toBeInstanceOf(SonarFetchError);
    expect(error.kind).toBe('credentials');
  });
});

describe('main', () => {
  it('exits 1 without a SONAR_TOKEN and writes nothing', async () => {
    const logger = captureLogger();
    const root = fixtureRoot();
    const exits = [];
    try {
      await main({}, { exit: code => exits.push(code), cwd: root, logger });
      expect(exits).toEqual([1]);
      expect(existsSync(join(root, 'apps/web/.issues'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('exits 0 and writes both artifacts on a complete atomic run', async () => {
    const logger = captureLogger();
    const root = fixtureRoot();
    const exits = [];
    const { fetchImpl } = world({ openTotal: 3, hotspotsTotal: 1 });
    try {
      await main(
        { SONAR_TOKEN: TOKEN, SONAR_BASE_URL: BASE },
        {
          exit: code => exits.push(code),
          cwd: root,
          fetchImpl,
          sleep: noSleep,
          logger,
        }
      );
      expect(exits).toEqual([0]);
      const issuesPath = join(
        root,
        'apps/web/.issues/sonar-issues-latest.json'
      );
      const inventoryPath = join(
        root,
        'apps/web/.issues/sonar-issues-inventory.json'
      );
      expect(existsSync(issuesPath)).toBe(true);
      expect(existsSync(inventoryPath)).toBe(true);
      const issues = JSON.parse(readFileSync(issuesPath, 'utf8'));
      const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
      expect(issues).toHaveLength(3);
      expect(inventory.status).toBe('COMPLETE');
      expect(inventory.atomic).toBe(true);
      // The token must never appear in logs or written artifacts.
      for (const line of logger.lines) {
        expect(line.includes(TOKEN)).toBe(false);
      }
      expect(readFileSync(inventoryPath, 'utf8').includes(TOKEN)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('exits 2 but still writes flagged artifacts on INCOMPLETE evidence', async () => {
    const logger = captureLogger();
    const root = fixtureRoot();
    const exits = [];
    const { fetchImpl } = world({
      open: url => paged(11000)(url),
      facets: (facet, url) => {
        if (facet === 'createdAt') {
          return ok({
            paging: { pageIndex: 1, pageSize: 1, total: 11000 },
            issues: [],
            facets: [
              {
                property: 'createdAt',
                values: [{ val: '2026-09', count: 11000 }],
              },
            ],
          });
        }
        return ok({
          paging: { pageIndex: 1, pageSize: 1, total: 11000 },
          issues: [],
          facets: [
            { property: 'rules', values: [{ val: 'r1', count: 11000 }] },
          ],
        });
      },
    });
    try {
      await main(
        { SONAR_TOKEN: TOKEN, SONAR_BASE_URL: BASE },
        {
          exit: code => exits.push(code),
          cwd: root,
          fetchImpl,
          sleep: noSleep,
          logger,
        }
      );
      expect(exits).toEqual([2]);
      const inventory = JSON.parse(
        readFileSync(
          join(root, 'apps/web/.issues/sonar-issues-inventory.json'),
          'utf8'
        )
      );
      expect(inventory.status).toBe('INCOMPLETE');
      expect(inventory.incompleteness.length).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('exits 1 and leaves last-known evidence untouched on hard failure', async () => {
    const logger = captureLogger();
    const root = fixtureRoot();
    const issuesDir = join(root, 'apps/web/.issues');
    mkdirSync(issuesDir);
    const sentinel = join(issuesDir, 'sonar-issues-latest.json');
    writeFileSync(sentinel, '[{"key":"last-known"}]');
    const exits = [];
    const fetchImpl = async () => httpError(500);
    try {
      await main(
        { SONAR_TOKEN: TOKEN, SONAR_BASE_URL: BASE },
        {
          exit: code => exits.push(code),
          cwd: root,
          fetchImpl,
          sleep: noSleep,
          logger,
        }
      );
      expect(exits).toEqual([1]);
      expect(readFileSync(sentinel, 'utf8')).toBe('[{"key":"last-known"}]');
      expect(readdirSync(issuesDir)).toEqual(['sonar-issues-latest.json']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
