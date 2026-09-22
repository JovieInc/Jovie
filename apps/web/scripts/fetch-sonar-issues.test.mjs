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

const captureLogger = () => {
  const lines = [];
  return {
    lines,
    log: m => lines.push(`log:${m}`),
    warn: m => lines.push(`warn:${m}`),
    error: m => lines.push(`error:${m}`),
  };
};

const ok = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

const httpError = (status, headers = {}) =>
  new Response(JSON.stringify({ errors: [{ msg: `http ${status}` }] }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const pageOf = (total, page, ps, issues) =>
  ok({ paging: { pageIndex: page, pageSize: ps, total }, issues });

const makeIssue = (index, extra = {}) => ({
  key: `K${index}`,
  rule: 'typescript:S100',
  component: `JovieInc_Jovie:apps/web/file-${index % 4}.ts`,
  severity: 'MAJOR',
  type: 'CODE_SMELL',
  status: 'OPEN',
  message: `issue ${index}`,
  ...extra,
});

const paged =
  (total, factory = makeIssue) =>
  url => {
    const page = Number(url.searchParams.get('p') ?? 1);
    const ps = Number(url.searchParams.get('ps') ?? PAGE_SIZE);
    const start = (page - 1) * ps;
    const count = Math.max(0, Math.min(ps, total - start));
    return pageOf(
      total,
      page,
      ps,
      Array.from({ length: count }, (_, k) => factory(start + k))
    );
  };

const facetResp = (property, buckets, total) =>
  ok({
    paging: { pageIndex: 1, pageSize: 1, total },
    issues: [],
    facets: [
      { property, values: buckets.map(([val, count]) => ({ val, count })) },
    ],
  });

// Routes an issues/search request to a responder by the value of `param`.
const byParam = (param, mapping, fallback) => url =>
  (mapping[url.searchParams.get(param)] ?? fallback)(url);

const fixtureRoot = () => {
  const root = mkdtempSync(join(tmpdir(), 'jovie-sonar-fetch-'));
  mkdirSync(join(root, 'apps/web'), { recursive: true });
  return root;
};

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
  facets = () => facetResp('', [], 0),
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
    const q = parsed.searchParams;
    if (parsed.pathname === '/api/components/show') {
      return componentStatus === 200
        ? ok({ component: { key: 'JovieInc_Jovie', name: 'Jovie' } })
        : httpError(componentStatus);
    }
    if (parsed.pathname === '/api/project_analyses/search') {
      const key = analyses[Math.min(analysisIndex++, analyses.length - 1)];
      return ok({
        paging: { pageIndex: 1, pageSize: 1, total: key ? 1 : 0 },
        analyses: key
          ? [{ key, date: '2026-09-20T00:00:00+0000', revision }]
          : [],
      });
    }
    if (parsed.pathname === '/api/issues/search') {
      if (q.get('facets')) return facets(q.get('facets'), parsed);
      if (q.get('inNewCodePeriod') === 'true')
        return pageOf(newCodeTotal, 1, 1, []);
      if (q.get('resolved') === 'true') {
        return paged(acceptedTotal, i => ({
          key: `ACC${i}`,
          resolution: 'FALSE-POSITIVE',
        }))(parsed);
      }
      return openResponder(parsed);
    }
    if (parsed.pathname === '/api/hotspots/search') {
      const page = Number(q.get('p') ?? 1);
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

const collect = (worldOptions = {}, inventoryOptions = {}) => {
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
};

const expectSonarError = async (promise, kind) => {
  let error = null;
  try {
    await promise;
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(SonarFetchError);
  expect(error.kind).toBe(kind);
  return error;
};

describe('classifyStatus', () => {
  it('maps status codes onto the failure taxonomy', () => {
    expect(classifyStatus(401)).toBe('credentials');
    expect(classifyStatus(403)).toBe('credentials');
    expect(classifyStatus(404)).toBe('not_found');
    expect(classifyStatus(429)).toBe('rate_limited');
    expect(classifyStatus(500)).toBe('server');
    expect(classifyStatus(503)).toBe('server');
    expect(classifyStatus(400)).toBe('client');
  });
});

describe('fetchJson error classification', () => {
  const url = `${BASE}/api/issues/search?p=1`;
  const run = (fetchImpl, extra = {}) =>
    fetchJson(url, { token: TOKEN, fetchImpl, sleep: noSleep, ...extra });

  it('returns parsed JSON on success', async () => {
    const json = await run(async () => ok({ hello: 'world' }));
    expect(json.hello).toBe('world');
  });

  it('retries only retryable kinds, with a bound', async () => {
    const nonRetryable = [
      [() => httpError(401), 'credentials'],
      [() => httpError(403), 'credentials'],
      [() => httpError(400), 'client'],
      [
        () => new Response('<html>oops</html>', { status: 200 }),
        'malformed_json',
      ],
    ];
    const retryable = [
      [() => httpError(429), 'rate_limited'],
      [() => httpError(500), 'server'],
      [() => Promise.reject(new TypeError('fetch failed')), 'network'],
      [
        () =>
          Promise.reject(
            Object.assign(new Error('aborted'), { name: 'AbortError' })
          ),
        'timeout',
      ],
    ];
    for (const [respond, kind] of nonRetryable) {
      let calls = 0;
      await expectSonarError(
        run(async () => {
          calls += 1;
          return respond();
        }),
        kind
      );
      expect(calls).toBe(1);
    }
    for (const [respond, kind] of retryable) {
      let calls = 0;
      await expectSonarError(
        run(
          async () => {
            calls += 1;
            return respond();
          },
          { maxAttempts: 2 }
        ),
        kind
      );
      expect(calls).toBe(2);
    }
  });

  it('bounds backoff: honors Retry-After and gives up after maxAttempts', async () => {
    const sleeps = [];
    let calls = 0;
    await run(
      async () => {
        calls += 1;
        return calls === 1 ? httpError(429, { 'retry-after': '3' }) : ok({});
      },
      {
        sleep: ms => {
          sleeps.push(ms);
          return noSleep();
        },
      }
    );
    expect(calls).toBe(2);
    expect(sleeps[0]).toBeGreaterThanOrEqual(3000);

    let exhausted = 0;
    await expectSonarError(
      run(async () => {
        exhausted += 1;
        return httpError(503);
      }),
      'server'
    );
    expect(exhausted).toBe(4);
  });
});

describe('collectInventory', () => {
  it('paginates on live paging metadata until exhausted (>1,500)', async () => {
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

    const big = await collect({ openTotal: 1600 }).promise;
    expect(big.status).toBe('COMPLETE');
    expect(big.issues).toHaveLength(1600);
    expect(big.inventory.counts.open.fetched).toBe(1600);
  });

  it('handles boundary conditions: empty project, stale revision, no token', async () => {
    const empty = await collect({ openTotal: 0 }).promise;
    expect(empty.status).toBe('COMPLETE');
    expect(empty.issues).toHaveLength(0);
    expect(empty.inventory.counts.open.apiTotal).toBe(0);
    expect(empty.inventory.incompleteness).toHaveLength(0);

    const stale = await collect({ revision: 'other-sha' }).promise;
    expect(stale.status).toBe('COMPLETE');
    expect(stale.inventory.staleness).toMatchObject({
      analysisRevision: 'other-sha',
      observedSha: 'abc123',
      stale: true,
    });

    await expectSonarError(collectInventory({ token: '' }), 'credentials');
  });

  it('pins the branch and binds the inventory to analysis + observed sha', async () => {
    const { promise, calls } = collect({ openTotal: 2, revision: 'abc123' });
    const { inventory } = await promise;
    for (const call of calls.filter(c => c.includes('/api/issues/search'))) {
      expect(new URL(call).searchParams.get('branch')).toBe('main');
    }
    expect(inventory.projectKey).toBe('JovieInc_Jovie');
    expect(inventory.branch).toBe('main');
    expect(inventory.schema).toBe('jovie-sonar-inventory/v1');
    expect(inventory.analysis).toEqual({
      key: 'A1',
      date: '2026-09-20T00:00:00+0000',
      revision: 'abc123',
    });
    expect(inventory.observedSha).toBe('abc123');
    expect(inventory.staleness.stale).toBe(false);
  });

  it('flags a stale analysis revision relative to the observed sha', async () => {
    const result = await collect(
      { openTotal: 1, revision: 'old-revision' },
      { env: { GITHUB_SHA: 'new-sha' } }
    ).promise;
    expect(result.inventory.staleness.stale).toBe(true);
    expect(
      result.inventory.warnings.some(w => w.includes('lags observed commit'))
    ).toBe(true);
  });

  it('partitions capped queries on createdAt months, then rules', async () => {
    const monthRun = collect({
      open: byParam(
        'createdAfter',
        {
          '2026-08-01': paged(6000, i => makeIssue(`aug-${i}`)),
          '2026-09-01': paged(6000, i => makeIssue(`sep-${i}`)),
        },
        paged(12000)
      ),
      facets: facet =>
        facetResp(
          facet,
          [
            ['2026-08', 6000],
            ['2026-09', 6000],
          ],
          12000
        ),
    });
    const monthly = await monthRun.promise;
    expect(monthly.status).toBe('COMPLETE');
    expect(monthly.issues).toHaveLength(12000);
    expect(
      monthRun.calls.some(
        c =>
          c.includes('createdAfter=2026-08-01') &&
          c.includes('createdBefore=2026-08-31')
      )
    ).toBe(true);

    const ruleRun = collect({
      open: byParam(
        'rules',
        {
          'typescript:S1': paged(6000, i => makeIssue(`r1-${i}`)),
          'typescript:S2': paged(5000, i => makeIssue(`r2-${i}`)),
        },
        paged(11000)
      ),
      facets: facet =>
        facet === 'createdAt'
          ? facetResp(facet, [['2026-09', 11000]], 11000)
          : facetResp(
              facet,
              [
                ['typescript:S1', 6000],
                ['typescript:S2', 5000],
              ],
              11000
            ),
    });
    const rules = await ruleRun.promise;
    expect(rules.status).toBe('COMPLETE');
    expect(rules.issues).toHaveLength(11000);
    expect(ruleRun.calls.some(c => c.includes('rules=typescript%3AS1'))).toBe(
      true
    );
  });

  it('reports INCOMPLETE when partitions cannot recover all records', async () => {
    // A partition still over the cap after month+rule scoping is flagged.
    const capped = await collect({
      open: paged(11000),
      facets: facet =>
        facet === 'createdAt'
          ? facetResp(facet, [['2026-09', 11000]], 11000)
          : facetResp(facet, [['typescript:S1', 11000]], 11000),
    }).promise;
    expect(capped.status).toBe('INCOMPLETE');
    expect(capped.issues).toHaveLength(10000);
    expect(
      capped.inventory.incompleteness.some(
        entry => entry.reason === 'result_cap_exceeded'
      )
    ).toBe(true);

    // An empty page before the API total is also a shortfall.
    let firstPage = true;
    const short = await collect({
      open: url => {
        if (url.searchParams.get('createdAfter') === '2026-09-01') {
          return paged(150, i => makeIssue(`x-${i}`))(url);
        }
        if (firstPage) {
          firstPage = false;
          return paged(1500)(url);
        }
        return pageOf(1500, 2, PAGE_SIZE, []);
      },
      facets: () => facetResp('createdAt', [['2026-09', 1500]], 1500),
    }).promise;
    expect(short.status).toBe('INCOMPLETE');
    expect(
      short.inventory.incompleteness.some(
        entry => entry.reason === 'fetched_unique_below_api_total'
      )
    ).toBe(true);
  });

  it('fails closed on a mid-collection page error or a wrong branch', async () => {
    await expectSonarError(
      collect({
        open: url =>
          Number(url.searchParams.get('p') ?? 1) === 1
            ? paged(1158)(url)
            : httpError(500),
      }).promise,
      'server'
    );
    const wrongBranch = await expectSonarError(
      collect({ componentStatus: 404 }).promise,
      'not_found'
    );
    expect(wrongBranch.message).toContain(
      'refusing to collect an unbound inventory'
    );
  });

  it('dedupes by stable key, warns on keyless records, reconciles totals', async () => {
    const { promise } = collect({
      // total 3: K0 twice (overlapping pages) plus one keyless record.
      open: url => {
        const page = Number(url.searchParams.get('p') ?? 1);
        const issues =
          page === 1
            ? [makeIssue(0), { ...makeIssue(1), key: undefined }]
            : [makeIssue(0)];
        return pageOf(3, page, PAGE_SIZE, issues);
      },
    });
    const result = await promise;
    expect(result.status).toBe('INCOMPLETE'); // 2 unique < reported 3
    expect(result.issues).toHaveLength(2);
    expect(result.inventory.counts.open.duplicatesDropped).toBe(1);
    expect(
      result.inventory.warnings.some(w =>
        w.includes('without a stable issue key')
      )
    ).toBe(true);
  });

  it('retries once on analysis drift, then marks non-atomic on a second drift', async () => {
    const once = await collect({ openTotal: 5, analyses: ['A1', 'A2'] })
      .promise;
    expect(once.atomic).toBe(true);
    expect(once.inventory.analysis.key).toBe('A2');

    const twice = await collect({
      openTotal: 5,
      analyses: ['A1', 'A2', 'A3', 'A4'],
    }).promise;
    expect(twice.atomic).toBe(false);
    expect(
      twice.inventory.warnings.some(w => w.includes('analysis changed twice'))
    ).toBe(true);
  });

  it('degrades unsupported metrics and warns when measures diverge', async () => {
    const unsupported = await collect({
      openTotal: 3,
      measures: () => httpError(400),
    }).promise;
    expect(unsupported.status).toBe('COMPLETE');
    expect(unsupported.inventory.reconciliation.measures.status).toBe(
      'unsupported'
    );

    const diverging = await collect({
      open: paged(4, index => makeIssue(index, { type: 'BUG' })),
      measureMetrics: { bugs: 99 },
    }).promise;
    expect(diverging.inventory.reconciliation.measures.status).toBe('ok');
    expect(
      diverging.inventory.warnings.some(w => w.includes('measures diverge'))
    ).toBe(true);
  });
});

describe('main', () => {
  const runFixture = async (env, fetchImpl) => {
    const root = fixtureRoot();
    const exits = [];
    const logger = captureLogger();
    await main(env, {
      exit: code => exits.push(code),
      cwd: root,
      fetchImpl,
      sleep: noSleep,
      logger,
    });
    return { root, exits, logger };
  };
  const issuesDirOf = root => join(root, 'apps/web/.issues');

  it('exits 1 without a SONAR_TOKEN and writes nothing', async () => {
    const root = fixtureRoot();
    const exits = [];
    try {
      await main(
        {},
        {
          exit: code => exits.push(code),
          cwd: root,
          logger: captureLogger(),
        }
      );
      expect(exits).toEqual([1]);
      expect(existsSync(issuesDirOf(root))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('writes artifacts and exits by evidence quality (0 / 2)', async () => {
    const { fetchImpl } = world({ openTotal: 3, hotspotsTotal: 1 });
    const { root, exits, logger } = await runFixture(
      { SONAR_TOKEN: TOKEN, SONAR_BASE_URL: BASE },
      fetchImpl
    );
    try {
      expect(exits).toEqual([0]);
      const issuesPath = join(issuesDirOf(root), 'sonar-issues-latest.json');
      const inventoryText = readFileSync(
        join(issuesDirOf(root), 'sonar-issues-inventory.json'),
        'utf8'
      );
      expect(JSON.parse(readFileSync(issuesPath, 'utf8'))).toHaveLength(3);
      expect(JSON.parse(inventoryText)).toMatchObject({
        status: 'COMPLETE',
        atomic: true,
      });
      // The token must never appear in logs or written artifacts.
      for (const line of logger.lines) {
        expect(line.includes(TOKEN)).toBe(false);
      }
      expect(inventoryText.includes(TOKEN)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }

    const { fetchImpl: capped } = world({
      open: paged(11000),
      facets: facet =>
        facetResp(
          facet,
          [[facet === 'createdAt' ? '2026-09' : 'r1', 11000]],
          11000
        ),
    });
    const flagged = await runFixture(
      { SONAR_TOKEN: TOKEN, SONAR_BASE_URL: BASE },
      capped
    );
    try {
      expect(flagged.exits).toEqual([2]);
      const inventory = JSON.parse(
        readFileSync(
          join(issuesDirOf(flagged.root), 'sonar-issues-inventory.json'),
          'utf8'
        )
      );
      expect(inventory.status).toBe('INCOMPLETE');
      expect(inventory.incompleteness.length).toBeGreaterThan(0);
    } finally {
      rmSync(flagged.root, { recursive: true, force: true });
    }
  });

  it('exits 1 and leaves last-known evidence untouched on hard failure', async () => {
    const root = fixtureRoot();
    const issuesDir = issuesDirOf(root);
    mkdirSync(issuesDir);
    const sentinel = join(issuesDir, 'sonar-issues-latest.json');
    writeFileSync(sentinel, '[{"key":"last-known"}]');
    const exits = [];
    try {
      await main(
        { SONAR_TOKEN: TOKEN, SONAR_BASE_URL: BASE },
        {
          exit: code => exits.push(code),
          cwd: root,
          fetchImpl: async () => httpError(500),
          sleep: noSleep,
          logger: captureLogger(),
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
