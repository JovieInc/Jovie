import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkGroupBudgets,
  evaluateBudgets,
  grownBudgetNumbers,
  grownRouteBudgetNumbers,
  loadRouteGroups,
  measureFirstLoadJs,
  readBudgetAncestor,
  routeGroupFor,
  validateGroupBudgetShape,
} from './route-js-budget.mjs';
import {
  buildFirstLoadFixture,
  cleanupFixtures,
  firstLoadBudgets,
  fixtureRoots,
  growth,
  NOW,
  validRaise,
} from './route-js-budget-fixtures';

afterEach(cleanupFixtures);

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

  it.each(['admin', 'dashboard', 'marketing', 'public'])(
    'fails closed when the %s route group is removed',
    group => {
      const routes = loadRouteGroups();
      delete routes[group];
      const root = mkdtempSync(join(tmpdir(), 'jov-8561-missing-group-'));
      fixtureRoots.push(root);
      const path = join(root, 'route-budgets.json');
      writeFileSync(path, JSON.stringify({ routes }));
      expect(() => loadRouteGroups(path)).toThrow(
        /missing required route group/
      );
      const groups = Object.fromEntries(
        Object.keys(routes).map(key => [key, { baselineKb: 1000 }])
      );
      expect(validateGroupBudgetShape({ groups }, routes)).toContain(
        `route-budgets.json missing required route group ${group}`
      );
    }
  );

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
    expect(
      evaluateBudgets({
        appRows: [],
        firstRows: rows,
        budgets,
        ancestor: budgets,
        now: NOW,
      }).ok
    ).toBe(true);
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

  it('ships group baselines that cover every route-budgets.json group and equal their worst route baseline', () => {
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
    // Every operative per-route baseline fits its group. The defaults and
    // firstLoad.routes are targets, not operative ceilings (JOV-8555), so a
    // group baseline may sit below them.
    for (const [route, kb] of Object.entries(budgets.routes)) {
      expect(kb, route).toBeLessThanOrEqual(groupCeiling(route));
    }
    for (const [route, kb] of Object.entries(
      budgets.firstLoad.baselines ?? {}
    )) {
      expect(kb, route).toBeLessThanOrEqual(groupCeiling(route));
    }
    // Each group baseline is exactly its worst route baseline.
    const worst: Record<string, number> = {};
    for (const [route, kb] of [
      ...Object.entries<number>(budgets.routes),
      ...Object.entries<number>(budgets.firstLoad.baselines),
    ]) {
      const group = routeGroupFor(route, budgets.firstLoad.marketingRoutes);
      worst[group] = Math.max(worst[group] ?? 0, kb);
    }
    for (const group of Object.keys(groups)) {
      expect(budgets.groups[group].baselineKb, group).toBe(worst[group]);
    }
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
