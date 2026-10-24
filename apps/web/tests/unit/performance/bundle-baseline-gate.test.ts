import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBaseline } from '@/scripts/compare-chunks';

function repoRoot(): string {
  // tests/unit/performance -> unit -> tests -> apps/web -> repo root.
  return join(import.meta.dirname, '..', '..', '..', '..', '..');
}

function baselinePath(): string {
  return join(repoRoot(), 'docs/performance/bundle-baseline.json');
}

/**
 * JOV-8555: the initial-JS growth ratchet in compare-chunks.ts is fail-closed.
 * A missing, malformed, or placeholder (never-captured) baseline means growth
 * detection cannot run — that state must fail the run, never skip it silently.
 */
describe('bundle baseline gate (JOV-8555)', () => {
  it('commits a captured baseline so the initial-JS growth ratchet is wired', () => {
    const baseline = loadBaseline(baselinePath());
    expect(baseline.capturedAt).toBeTruthy();
    expect(baseline.commit).toBeTruthy();
    expect(baseline.totalInitialJS_bytes).toBeGreaterThan(0);
    expect(Object.keys(baseline.chunks).length).toBeGreaterThan(0);
  });

  it('fails closed on a missing baseline file', () => {
    expect(() =>
      loadBaseline(join(tmpdir(), 'jov-8555-nope', 'nope.json'))
    ).toThrow(/missing/);
  });

  it('fails closed on the empty placeholder baseline (capturedAt null, total 0)', () => {
    const root = mkdtempSync(join(tmpdir(), 'jov-8555-empty-'));
    const empty = join(root, 'bundle-baseline.json');
    writeFileSync(
      empty,
      JSON.stringify({
        capturedAt: null,
        commit: null,
        totalInitialJS_bytes: 0,
        chunks: {},
        _note: 'placeholder',
      })
    );
    try {
      expect(() => loadBaseline(empty)).toThrow(/unwired/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed on a malformed baseline file', () => {
    const root = mkdtempSync(join(tmpdir(), 'jov-8555-malformed-'));
    const malformed = join(root, 'bundle-baseline.json');
    writeFileSync(malformed, '{"capturedAt": "2026-01-01T00:00:00.000Z"}');
    try {
      expect(() => loadBaseline(malformed)).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('loads a valid captured baseline unchanged', () => {
    const root = mkdtempSync(join(tmpdir(), 'jov-8555-valid-'));
    const valid = join(root, 'bundle-baseline.json');
    writeFileSync(
      valid,
      JSON.stringify({
        capturedAt: '2026-10-23T00:00:00.000Z',
        commit: 'abc1234',
        totalInitialJS_bytes: 1234,
        chunks: { 'static/chunks/main-abc.js': 1234 },
      })
    );
    try {
      const baseline = loadBaseline(valid);
      expect(baseline.capturedAt).toBe('2026-10-23T00:00:00.000Z');
      expect(baseline.commit).toBe('abc1234');
      expect(baseline.totalInitialJS_bytes).toBe(1234);
      expect(baseline.chunks['static/chunks/main-abc.js']).toBe(1234);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/**
 * CLI end-to-end (JOV-8555): with a build manifest present but the baseline
 * unwired/missing, the committed script must exit 1 — pre-fix it printed
 * "No baseline captured yet" and skipped growth detection entirely, passing
 * on the loose estimated-gzip ceiling alone. Runs the real script via Node
 * type-stripping; no pnpm install required.
 */
describe('compare-chunks CLI fail-closed baseline (JOV-8555)', () => {
  it('exits 1 on an unwired baseline even when a build manifest exists', () => {
    const root = repoRoot();
    const script = join(root, 'apps/web/scripts/compare-chunks.ts');
    expect(existsSync(script)).toBe(true);
    // Run a copy from an isolated dir: the script resolves .next and the
    // baseline relative to its own location, so the isolated tree has a
    // fabricated build manifest but no baseline file — the exact unwired
    // state that must fail closed.
    const isolated = mkdtempSync(join(tmpdir(), 'jov-8555-cli-'));
    const isolatedScript = join(isolated, 'scripts', 'compare-chunks.ts');
    try {
      mkdirSync(dirname(isolatedScript), { recursive: true });
      writeFileSync(isolatedScript, readFileSync(script, 'utf-8'));
      mkdirSync(join(isolated, '.next', 'static', 'chunks'), {
        recursive: true,
      });
      writeFileSync(
        join(isolated, '.next', 'build-manifest.json'),
        JSON.stringify({
          pages: { '/': ['static/chunks/main-abc.js'] },
        })
      );
      writeFileSync(
        join(isolated, '.next', 'static', 'chunks', 'main-abc.js'),
        '/*chunk*/'.repeat(100)
      );
      const result = spawnSync(
        'node',
        ['--experimental-strip-types', isolatedScript],
        {
          cwd: isolated,
          encoding: 'utf8',
          env: { ...process.env, NODE_OPTIONS: '' },
        }
      );
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
      expect(result.status).toBe(1);
      expect(output).toContain('BUNDLE BASELINE');
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  }, 60_000);
});
