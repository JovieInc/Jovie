import { randomBytes } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BASELINE_HEADROOM_RATIO,
  checkBudgets,
  checkFirstLoadBudgets,
  checkGroupBudgets,
  evaluateBudgets,
  FORBIDDEN_CLIENT_CODE,
  findForbiddenClientCode,
  gateWeakeningOverrideApplies,
  grownBudgetNumbers,
  grownRouteBudgetNumbers,
  HEADROOM_KB,
  isMarketingRoute,
  loadRouteGroups,
  measureFirstLoadJs,
  measureRouteJs,
  readBudgetAncestor,
  routeFromManifestKey,
  routeGroupFor,
  validateBudgetShape,
} from './route-js-budget.mjs';

const fixtureRoots: string[] = [];

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

/** Incompressible bytes so gzip size tracks the byte count. */
function writeChunk(nextDir: string, name: string, bytes: number) {
  const path = join(nextDir, 'static', 'chunks', name);
  mkdirSync(join(nextDir, 'static', 'chunks'), { recursive: true });
  writeFileSync(path, randomBytes(bytes));
  return `static/chunks/${name}`;
}

function writeManifest(
  nextDir: string,
  segmentDir: string,
  key: string,
  entryJSFiles: Record<string, string[]>
) {
  const dir = join(nextDir, 'server', 'app', 'app', segmentDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'page_client-reference-manifest.js'),
    `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\n` +
      `globalThis.__RSC_MANIFEST[${JSON.stringify(key)}] = ${JSON.stringify({ entryJSFiles })};\n`
  );
}

function buildFixture() {
  const nextDir = mkdtempSync(join(tmpdir(), 'route-js-budget-'));
  fixtureRoots.push(nextDir);
  const main = writeChunk(nextDir, 'main.js', 20 * 1024);
  const shell = writeChunk(nextDir, 'shell.js', 40 * 1024);
  const heavy = writeChunk(nextDir, 'heavy.js', 100 * 1024);
  writeFileSync(
    join(nextDir, 'build-manifest.json'),
    JSON.stringify({ rootMainFiles: [main], polyfillFiles: [] })
  );
  writeManifest(nextDir, '(shell)/settings', '/app/(shell)/settings/page', {
    '[project]/app/layout': [main],
    '[project]/app/app/(shell)/layout': [shell],
    '[project]/app/app/(shell)/settings/page': [shell],
  });
  writeManifest(nextDir, '(shell)/chat', '/app/(shell)/chat/page', {
    '[project]/app/app/(shell)/layout': [shell],
    '[project]/app/app/(shell)/chat/page': [heavy],
  });
  return nextDir;
}

describe('route-js-budget', () => {
  it('normalizes route groups and page suffixes', () => {
    expect(routeFromManifestKey('/app/(shell)/settings/touring/page')).toBe(
      '/app/settings/touring'
    );
    expect(routeFromManifestKey('/app/(shell)/@modal/chat/page')).toBe(
      '/app/chat'
    );
  });

  it('sums root files and unique entry chunks per route', () => {
    const rows = measureRouteJs(buildFixture());
    const byRoute = Object.fromEntries(rows.map(row => [row.route, row]));

    // main + shell counted once each, even when listed by several segments.
    expect(byRoute['/app/settings'].chunks).toBe(2);
    expect(byRoute['/app/settings'].gzipKb).toBeGreaterThanOrEqual(60);
    expect(byRoute['/app/settings'].gzipKb).toBeLessThan(62);
    expect(byRoute['/app/chat'].chunks).toBe(3);
    expect(byRoute['/app/chat'].gzipKb).toBeGreaterThanOrEqual(160);
  });

  it('fails a route over its ceiling and uses the default otherwise', () => {
    const rows = measureRouteJs(buildFixture());
    const result = checkBudgets(rows, {
      defaultMaxGzipKb: 100,
      routes: { '/app/chat': 150, '/app/removed': 500 },
    });

    expect(result.violations.map(row => row.route)).toEqual(['/app/chat']);
    expect(
      result.rows.find(row => row.route === '/app/settings')?.budgetKb
    ).toBe(100);
    expect(result.staleBudgets).toEqual(['/app/removed']);
  });

  it('ships budgets that name only real, stricter-than-default routes', () => {
    const budgets = JSON.parse(
      readFileSync(join(__dirname, 'route-js-budgets.json'), 'utf8')
    ) as ReturnType<typeof firstLoadBudgets>;

    expect(budgets.defaultMaxGzipKb).toBeGreaterThan(0);
    for (const [route, kb] of Object.entries(budgets.routes)) {
      expect(route.startsWith('/app')).toBe(true);
      expect(kb).toBeGreaterThan(budgets.defaultMaxGzipKb);
    }
    expect(validateBudgetShape(budgets)).toEqual([]);
    expect(budgets.firstLoad.marketingMaxGzipKb).toBeLessThan(
      budgets.firstLoad.defaultMaxGzipKb
    );
    expect(budgets.firstLoad.marketingMaxGzipKb).toBeLessThan(
      budgets.defaultMaxGzipKb
    );
    expect(budgets.firstLoad.headroomKb).toBe(HEADROOM_KB);
    expect(budgets.firstLoad.marketingMaxGzipKb).toBe(640);
    expect(budgets.firstLoad.defaultMaxGzipKb).toBe(800);
    expect(budgets.defaultMaxGzipKb).toBe(900);
    expect(budgets.firstLoad.routes['/']).toBe(640);
    expect(budgets.firstLoad.baselines).toEqual(
      Object.fromEntries(
        Object.entries(MEASURED_BASELINES).map(([route, kb]) => [
          route,
          Math.floor(kb * (1 + BASELINE_HEADROOM_RATIO)),
        ])
      )
    );
    expect(grownBudgetNumbers(budgets, budgets)).toEqual([]);
    const ancestor = readBudgetAncestor(join(__dirname, '../..'), {
      fetch: false,
    });
    if (ancestor.ok && ancestor.ancestor) {
      expect(grownBudgetNumbers(budgets, ancestor.ancestor)).toEqual([]);
    }
  });

  it('flags forbidden client code only in the routes that ship it', () => {
    const nextDir = buildFixture();
    expect(findForbiddenClientCode(nextDir)).toEqual([]);

    // A zod bump that stops the locales patch applying puts the translated
    // error tables back into the chat route's chunk.
    writeFileSync(
      join(nextDir, 'static', 'chunks', 'heavy.js'),
      'e.exports={invalid_type:"Ungültige Eingabe"};'
    );
    expect(findForbiddenClientCode(nextDir)).toEqual([
      {
        id: 'zod-locales',
        fix: FORBIDDEN_CLIENT_CODE[0]?.fix,
        file: 'static/chunks/heavy.js',
        routes: ['/app/chat'],
      },
    ]);
  });
});

const MEASURED_BASELINES = {
  '/demo/showcase/[surface]': 1284,
  '/start': 1223,
  '/demo/founder-video': 1157,
  '/exp/shell-v1': 947,
  '/[username]': 883,
  '/[username]/profile-mode-render/[profileMode]/[marker]': 883,
  '/exp/page-builder': 881,
  '/demo/audience': 847,
  '/demo': 815,
  '/': 650,
};

const NOW = new Date('2026-10-22T00:00:00.000Z');

function firstLoadBudgets(groups?: Record<string, { baselineKb: number }>) {
  return {
    defaultMaxGzipKb: 900,
    routes: { '/app/chat': 1385 } as Record<string, number>,
    firstLoad: {
      headroomKb: HEADROOM_KB,
      marketingMaxGzipKb: 32,
      defaultMaxGzipKb: 80,
      marketingRoutes: ['/', '/product', '/solutions/*'],
      routes: { '/': 32, '/product': 32 } as Record<string, number>,
      baselines: {} as Record<string, number>,
    },
    raises: {} as Record<string, ReturnType<typeof validRaise>>,
    groups: (groups ?? {}) as Record<string, { baselineKb: number }>,
  };
}

function validRaise(overrides: Record<string, string> = {}) {
  return {
    owner: '@jovie',
    reason: 'Measured first-load JS exceeded the previous ceiling',
    issue: 'JOV-1001',
    removalCondition: 'Split the route chunk and lower the ceiling',
    evidence: 'apps/web/scripts/route-js-budget.test.ts',
    ...overrides,
  };
}

function judge(
  budgets: ReturnType<typeof firstLoadBudgets>,
  firstRows: ReturnType<typeof measureFirstLoadJs>,
  ancestor: ReturnType<typeof firstLoadBudgets> = budgets
) {
  return evaluateBudgets({
    appRows: [],
    firstRows,
    budgets,
    ancestor,
    now: NOW,
  });
}

function growth(next: object, previous: object) {
  return grownBudgetNumbers(next, previous, NOW).join('\n');
}

function buildFirstLoadFixture() {
  const nextDir = mkdtempSync(join(tmpdir(), 'first-load-js-'));
  fixtureRoots.push(nextDir);
  const main = writeChunk(nextDir, 'main.js', 8 * 1024);
  const home = writeChunk(nextDir, 'home.js', 8 * 1024);
  const product = writeChunk(nextDir, 'product.js', 8 * 1024);
  const about = writeChunk(nextDir, 'about.js', 40 * 1024);
  writeFileSync(
    join(nextDir, 'build-manifest.json'),
    JSON.stringify({ rootMainFiles: [main], polyfillFiles: [] })
  );
  writeFileSync(
    join(nextDir, 'app-build-manifest.json'),
    JSON.stringify({
      pages: {
        '/page': [main, home],
        '/product/page': [main, product],
        '/about/page': [main, about],
        '/solutions/[audience]/page': [main, product],
        '/app/(shell)/chat/page': [main, about],
      },
    })
  );
  return nextDir;
}

describe('first-load JS budgets', () => {
  it('keeps fixed headroom and recorded baselines within two percent of measured sizes', () => {
    expect(HEADROOM_KB).toBe(16);
    expect(BASELINE_HEADROOM_RATIO).toBe(0.02);
    const { firstLoad } = JSON.parse(
      readFileSync(join(__dirname, 'route-js-budgets.json'), 'utf8')
    );
    for (const [route, kb] of Object.entries(MEASURED_BASELINES)) {
      expect(firstLoad.baselines[route]).toBeGreaterThanOrEqual(kb);
      expect(firstLoad.baselines[route]).toBeLessThanOrEqual(
        Math.floor(kb * 1.02)
      );
    }
    expect(isMarketingRoute('/solutions/artists', ['/solutions/*'])).toBe(true);
    expect(isMarketingRoute('/about', ['/', '/product'])).toBe(false);
  });

  it('passes routes under their ceiling and uses the tight marketing budget', () => {
    const rows = measureFirstLoadJs(buildFirstLoadFixture());
    const byRoute = Object.fromEntries(rows.map(row => [row.route, row]));
    expect(byRoute['/']?.chunks).toBe(2);
    expect(byRoute['/app/chat']?.chunks).toBe(2);
    const budgets = firstLoadBudgets();
    const result = checkFirstLoadBudgets(
      rows.filter(row => !row.route.startsWith('/app')),
      budgets.firstLoad
    );
    expect(result.violations).toEqual([]);
    expect(
      Object.fromEntries(result.rows.map(row => [row.route, row.budgetKb]))
    ).toEqual({
      '/': 32,
      '/product': 32,
      '/solutions/[audience]': 32,
      '/about': 80,
    });
    expect(judge(budgets, rows).ok).toBe(true);
  });

  it('fails a marketing route over its ceiling while an unlisted route still fits', () => {
    const nextDir = buildFirstLoadFixture();
    writeChunk(nextDir, 'home.js', 80 * 1024);
    const rows = measureFirstLoadJs(nextDir);
    const result = checkFirstLoadBudgets(
      rows.filter(row => row.route !== '/app/chat'),
      firstLoadBudgets().firstLoad
    );
    expect(result.violations.map(row => row.route)).toEqual(['/']);
    expect(result.rows.find(row => row.route === '/about')?.ok).toBe(true);
  });

  it('measures a marketing route from the client-reference manifest when the app manifest is absent', () => {
    const nextDir = mkdtempSync(join(tmpdir(), 'first-load-fallback-'));
    fixtureRoots.push(nextDir);
    const main = writeChunk(nextDir, 'main.js', 8 * 1024);
    const page = writeChunk(nextDir, 'page.js', 8 * 1024);
    writeFileSync(
      join(nextDir, 'build-manifest.json'),
      JSON.stringify({ rootMainFiles: [main], polyfillFiles: [] })
    );
    const dir = join(nextDir, 'server', 'app', '(marketing)', 'product');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'page_client-reference-manifest.js'),
      `globalThis.__RSC_MANIFEST = {};\n` +
        `globalThis.__RSC_MANIFEST['/(marketing)/product/page'] = ${JSON.stringify(
          { entryJSFiles: { page: [page] } }
        )};\n`
    );
    const rows = measureFirstLoadJs(nextDir);
    expect(rows.map(row => row.route)).toEqual(['/product']);
    expect(rows[0]?.chunks).toBe(2);
  });

  it('deliberate red: a grown budget fails unless the gate-weakening override applies, and an over-budget route still fails', () => {
    const budgets = firstLoadBudgets();
    const rows = measureFirstLoadJs(buildFirstLoadFixture());
    const grown = structuredClone(budgets);
    grown.firstLoad.marketingMaxGzipKb += 8;
    grown.firstLoad.routes['/'] += 8;
    grown.firstLoad.routes['/product'] += 8;
    const red = judge(grown, rows, budgets);
    expect(red.ok).toBe(false);
    expect(red.growth.join('\n')).toMatch(/firstLoad\.marketingMaxGzipKb grew/);
    expect(red.growth.join('\n')).toMatch(/firstLoad\.routes\.\/ grew/);

    grown.raises = {
      'firstLoad.marketingMaxGzipKb': validRaise({ owner: '' }),
      'firstLoad.routes./': validRaise(),
      'firstLoad.routes./product': validRaise(),
    };
    expect(gateWeakeningOverrideApplies(validRaise(), NOW)).toBe(true);
    expect(gateWeakeningOverrideApplies(validRaise({ owner: '' }), NOW)).toBe(
      false
    );
    const incomplete = judge(grown, rows, budgets);
    expect(incomplete.ok).toBe(false);
    expect(incomplete.growth.join('\n')).toMatch(/marketingMaxGzipKb grew/);

    grown.raises['firstLoad.marketingMaxGzipKb'] = validRaise({
      expiresOn: '2020-01-01',
    });
    const expired = judge(grown, rows, budgets);
    expect(expired.growth.join('\n')).toMatch(/marketingMaxGzipKb grew/);

    grown.raises['firstLoad.marketingMaxGzipKb'] = validRaise();
    const overridden = judge(grown, rows, budgets);
    expect(overridden.growth).toEqual([]);
    expect(overridden.ok).toBe(true);

    const overRows = rows.map(row =>
      row.route === '/'
        ? { ...row, gzipKb: grown.firstLoad.routes['/'] + 5 }
        : row
    );
    const stillOver = judge(grown, overRows, budgets);
    expect(stillOver.ok).toBe(false);
    expect(stillOver.first.violations.map(row => row.route)).toEqual(['/']);

    const raisedApp = structuredClone(budgets);
    raisedApp.routes['/app/chat'] += 1;
    expect(growth(raisedApp, budgets)).toMatch(
      /routes\.\/app\/chat grew 1385 -> 1386/
    );
    const extraApp = structuredClone(budgets);
    extraApp.routes['/app/new'] = 901;
    expect(growth(extraApp, budgets)).toMatch(
      /routes\.\/app\/new grew 900 -> 901/
    );
    const extraPublic = structuredClone(budgets);
    extraPublic.firstLoad.routes['/about'] = 90;
    expect(growth(extraPublic, budgets)).toMatch(
      /firstLoad\.routes\.\/about grew 80 -> 90/
    );
    expect(
      grownBudgetNumbers(
        budgets,
        {
          defaultMaxGzipKb: budgets.defaultMaxGzipKb,
          routes: budgets.routes,
        },
        NOW
      )
    ).toEqual([]);
  });

  it('enforces a downward-only ratchet and leaves every other route on its target', () => {
    const budgets = firstLoadBudgets();
    budgets.firstLoad.baselines = { '/about': 90, '/': 40 };
    const rows = measureFirstLoadJs(buildFirstLoadFixture());
    const result = checkFirstLoadBudgets(
      rows.filter(row => row.route !== '/app/chat'),
      budgets.firstLoad
    );
    expect(result.violations).toEqual([]);
    expect(
      Object.fromEntries(result.rows.map(row => [row.route, row]))
    ).toMatchObject({
      '/about': { budgetKb: 90, targetKb: 80 },
      '/': { budgetKb: 40, targetKb: 32 },
      '/product': { budgetKb: 32 },
    });
    expect(judge(budgets, rows).ok).toBe(true);

    const overBaseline = rows.map(row =>
      row.route === '/about' ? { ...row, gzipKb: 91 } : row
    );
    const stillOver = judge(budgets, overBaseline);
    expect(stillOver.ok).toBe(false);
    expect(stillOver.first.violations.map(row => row.route)).toEqual([
      '/about',
    ]);

    const raised = structuredClone(budgets);
    raised.firstLoad.baselines['/about'] = 100;
    expect(growth(raised, budgets)).toMatch(
      /firstLoad\.baselines\.\/about grew 90 -> 100/
    );
    raised.raises = { 'firstLoad.baselines./about': validRaise() };
    expect(grownBudgetNumbers(raised, budgets, NOW)).toEqual([]);
    expect(judge(raised, rows, budgets).ok).toBe(true);

    const added = structuredClone(budgets);
    added.firstLoad.baselines['/extra'] = 200;
    expect(growth(added, budgets)).toMatch(
      /firstLoad\.baselines\.\/extra grew 80 -> 200/
    );

    const lowered = structuredClone(budgets);
    lowered.firstLoad.baselines['/about'] = 85;
    expect(grownBudgetNumbers(lowered, budgets, NOW)).toEqual([]);

    const { baselines: _baselines, ...firstLoadWithoutBaselines } =
      structuredClone(budgets.firstLoad);
    expect(
      grownBudgetNumbers(
        budgets,
        { ...budgets, firstLoad: firstLoadWithoutBaselines },
        NOW
      )
    ).toEqual([]);

    const unmeasured = evaluateBudgets({
      appRows: [],
      firstRows: rows.filter(row => row.route !== '/about'),
      budgets,
      ancestor: budgets,
      now: NOW,
    });
    expect(unmeasured.ok).toBe(false);
    expect(unmeasured.missing).toContain('/about');
  });
});

describe('route-group budgets (JOV-8561)', () => {
  it('attributes routes to admin, dashboard, marketing, and public groups', () => {
    const patterns = ['/', '/product', '/solutions/*'];
    expect(routeGroupFor('/app/admin/chat', patterns)).toBe('admin');
    expect(routeGroupFor('/app/admin', patterns)).toBe('admin');
    expect(routeGroupFor('/app/chat', patterns)).toBe('dashboard');
    expect(routeGroupFor('/app', patterns)).toBe('dashboard');
    expect(routeGroupFor('/', patterns)).toBe('marketing');
    expect(routeGroupFor('/product', patterns)).toBe('marketing');
    expect(routeGroupFor('/solutions/artists', patterns)).toBe('marketing');
    expect(routeGroupFor('/about', patterns)).toBe('public');
    expect(routeGroupFor('/[username]', patterns)).toBe('public');
  });

  it('loads route-budgets.json groups fail-closed', () => {
    const groups = loadRouteGroups(
      join(__dirname, '../../../docs/performance/route-budgets.json')
    );
    expect(Object.keys(groups).sort()).toEqual([
      'admin',
      'dashboard',
      'marketing',
      'public',
    ]);
    for (const definition of Object.values(groups)) {
      expect(definition.budgets.initialJS_gzip_kb).toBeGreaterThan(0);
    }
    expect(() =>
      loadRouteGroups(join(tmpdir(), 'jov-8561-missing.json'))
    ).toThrow(/missing/);
    const malformed = mkdtempSync(join(tmpdir(), 'jov-8561-malformed-'));
    fixtureRoots.push(malformed);
    writeFileSync(join(malformed, 'route-budgets.json'), '{"routes":{}}');
    expect(() =>
      loadRouteGroups(join(malformed, 'route-budgets.json'))
    ).toThrow();
  });

  it('deliberate red: a route over its own group baseline fails even when other groups would pass it', () => {
    // The homepage fixture route fits the per-route marketing ceiling (32)
    // but not a lowered marketing group baseline (10) — while the same KB
    // sits far under the public group baseline. Pre-JOV-8561, no group layer
    // existed, so this scenario passed: marketing could grow all the way to
    // the highest (admin) ceiling unnoticed.
    const budgets = firstLoadBudgets({
      public: { baselineKb: 80 },
      marketing: { baselineKb: 10 },
      dashboard: { baselineKb: 90 },
      admin: { baselineKb: 90 },
    });
    const rows = measureFirstLoadJs(buildFirstLoadFixture());
    const result = checkGroupBudgets({
      appRows: [],
      publicRows: rows.filter(row => !row.route.startsWith('/app')),
      groups: budgets.groups,
      routeGroups: routeGroupsFixture(),
      marketingPatterns: budgets.firstLoad.marketingRoutes,
    });
    expect(result.violations.map(row => [row.route, row.group])).toEqual([
      ['/', 'marketing'],
      ['/product', 'marketing'],
      ['/solutions/[audience]', 'marketing'],
    ]);
    expect(result.rows.find(row => row.group === 'public')?.ok).toBe(true);
    expect(result.rows.find(row => row.group === 'marketing')?.ok).toBe(false);
    const judged = evaluateBudgets({
      appRows: [],
      firstRows: rows,
      budgets,
      ancestor: budgets,
      routeGroups: routeGroupsFixture(),
      routeGroupsAncestor: routeGroupsFixture(),
      now: NOW,
    });
    expect(judged.ok).toBe(false);
    expect(judged.groups?.violations.map(row => row.route)).toEqual([
      '/',
      '/product',
      '/solutions/[audience]',
    ]);
  });

  it('fails closed when route-group budgets are enforced without group baselines', () => {
    const budgets = firstLoadBudgets();
    const rows = measureFirstLoadJs(buildFirstLoadFixture());
    const result = evaluateBudgets({
      appRows: [],
      firstRows: rows,
      budgets,
      ancestor: budgets,
      routeGroups: routeGroupsFixture(),
      routeGroupsAncestor: routeGroupsFixture(),
      now: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.shape.join('\n')).toContain(
      'route-budgets.json group marketing needs a groups.marketing.baselineKb baseline'
    );
  });

  it('requires an override to raise a group baseline, and treats a first commit as establishment', () => {
    const budgets = firstLoadBudgets({ public: { baselineKb: 80 } });
    const { groups: _groups, ...ancestorWithoutGroups } =
      structuredClone(budgets);
    // Establishing the groups ratchet where no groups existed is not growth.
    expect(grownBudgetNumbers(budgets, ancestorWithoutGroups, NOW)).toEqual([]);
    // Raising a committed group baseline without an override is growth.
    const raised = structuredClone(budgets);
    raised.groups.public.baselineKb = 100;
    expect(growth(raised, budgets)).toMatch(
      /groups\.public\.baselineKb grew 80 -> 100/
    );
    raised.raises = { 'groups.public.baselineKb': validRaise() };
    expect(grownBudgetNumbers(raised, budgets, NOW)).toEqual([]);
    // A new group key inside an existing groups section also needs one.
    const extraGroup = structuredClone(budgets);
    extraGroup.groups.marketing = { baselineKb: 900 };
    expect(growth(extraGroup, budgets)).toMatch(
      /groups\.marketing\.baselineKb grew 0 -> 900/
    );
    // Lowering is free.
    const lowered = structuredClone(budgets);
    lowered.groups.public.baselineKb = 40;
    expect(grownBudgetNumbers(lowered, budgets, NOW)).toEqual([]);
  });

  it('requires an override to raise a route-budgets.json group target', () => {
    const routeGroups = routeGroupsFixture();
    const ancestor = routeGroupsFixture();
    expect(grownRouteBudgetNumbers(routeGroups, ancestor, {}, NOW)).toEqual([]);
    const raised = routeGroupsFixture();
    raised.marketing.budgets.initialJS_gzip_kb = 200;
    expect(grownRouteBudgetNumbers(raised, ancestor, {}, NOW)).toContain(
      'routeBudgets.marketing.initialJS_gzip_kb grew 150 -> 200'
    );
    expect(
      grownRouteBudgetNumbers(raised, ancestor, {
        'routeBudgets.marketing.initialJS_gzip_kb': validRaise(),
      })
    ).toEqual([]);
    const expired = routeGroupsFixture();
    expired.marketing.budgets.initialJS_gzip_kb = 200;
    expect(
      grownRouteBudgetNumbers(
        raised,
        ancestor,
        {
          'routeBudgets.marketing.initialJS_gzip_kb': validRaise({
            expiresOn: '2020-01-01',
          }),
        },
        NOW
      )
    ).toContain('routeBudgets.marketing.initialJS_gzip_kb grew 150 -> 200');
    // Lowering is free, and no ancestor means establishment.
    const lowered = routeGroupsFixture();
    lowered.marketing.budgets.initialJS_gzip_kb = 120;
    expect(grownRouteBudgetNumbers(lowered, ancestor, {}, NOW)).toEqual([]);
    expect(grownRouteBudgetNumbers(raised, null, {}, NOW)).toEqual([]);
  });

  it('ships group baselines that cover every route-budgets.json group and dominate their committed operative budgets', () => {
    const budgets = JSON.parse(
      readFileSync(join(__dirname, 'route-js-budgets.json'), 'utf8')
    );
    const groups = loadRouteGroups(
      join(__dirname, '../../../docs/performance/route-budgets.json')
    );
    expect(Object.keys(budgets.groups).sort()).toEqual(
      Object.keys(groups).sort()
    );
    const groupCeiling = (route: string) =>
      budgets.groups[routeGroupFor(route, budgets.firstLoad.marketingRoutes)]
        .baselineKb;
    // /app routes: explicit entries and the default.
    for (const [route, kb] of Object.entries(budgets.routes)) {
      expect(kb).toBeLessThanOrEqual(groupCeiling(route));
    }
    expect(budgets.defaultMaxGzipKb).toBeLessThanOrEqual(
      groupCeiling('/app/chat')
    );
    expect(budgets.defaultMaxGzipKb).toBeLessThanOrEqual(
      groupCeiling('/app/admin')
    );
    // First-load routes: explicit ceilings, baselines, and the defaults.
    for (const [route, kb] of Object.entries(budgets.firstLoad.routes ?? {})) {
      expect(kb).toBeLessThanOrEqual(groupCeiling(route));
    }
    for (const [route, kb] of Object.entries(
      budgets.firstLoad.baselines ?? {}
    )) {
      expect(kb).toBeLessThanOrEqual(groupCeiling(route));
    }
    expect(budgets.firstLoad.marketingMaxGzipKb).toBeLessThanOrEqual(
      groupCeiling('/')
    );
    expect(budgets.firstLoad.defaultMaxGzipKb).toBeLessThanOrEqual(
      groupCeiling('/about')
    );
    // Group targets stay the route-budgets.json numbers.
    for (const [group, definition] of Object.entries(groups)) {
      expect(budgets.groups[group]?.baselineKb).toBeGreaterThan(
        definition.budgets.initialJS_gzip_kb
      );
    }
    // Shape and growth stay clean against the committed pair.
    expect(
      evaluateBudgets({
        appRows: [],
        firstRows: [],
        budgets,
        ancestor: budgets,
        routeGroups: groups,
        routeGroupsAncestor: groups,
        now: NOW,
      }).shape
    ).toEqual([]);
    const ancestor = readBudgetAncestor(join(__dirname, '../..'), {
      fetch: false,
    });
    if (ancestor.ok) {
      expect(grownBudgetNumbers(budgets, ancestor.ancestor, NOW)).toEqual([]);
    }
  });
});

function routeGroupsFixture() {
  return {
    public: { budgets: { initialJS_gzip_kb: 180 } },
    marketing: { budgets: { initialJS_gzip_kb: 150 } },
    dashboard: { budgets: { initialJS_gzip_kb: 250 } },
    admin: { budgets: { initialJS_gzip_kb: 300 } },
  };
}
