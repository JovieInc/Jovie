import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupRoots,
  judge,
  manifests,
  NOW,
  override,
  page,
  roots,
  SNAPSHOT_ROUTES,
  snapshot,
} from './fixtures/route-render-modes-fixtures';
import {
  classifyRoutes,
  evaluateRenderModes,
  SNAPSHOT_SCHEMA,
  tightenSnapshot,
  weakenedEntries,
} from './route-render-modes.mjs';

afterEach(cleanupRoots);

describe('render-mode snapshot writes and overrides', () => {
  it('--write tightens improvements, adds and removes routes, and keeps a loss', () => {
    const input = manifests();
    // Cheaper: /start becomes static, /playlists gets a longer window,
    // the homepage sheds HTML.
    input.prerenderManifest.routes['/start'] = {
      ...page(50_000),
      srcRoute: '/start',
    };
    input.prerenderManifest.routes['/playlists']!.initialRevalidateSeconds =
      3600;
    input.prerenderManifest.routes['/']!.htmlSize = 150_000;
    // A loss, and HTML growth: neither may be written.
    input.prerenderManifest.routes['/pricing']!.initialRevalidateSeconds = 60;
    input.prerenderManifest.routes['/pricing']!.htmlSize = 99_000;
    // New and removed routes.
    input.appPathRoutes['/app/(shell)/new/page'] = '/app/new';
    delete input.appPathRoutes['/app/(shell)/chat/page'];
    // A handler that left the prerender manifest but still exists.
    delete input.prerenderManifest.routes['/robots.txt'];

    const build = classifyRoutes(input);
    const before = snapshot();
    const {
      snapshot: next,
      changes,
      refused,
    } = tightenSnapshot({
      build,
      snapshot: before,
      now: NOW,
    });
    expect(refused).toEqual([]);
    expect(next.routes).toEqual({
      '/': 'static html=150000',
      '/[username]': 'param-prerender',
      '/app/new': 'dynamic',
      '/blog/[slug]': 'param-prerender:600',
      '/playlists': 'isr:3600 html=40000',
      '/pricing': 'static html=80000',
      '/robots.txt': 'static',
      '/start': 'static html=50000',
    });
    expect(changes.map(change => `${change.kind} ${change.route}`)).toEqual([
      'tightened /',
      'added /app/new',
      'tightened /playlists',
      'tightened /start',
      'removed /app/chat',
    ]);
    // Nothing --write produced is weaker than what it started from.
    expect(weakenedEntries(next, before, NOW)).toEqual([]);
    // The losses still fail against the written snapshot.
    const result = evaluateRenderModes({
      build,
      snapshot: next,
      ancestor: before,
      now: NOW,
    });
    expect(result.regressions.map(item => item.route).sort()).toEqual([
      '/pricing',
      '/robots.txt',
    ]);
    expect(result.htmlGrowth.map(item => item.route)).toEqual(['/pricing']);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('refuses a new dynamic page outside the dynamic trees unless overridden or --init', () => {
    const input = manifests();
    input.appPathRoutes['/(marketing)/about/page'] = '/about';
    const build = classifyRoutes(input);

    const refused = tightenSnapshot({ build, snapshot: snapshot(), now: NOW });
    expect(refused.refused).toEqual(['/about']);
    expect(refused.snapshot.routes['/about']).toBeUndefined();
    const red = evaluateRenderModes({
      build,
      snapshot: refused.snapshot,
      ancestor: snapshot(),
      now: NOW,
    });
    expect(red.ok).toBe(false);
    expect(red.errors[0]).toContain(
      '/about is a new route that renders on every request (dynamic) outside /app, /api, /billing, /auth, /hud. Make it static or ISR.'
    );

    const withOverride = snapshot();
    withOverride.overrides['/about'] = override();
    const allowed = tightenSnapshot({
      build,
      snapshot: withOverride,
      now: NOW,
    });
    expect(allowed.snapshot.routes['/about']).toBe('dynamic');
    expect(
      evaluateRenderModes({
        build,
        snapshot: allowed.snapshot,
        ancestor: snapshot(),
        now: NOW,
      }).ok
    ).toBe(true);

    // The first snapshot records the tree as it is.
    const first = tightenSnapshot({
      build,
      snapshot: { schema: SNAPSHOT_SCHEMA, overrides: {}, routes: {} },
      init: true,
      now: NOW,
    });
    expect(first.snapshot.routes['/about']).toBe('dynamic');
  });

  it('rejects a hand-edited loss unless its override is complete and unexpired', () => {
    const ancestor = snapshot();
    const edited = snapshot({
      ...SNAPSHOT_ROUTES,
      '/pricing': 'dynamic',
      '/playlists': 'isr:60 html=40000',
      '/': 'static html=260000',
      '/about': 'dynamic',
      '/app/new': 'dynamic',
    });
    expect(weakenedEntries(edited, ancestor, NOW)).toEqual([
      '/ baseline weakened: html 200000 -> 260000 bytes',
      '/playlists baseline weakened: revalidate window 300 s -> 60 s',
      '/pricing baseline weakened: render mode static -> dynamic',
      '/about is recorded as a new dynamic route outside /app, /api, /billing, /auth, /hud',
    ]);

    edited.overrides = {
      '/': override(),
      '/playlists': override({ owner: '' }),
      '/pricing': override({ expiresOn: '2026-10-21' }),
      '/about': override({ expiresOn: '2026-10-22' }),
    };
    expect(weakenedEntries(edited, ancestor, NOW)).toEqual([
      '/playlists baseline weakened: revalidate window 300 s -> 60 s',
      '/pricing baseline weakened: render mode static -> dynamic',
    ]);
    // Adopting the ratchet: with no snapshot on main there is nothing to weaken.
    expect(weakenedEntries(edited, null, NOW)).toEqual([]);

    // The build agrees with the edit, so only the ancestor check can fail it.
    const result = judge(
      build => {
        delete build.prerenderManifest.routes['/pricing'];
      },
      snapshot({ ...SNAPSHOT_ROUTES, '/pricing': 'dynamic' }),
      ancestor
    );
    expect(result.regressions).toEqual([]);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain(
      '/pricing baseline weakened: render mode static -> dynamic. A loss needs an unexpired overrides entry'
    );
  });
});

describe('route-render-modes CLI', () => {
  /** A .next plus a git repo whose origin/main holds the ancestor snapshot. */
  function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'route-render-modes-'));
    roots.push(root);
    const nextDir = join(root, 'next');
    mkdirSync(nextDir);
    const write = (input: ReturnType<typeof manifests>) => {
      writeFileSync(
        join(nextDir, 'prerender-manifest.json'),
        JSON.stringify(input.prerenderManifest)
      );
      writeFileSync(
        join(nextDir, 'app-path-routes-manifest.json'),
        JSON.stringify(input.appPathRoutes)
      );
    };
    write(manifests());
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key.startsWith('GIT_')) delete env[key];
    }
    const emptyConfig = join(root, 'empty.gitconfig');
    writeFileSync(emptyConfig, '');
    Object.assign(env, {
      GIT_CONFIG_GLOBAL: emptyConfig,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_NO_LAZY_FETCH: '1',
      GIT_AUTHOR_NAME: 'Render fixture',
      GIT_COMMITTER_NAME: 'Render fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    });
    const git = (args: string[]) => {
      const result = spawnSync('git', args, {
        cwd: root,
        env,
        encoding: 'utf8',
        timeout: 10000,
      });
      expect(result.status, result.stderr).toBe(0);
    };
    git(['init', '--initial-branch=main']);
    writeFileSync(join(root, 'README.md'), 'fixture\n');
    git(['add', 'README.md']);
    git(['commit', '-m', 'Fixture base']);
    git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const snapshotPath = join(root, 'apps/web/scripts/route-render-modes.json');
    mkdirSync(join(root, 'apps/web/scripts'), { recursive: true });
    const run = (...flags: string[]) =>
      spawnSync(
        process.execPath,
        [
          join(__dirname, 'route-render-modes.mjs'),
          '--next-dir',
          nextDir,
          '--snapshot',
          snapshotPath,
          ...flags,
        ],
        {
          encoding: 'utf8',
          timeout: 20000,
          env: { ...env, GIT_DIR: join(root, '.git'), GIT_WORK_TREE: root },
        }
      );
    const publish = () => {
      git(['add', 'apps/web/scripts/route-render-modes.json']);
      git(['commit', '-m', 'Fixture snapshot']);
      git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    };
    return { write, run, publish, snapshotPath };
  }

  it('records a first snapshot, passes on it, then fails a downgrade without rewriting it', () => {
    const { write, run, publish, snapshotPath } = fixture();
    const missing = run();
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('has no entry in');

    const init = run('--init');
    expect(init.status, init.stderr).toBe(0);
    expect(JSON.parse(readFileSync(snapshotPath, 'utf8')).routes).toEqual(
      SNAPSHOT_ROUTES
    );
    publish();
    expect(run().status).toBe(0);
    expect(run('--init').status).not.toBe(0);

    const downgraded = manifests();
    delete downgraded.prerenderManifest.routes['/pricing'];
    downgraded.prerenderManifest.routes['/']!.htmlSize = 260_000;
    write(downgraded);
    const red = run('--write');
    expect(red.status).toBe(1);
    expect(red.stderr).toContain(
      '::error::/pricing lost cacheability: render mode static -> dynamic.'
    );
    expect(red.stderr).toContain(
      '::error::/ prerendered HTML grew 200000 -> 260000 bytes'
    );
    expect(JSON.parse(readFileSync(snapshotPath, 'utf8')).routes).toEqual(
      SNAPSHOT_ROUTES
    );

    // A hand edit that matches the build is still judged against origin/main.
    const edited = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    edited.routes['/pricing'] = 'dynamic';
    edited.routes['/'] = 'static html=260000';
    writeFileSync(snapshotPath, JSON.stringify(edited));
    const sneaky = run();
    expect(sneaky.status).toBe(1);
    expect(sneaky.stderr).toContain(
      '/pricing baseline weakened: render mode static -> dynamic'
    );
    expect(sneaky.stderr).toContain(
      '/ baseline weakened: html 200000 -> 260000 bytes'
    );
  });
});
