import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  admitDynamicRoutes,
  cacheabilityLoss,
  classifyRoutes,
  formatEntry,
  HTML_GROWS_BY_DESIGN,
  HTML_GROWTH_FLOOR_BYTES,
  htmlAllowance,
  isDynamicAllowed,
  parseEntry,
  planDynamicAdmissions,
  SNAPSHOT_SCHEMA,
  validateSnapshotShape,
} from './route-render-modes.mjs';
import {
  judge,
  manifests,
  page,
  SNAPSHOT_ROUTES,
  snapshot,
} from './route-render-modes-fixtures';

describe('committed render-mode baseline', () => {
  it('records the existing dynamic publication-gate miss destination', () => {
    const committed = JSON.parse(
      readFileSync(join(__dirname, 'route-render-modes.json'), 'utf8')
    );
    const route = '/[username]/profile-miss';
    const baseline = snapshot({ ...SNAPSHOT_ROUTES });
    if (committed.routes[route])
      baseline.routes[route] = committed.routes[route];

    const result = judge(
      build => {
        build.appPathRoutes[`${route}/page`] = route;
      },
      baseline,
      null
    );

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe('render-mode classification', () => {
  it('classifies pages and prerendered handlers from build manifests only', () => {
    const build = classifyRoutes(manifests());
    expect(
      Object.fromEntries(
        Object.entries(build.routes).map(([route, entry]) => [
          route,
          formatEntry(entry),
        ])
      )
    ).toEqual(SNAPSHOT_ROUTES);
    // Concrete paths of a parameterised route, internals, intercepted
    // modals and never-prerendered handlers are not routes to ratchet.
    for (const route of [
      '/blog/a-post',
      '/_not-found',
      '/(.)signin',
      '/api/health',
    ])
      expect(build.routes[route]).toBeUndefined();
    expect(build.existing.has('/api/health')).toBe(true);
  });

  it('round-trips entries and rejects malformed ones', () => {
    for (const value of Object.values(SNAPSHOT_ROUTES))
      expect(formatEntry(parseEntry(value)!)).toBe(value);
    for (const value of [
      'ssr',
      'isr',
      'isr:0',
      'static html=0',
      'dynamic html=10',
      'static  html=10',
      12,
      null,
    ])
      expect(parseEntry(value)).toBeNull();
    expect(
      validateSnapshotShape({ schema: SNAPSHOT_SCHEMA, routes: { '/': 'ssr' } })
    ).toHaveLength(1);
    expect(validateSnapshotShape({ schema: 'x', routes: {} })).toHaveLength(1);
    expect(isDynamicAllowed('/app')).toBe(true);
    expect(isDynamicAllowed('/api/health')).toBe(true);
    expect(isDynamicAllowed('/apple')).toBe(false);
  });

  it('orders static above isr above dynamic, and longer windows above shorter', () => {
    const loss = (prev: string, next: string) =>
      cacheabilityLoss(parseEntry(prev)!, parseEntry(next)!);
    expect(loss('static', 'isr:3600')).toBe('render mode static -> isr:3600');
    expect(loss('static', 'dynamic')).toBe('render mode static -> dynamic');
    expect(loss('isr:300', 'dynamic')).toBe('render mode isr:300 -> dynamic');
    expect(loss('param-prerender', 'dynamic')).toBe(
      'render mode param-prerender -> dynamic'
    );
    expect(loss('isr:3600', 'isr:300')).toBe(
      'revalidate window 3600 s -> 300 s'
    );
    for (const [prev, next] of [
      ['dynamic', 'static'],
      ['isr:300', 'static'],
      ['isr:300', 'isr:3600'],
      ['static', 'static'],
      // No prerendered path means the build states no window to compare.
      ['param-prerender:600', 'param-prerender'],
      ['param-prerender', 'param-prerender:600'],
    ])
      expect(loss(prev!, next!), `${prev} -> ${next}`).toBeNull();
  });
});

describe('render-mode ratchet', () => {
  it('passes a build that matches its snapshot', () => {
    const result = judge(() => {});
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('fails static -> ISR, naming the route, both modes and the legitimate way out', () => {
    const result = judge(build => {
      build.prerenderManifest.routes['/pricing']!.initialRevalidateSeconds =
        3600;
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain(
      '/pricing lost cacheability: render mode static -> isr:3600.'
    );
    expect(result.errors[0]).toContain('overrides["/pricing"]');
    expect(result.errors[0]).toContain('--write never records a loss');
  });

  it('fails ISR -> dynamic and static -> dynamic', () => {
    const result = judge(build => {
      delete build.prerenderManifest.routes['/playlists'];
      delete build.prerenderManifest.routes['/'];
    });
    expect(result.regressions.map(item => [item.route, item.loss])).toEqual([
      ['/', 'render mode static -> dynamic'],
      ['/playlists', 'render mode isr:300 -> dynamic'],
    ]);
    expect(result.ok).toBe(false);
  });

  it('fails a parameterised route that stops prerendering, and a shorter window', () => {
    const dynamicProfile = judge(build => {
      delete build.prerenderManifest.dynamicRoutes['/[username]'];
    });
    expect(dynamicProfile.errors[0]).toContain(
      '/[username] lost cacheability: render mode param-prerender -> dynamic'
    );
    const shorter = judge(build => {
      build.prerenderManifest.routes['/blog/b-post']!.initialRevalidateSeconds =
        60;
    });
    expect(shorter.errors[0]).toContain(
      '/blog/[slug] lost cacheability: revalidate window 600 s -> 60 s'
    );
  });

  it('fails a prerendered handler that starts running per request', () => {
    const result = judge(build => {
      delete build.prerenderManifest.routes['/robots.txt'];
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain(
      '/robots.txt lost cacheability: render mode static -> dynamic'
    );
  });

  it('allows HTML growth inside the allowance and fails past it', () => {
    expect(htmlAllowance(200_000)).toBe(210_000);
    expect(htmlAllowance(10_000)).toBe(10_000 + HTML_GROWTH_FLOOR_BYTES);
    const inside = judge(build => {
      build.prerenderManifest.routes['/']!.htmlSize = 210_000;
    });
    expect(inside.ok).toBe(true);
    const over = judge(build => {
      build.prerenderManifest.routes['/']!.htmlSize = 210_001;
    });
    expect(over.ok).toBe(false);
    expect(over.errors).toEqual([
      expect.stringContaining(
        '/ prerendered HTML grew 200000 -> 210001 bytes (allowed 210000: +5% or +4096 B).'
      ),
    ]);
    expect(over.errors[0]).toContain('overrides["/"]');
  });

  it('ratchets the mode but not the bytes of a content index', () => {
    const input = manifests();
    input.appPathRoutes['/(marketing)/changelog/page'] = '/changelog';
    input.prerenderManifest.routes['/changelog'] = {
      ...page(140_000),
      srcRoute: '/changelog',
    };
    expect(HTML_GROWS_BY_DESIGN).toContain('/changelog');
    expect(formatEntry(classifyRoutes(input).routes['/changelog']!)).toBe(
      'static'
    );
  });

  it('fails an entry stripped of its html size', () => {
    const result = judge(
      () => {},
      snapshot({ ...SNAPSHOT_ROUTES, '/pricing': 'static' })
    );
    expect(result.errors).toEqual([
      expect.stringContaining('/pricing has no `html=` size'),
    ]);
  });

  it('fails closed on a route with no entry, and on an entry with no route', () => {
    const added = judge(build => {
      build.appPathRoutes['/(marketing)/about/page'] = '/about';
      build.prerenderManifest.routes['/about'] = {
        ...page(30_000),
        srcRoute: '/about',
      };
    });
    expect(added.ok).toBe(false);
    expect(added.errors).toEqual([
      expect.stringContaining(
        '/about (static html=30000) has no entry in apps/web/scripts/route-render-modes.json (new routes fail closed). Add "/about": "static html=30000", or run `node apps/web/scripts/route-render-modes.mjs --next-dir apps/web/.next --write`'
      ),
    ]);

    const removed = judge(build => {
      delete build.appPathRoutes['/start/page'];
    });
    expect(removed.ok).toBe(false);
    expect(removed.errors[0]).toContain(
      '/start (dynamic) is in apps/web/scripts/route-render-modes.json but not in the build'
    );
  });

  it('passes a route that got cheaper and reports it for --write', () => {
    const result = judge(build => {
      build.prerenderManifest.routes['/start'] = {
        ...page(50_000),
        srcRoute: '/start',
      };
      build.prerenderManifest.routes['/playlists']!.initialRevalidateSeconds =
        3600;
      build.prerenderManifest.routes['/']!.htmlSize = 150_000;
    });
    expect(result.ok).toBe(true);
    expect(result.improvements.map(item => item.route)).toEqual([
      '/',
      '/playlists',
      '/start',
    ]);
    expect(result.notices[0]).toContain('3 route(s) are cheaper than recorded');
  });
});

const ROOM_MISS =
  '/app/admin/room (dynamic) has no entry in apps/web/scripts/route-render-modes.json (new routes fail closed). Add "/app/admin/room": "dynamic", or run `node apps/web/scripts/route-render-modes.mjs --next-dir apps/web/.next --write` on the CI mock-env build, and commit it.';

describe('dynamic render-mode admission', () => {
  it('admits only the dynamic route a CI log already named', () => {
    const log = [
      `2026-11-14T07:21:01.1705375Z ##[error]${ROOM_MISS}`,
      'Exact-head Coverage\tRender modes\t2026-11-14T07:21:01.1741144Z ##[error]Process completed with exit code 1.',
    ].join('\n');
    const plan = planDynamicAdmissions(log);
    expect(plan.ok).toBe(true);
    expect(plan.admissions).toEqual([
      { route: '/app/admin/room', entry: 'dynamic' },
    ]);
    const before = snapshot({
      '/app/admin/releases': 'dynamic',
      '/app/admin/screenshots': 'dynamic',
    });
    const result = admitDynamicRoutes(before, plan.admissions);
    expect(result.refused).toEqual([]);
    expect(result.changes).toEqual([
      {
        kind: 'added',
        route: '/app/admin/room',
        from: null,
        to: 'dynamic',
      },
    ]);
    expect(Object.keys(result.snapshot.routes ?? {})).toEqual([
      '/app/admin/releases',
      '/app/admin/room',
      '/app/admin/screenshots',
    ]);
    expect(before.routes['/app/admin/room']).toBeUndefined();
  });

  it('refuses a route outside the dynamic prefixes and an existing key', () => {
    const outside = admitDynamicRoutes(snapshot({}), [
      { route: '/about', entry: 'dynamic' },
    ]);
    expect(outside.refused).toEqual(['/about']);
    expect(outside.changes).toEqual([]);
    expect(outside.snapshot.routes?.['/about']).toBeUndefined();

    const current = snapshot({ '/app/admin/room': 'dynamic' });
    const existing = admitDynamicRoutes(current, [
      { route: '/app/admin/room', entry: 'dynamic' },
    ]);
    expect(existing.refused).toEqual(['/app/admin/room']);
    expect(existing.snapshot).toBe(current);
  });

  it('refuses a log that also names another error or a non-dynamic miss', () => {
    expect(
      planDynamicAdmissions(`::error::${ROOM_MISS}\n::error::cacheability lost`)
        .ok
    ).toBe(false);
    const staticMiss =
      '/about (static html=30000) has no entry in apps/web/scripts/route-render-modes.json (new routes fail closed). Add "/about": "static html=30000"';
    expect(planDynamicAdmissions(`##[error]${staticMiss}`).ok).toBe(false);
    expect(planDynamicAdmissions('').reason).toBe('no dynamic route admitted');
  });
});
