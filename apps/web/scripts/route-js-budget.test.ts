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
  checkBudgets,
  measureRouteJs,
  routeFromManifestKey,
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
    ) as { defaultMaxGzipKb: number; routes: Record<string, number> };

    expect(budgets.defaultMaxGzipKb).toBeGreaterThan(0);
    for (const [route, kb] of Object.entries(budgets.routes)) {
      expect(route.startsWith('/app')).toBe(true);
      expect(Number.isInteger(kb)).toBe(true);
      expect(kb).toBeGreaterThan(budgets.defaultMaxGzipKb);
    }
  });

  it('keeps explicit ceilings on the heavy admin routes re-ratcheted 2026-10-09', () => {
    const budgets = JSON.parse(
      readFileSync(join(__dirname, 'route-js-budgets.json'), 'utf8')
    ) as { defaultMaxGzipKb: number; routes: Record<string, number> };

    // Shared admin/chat-shell chunk growth on main pushed these routes past
    // the default ceiling; each needs an explicit, tighter-than-needed cap.
    const reRatcheted = [
      '/app/admin/people',
      '/app/admin/hud',
      '/app/admin/chat',
      '/app/admin/certifications',
      '/app/admin/platform-connections',
      '/app/admin/operations',
      '/app/admin/growth',
      '/app/chat/[id]',
    ];
    for (const route of reRatcheted) {
      expect(budgets.routes[route], route).toBeGreaterThan(
        budgets.defaultMaxGzipKb
      );
    }
  });
});
