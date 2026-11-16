import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { main } from './pen-bindings.mjs';
import {
  bindingsToStillFrames,
  globToRegExp,
  loadBindings,
  REPO_ROOT,
  routeSlug,
  routeState,
  routesForFiles,
  sha256File,
  stillPathFor,
  validateBindings,
} from './pen-bindings-lib.mjs';

const HEX = 'a'.repeat(64);
const frame = (route, vp, section, sha = HEX) => ({
  section,
  penFile: 'x.pen',
  nodeId: 'N1',
  still: stillPathFor(route, vp, section),
  sha256: sha,
});
const approved = {
  by: 'tim',
  at: '2026-11-07T00:00:00.000Z',
  receipt: 'https://example.test/r/1',
};
const base = () => ({
  schema: 'jovie.pen-binding/v1',
  routes: {
    '/': {
      scope: 'marketing',
      sources: ['apps/web/app/(home)/**'],
      viewports: {},
    },
  },
});

test('the committed manifest validates against the repo and seeds every scope route', () => {
  const doc = loadBindings(REPO_ROOT);
  assert.deepEqual(validateBindings(doc, { root: REPO_ROOT }), []);
  const routes = Object.entries(doc.routes);
  assert.ok(routes.length >= 40);
  assert.ok(
    routes.every(([, r]) => ['bound', 'unbound'].includes(routeState(r)))
  );
  for (const must of [
    '/',
    '/pricing',
    '/onboarding',
    '/onboarding/checkout',
    '/app/dashboard',
    '/[username]',
  ])
    assert.ok(doc.routes[must], `missing ${must}`);
});

test('the old homepage manifest is gone and nothing in the pipeline reads it', () => {
  const run = spawnSync(
    'git',
    [
      'grep',
      '-ln',
      'pen-stills/homepage/manifest',
      '--',
      '.github',
      'scripts/invariants',
      'scripts/design',
      ':!scripts/design/*.test.mjs',
      'docs',
    ],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  assert.equal(run.stdout.trim(), '');
});

test('slugs and still paths', () => {
  assert.equal(routeSlug('/'), 'home');
  assert.equal(routeSlug('/compare/[slug]'), 'compare-slug');
  assert.equal(routeSlug('/app/dashboard'), 'app-dashboard');
  assert.equal(
    stillPathFor('/', '1440', 'hero'),
    'docs/pen-stills/home/1440/hero.png'
  );
});

test('globs treat route-folder brackets and parens literally', () => {
  assert.ok(
    globToRegExp('apps/web/app/[username]/*').test(
      'apps/web/app/[username]/page.tsx'
    )
  );
  assert.ok(
    !globToRegExp('apps/web/app/[username]/*').test(
      'apps/web/app/[username]/a/b.tsx'
    )
  );
  assert.ok(
    globToRegExp('apps/web/app/(home)/**').test('apps/web/app/(home)/a/b/c.tsx')
  );
  assert.ok(globToRegExp('a/**/b.ts').test('a/b.ts'));
  assert.ok(!globToRegExp('a/*.ts').test('a/bxts'));
});

test('routesForFiles maps changed files to routes and reports their state', () => {
  const doc = loadBindings(REPO_ROOT);
  const hits = routesForFiles(doc, [
    'apps/web/app/(home)/page.tsx',
    'README.md',
  ]);
  assert.deepEqual(
    hits.map(h => h.route),
    ['/']
  );
});

test('validator rejects each structural defect', () => {
  /** @type {Array<[(d: any) => void, RegExp]>} */
  const cases = [
    [
      d => {
        d.schema = 'x';
      },
      /schema must be/,
    ],
    [
      d => {
        d.routes['/'].scope = 'misc';
      },
      /scope must be/,
    ],
    [
      d => {
        d.routes['/'].sources = [];
      },
      /sources must be/,
    ],
    [
      d => {
        d.routes['/'].approved = { by: 'tim' };
      },
      /approved needs/,
    ],
    [
      d => {
        d.routes['/'].approved = approved;
      },
      /approved route has no stills/,
    ],
    [
      d => {
        d.routes['/'].viewports = { 800: [] };
      },
      /must be 1440 or 390/,
    ],
    [
      d => {
        d.routes['/'].approved = approved;
        d.routes['/'].viewports = { 1440: [frame('/', '1440', 'hero')] };
      },
      /needs this viewport/,
    ],
    [
      d => {
        d.routes['/'].approved = approved;
        d.routes['/'].viewports = {
          1440: [frame('/', '1440', 'Hero')],
          390: [frame('/', '390', 'hero')],
        };
      },
      /kebab-case/,
    ],
    [
      d => {
        d.routes['/'].approved = approved;
        d.routes['/'].viewports = {
          1440: [frame('/', '1440', 'hero'), frame('/', '1440', 'hero')],
          390: [frame('/', '390', 'hero')],
        };
      },
      /duplicate section/,
    ],
    [
      d => {
        d.routes['/'].approved = approved;
        d.routes['/'].viewports = {
          1440: [
            {
              ...frame('/', '1440', 'hero'),
              still: 'docs/pen-stills/other/hero.png',
            },
          ],
          390: [frame('/', '390', 'hero')],
        };
      },
      /still must be/,
    ],
    [
      d => {
        d.routes['/'].approved = approved;
        d.routes['/'].viewports = {
          1440: [frame('/', '1440', 'hero', 'zz')],
          390: [frame('/', '390', 'hero')],
        };
      },
      /sha256 must be/,
    ],
    [
      d => {
        d.routes['/a/[b]'] = structuredClone(d.routes['/']);
        d.routes['/a-b'] = structuredClone(d.routes['/']);
      },
      /collides/,
    ],
    [
      d => {
        d.routes.nope = structuredClone(d.routes['/']);
      },
      /must start with/,
    ],
  ];
  for (const [mutate, expected] of cases) {
    const doc = base();
    mutate(doc);
    assert.match(validateBindings(doc).join('\n'), expected);
  }
  assert.deepEqual(validateBindings(base()), []);
});

test('filesystem checks: dead source globs, missing stills and hash drift', () => {
  const root = mkdtempSync(join(tmpdir(), 'pen-bind-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  mkdirSync(join(root, 'apps/web/app/(home)'), { recursive: true });
  writeFileSync(join(root, 'apps/web/app/(home)/page.tsx'), 'x');
  const png = join(root, 'docs/pen-stills/home/1440/hero.png');
  mkdirSync(dirname(png), { recursive: true });
  writeFileSync(png, 'pixels');
  execFileSync('git', ['add', '-A'], { cwd: root });
  const doc = base();
  assert.deepEqual(validateBindings(doc, { root }), []);
  doc.routes['/'].sources.push('apps/web/app/gone/**');
  assert.match(validateBindings(doc, { root }).join('\n'), /matches no file/);
  doc.routes['/'].sources.pop();
  doc.routes['/'].approved = approved;
  doc.routes['/'].viewports = {
    1440: [frame('/', '1440', 'hero', sha256File(png))],
    390: [frame('/', '390', 'hero')],
  };
  const errs = validateBindings(doc, { root }).join('\n');
  assert.match(errs, /390\[hero\]: still file is missing/);
  doc.routes['/'].viewports[1440][0].sha256 = HEX;
  assert.match(
    validateBindings(doc, { root }).join('\n'),
    /does not match the still file/
  );
});

test('exported stills without a receipt are valid but stay unbound', () => {
  const doc = base();
  doc.routes['/'].viewports = {
    1440: [frame('/', '1440', 'hero')],
    390: [frame('/', '390', 'hero')],
  };
  assert.deepEqual(validateBindings(doc), []);
  assert.equal(routeState(doc.routes['/']), 'unbound');
  assert.deepEqual(bindingsToStillFrames(doc), []);
});

test('adapter yields frames only for bound routes', () => {
  const doc = base();
  assert.deepEqual(bindingsToStillFrames(doc), []);
  doc.routes['/'].approved = approved;
  doc.routes['/'].viewports = {
    1440: [frame('/', '1440', 'hero')],
    390: [frame('/', '390', 'hero')],
  };
  const frames = bindingsToStillFrames(doc);
  assert.equal(frames.length, 2);
  assert.deepEqual(
    frames.map(f => f.viewport).sort((a, b) => a - b),
    [390, 1440]
  );
  assert.deepEqual(bindingsToStillFrames(doc, '/pricing'), []);
});

test('CLI validate and status', () => {
  const out = [];
  const err = [];
  assert.equal(
    main(['validate'], { out: m => out.push(m), err: m => err.push(m) }),
    0
  );
  assert.match(out[0], /routes, \d+ bound/);
  assert.equal(main(['status'], { out: m => out.push(m) }), 0);
  assert.ok(out.some(l => /^(UN)?BOUND/.test(l) && l.endsWith(' /')));
  assert.equal(main(['bogus'], { err: () => {} }), 2);
});
