import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BuildManifest } from '@/scripts/compare-chunks';
import {
  classifyRouteSurface,
  evaluateRouteBudgets,
  loadRouteInitialJsBudgets,
} from '@/scripts/compare-chunks';

function repoRoot(): string {
  // tests/unit/performance -> unit -> tests -> apps/web -> repo root.
  return join(import.meta.dirname, '..', '..', '..', '..', '..');
}

function budgetPath(): string {
  return join(repoRoot(), 'docs/performance/route-budgets.json');
}

describe('route surface classification (JOV-8561)', () => {
  it('maps every declared route-budgets example to its surface', () => {
    // Examples lifted verbatim from docs/performance/route-budgets.json.
    expect(classifyRouteSurface('/[username]')).toBe('public');
    expect(classifyRouteSurface('/[username]/[slug]')).toBe('public');
    expect(classifyRouteSurface('/r/[slug]')).toBe('public');
    expect(classifyRouteSurface('/')).toBe('marketing');
    expect(classifyRouteSurface('/legal/privacy')).toBe('marketing');
    expect(classifyRouteSurface('/playlists/[slug]')).toBe('marketing');
    expect(classifyRouteSurface('/app/dashboard/releases')).toBe('dashboard');
    expect(classifyRouteSurface('/app/dashboard/audience')).toBe('dashboard');
    expect(classifyRouteSurface('/app/admin/users')).toBe('admin');
  });

  it('classifies concrete profile slugs as public and never leaks into admin', () => {
    expect(classifyRouteSurface('/tim')).toBe('public');
    expect(classifyRouteSurface('/app/chat')).toBe('dashboard');
    // Admin precedence must win over the /app dashboard rule.
    expect(classifyRouteSurface('/app/admin')).toBe('admin');
  });
});

describe('route initialJS budget loading (JOV-8561)', () => {
  it('loads the committed per-surface budgets, not a single max ceiling', () => {
    const budgets = loadRouteInitialJsBudgets(budgetPath());
    // Each surface keeps its own declared budget (marketing 150, public 180,
    // dashboard 250, admin 300) — no Math.max collapse.
    expect(budgets.surfaces.marketing).toBe(150);
    expect(budgets.surfaces.public).toBe(180);
    expect(budgets.surfaces.dashboard).toBe(250);
    expect(budgets.surfaces.admin).toBe(300);
  });

  it('fails closed on a missing budget file (no skipped check can pass)', () => {
    expect(() =>
      loadRouteInitialJsBudgets(join(tmpdir(), 'jov-8561-nope', 'nope.json'))
    ).toThrow(/missing/);
  });

  it('fails closed on a malformed budget file', () => {
    const root = mkdtempSync(join(tmpdir(), 'jov-8561-malformed-'));
    const malformed = join(root, 'route-budgets.json');
    writeFileSync(malformed, '{"routes": {"marketing": {"budgets": {}}}}');
    try {
      expect(() => loadRouteInitialJsBudgets(malformed)).toThrow(/malformed/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('per-route initialJS enforcement (JOV-8561)', () => {
  const KB = 1024;

  function manifest(pages: Record<string, string[]>): BuildManifest {
    return { pages, rootMainFiles: [] };
  }

  it('passes a marketing page whose initial JS is within the 150KB budget', () => {
    const budgets = loadRouteInitialJsBudgets(budgetPath());
    const result = evaluateRouteBudgets(
      manifest({ '/': ['static/chunks/small.js'] }),
      budgets,
      path => (path === 'static/chunks/small.js' ? 400 * KB : 0)
    );
    expect(result.violations).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it('fails a marketing page between the marketing and admin ceilings', () => {
    // ~200KB estimated gzip: under the old Math.max(admin)=300KB aggregate
    // ceiling this passed; under the per-route budget it must fail.
    const budgets = loadRouteInitialJsBudgets(budgetPath());
    const result = evaluateRouteBudgets(
      manifest({ '/': ['static/chunks/bloated.js'] }),
      budgets,
      path => (path === 'static/chunks/bloated.js' ? 700 * KB : 0)
    );
    expect(result.passed).toBe(false);
    expect(result.violations.join('\n')).toContain('/');
    expect(result.violations.join('\n')).toContain('marketing');
  });

  it('passes a dashboard page at the same size marketing failed', () => {
    // ~200KB estimated gzip fits the 250KB dashboard budget — proves the
    // budget is per-surface, not one shared ceiling.
    const budgets = loadRouteInitialJsBudgets(budgetPath());
    const result = evaluateRouteBudgets(
      manifest({ '/app/dashboard/releases': ['static/chunks/bloated.js'] }),
      budgets,
      path => (path === 'static/chunks/bloated.js' ? 700 * KB : 0)
    );
    expect(result.violations).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it('charges shared root chunks to every route they ship on', () => {
    const budgets = loadRouteInitialJsBudgets(budgetPath());
    const result = evaluateRouteBudgets(
      manifest({ '/': ['static/chunks/page.js'] }),
      budgets,
      path =>
        path === 'static/chunks/page.js'
          ? 100 * KB
          : path === 'static/chunks/framework.js'
            ? 200 * KB
            : 0
    );
    // Page reports its own bytes + root main files (framework 200KB raw =>
    // 60KB estimated gzip; page 100KB raw => 30KB estimated gzip).
    const row = result.results.find(entry => entry.page === '/');
    expect(row).toBeDefined();
    expect(row?.rawBytes).toBe(300 * KB);
    expect(row?.estimatedGzipBytes).toBe(90 * KB);
  });

  it('fails closed when a classified surface has no declared budget', () => {
    const root = mkdtempSync(join(tmpdir(), 'jov-8561-partial-'));
    const partial = join(root, 'route-budgets.json');
    writeFileSync(
      partial,
      JSON.stringify({
        routes: {
          admin: { budgets: { initialJS_gzip_kb: 300 } },
        },
      })
    );
    try {
      const budgets = loadRouteInitialJsBudgets(partial);
      const result = evaluateRouteBudgets(
        manifest({ '/': ['static/chunks/small.js'] }),
        budgets,
        () => 10 * KB
      );
      expect(result.passed).toBe(false);
      expect(result.violations.join('\n')).toContain('marketing');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
