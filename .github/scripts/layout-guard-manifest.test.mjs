import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  OPTIONAL_LAYOUT_GUARD_SPECS,
  REQUIRED_LAYOUT_GUARD_SPECS,
  selectLayoutGuardSpecs,
} from './layout-guard-manifest.mjs';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const manifestScript = resolve(
  repoRoot,
  '.github/scripts/layout-guard-manifest.mjs'
);
const workflow = readFileSync(
  resolve(repoRoot, '.github/workflows/ci.yml'),
  'utf8'
);

describe('Layout Guard workflow contract', () => {
  it('requires every stable spec and includes an optional spec only when present', () => {
    const required = new Set(REQUIRED_LAYOUT_GUARD_SPECS);
    const withRequiredOnly = selectLayoutGuardSpecs(spec => required.has(spec));
    const withOptional = selectLayoutGuardSpecs(() => true);

    expect(withRequiredOnly).toEqual(REQUIRED_LAYOUT_GUARD_SPECS);
    expect(withOptional).toEqual([
      ...REQUIRED_LAYOUT_GUARD_SPECS,
      ...OPTIONAL_LAYOUT_GUARD_SPECS,
    ]);
  });

  it('fails closed when a required spec is missing', () => {
    expect(() => selectLayoutGuardSpecs(() => false)).toThrow(
      'Layout Guard contract missing required spec: tests/e2e/hud-scroll.spec.ts'
    );

    const emptyWebRoot = mkdtempSync(
      resolve(tmpdir(), 'layout-guard-missing-')
    );
    try {
      const result = spawnSync(process.execPath, [manifestScript], {
        cwd: emptyWebRoot,
        encoding: 'utf8',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        '::error::Layout Guard contract missing required spec: tests/e2e/hud-scroll.spec.ts'
      );
      expect(result.stdout).toBe('');
    } finally {
      rmSync(emptyWebRoot, { recursive: true, force: true });
    }
  });

  it('keeps current required specs materialized and executes the selected manifest', () => {
    for (const spec of REQUIRED_LAYOUT_GUARD_SPECS) {
      expect(() =>
        readFileSync(resolve(repoRoot, 'apps/web', spec))
      ).not.toThrow();
    }

    const ci = load(workflow);
    const commands = [
      [
        'ci-build-layout',
        'verify-layout-build.sh',
        'Combined-head standalone server failed to start',
      ],
      [
        'ci-layout-guard',
        'verify-layout-evidence.sh',
        'Layout Guard standalone server failed to start within 30s.',
      ],
    ];
    for (const [job, file, startupError] of commands) {
      const path = `.github/scripts/ci/${file}`;
      const step = ci.jobs[job].steps.find(
        candidate =>
          candidate.name === 'Run deterministic layout behavior guard'
      );
      expect(step?.run).toBe(`exec bash -e "$GITHUB_WORKSPACE/${path}"`);
      const program = readFileSync(resolve(repoRoot, path), 'utf8');
      expect(program).toContain(
        'node ../../.github/scripts/layout-guard-manifest.mjs'
      );
      expect(program).toContain(
        'pnpm exec playwright test "${LAYOUT_GUARD_SPECS[@]}"'
      );
      expect(program).toContain('--config=playwright.config.noauth.ts');
      const baseUrl = new URL(step.env.BASE_URL);
      expect(baseUrl.hostname).toBe('localhost');
      expect(program).toContain(
        `PORT=${baseUrl.port} node .next/standalone/apps/web/server.js`
      );
      expect(program).toContain(`::error::${startupError}`);
      for (const fallback of [
        'pnpm --filter=@jovie/web exec next start',
        'layout-overlap-guard.spec.ts',
        'not found — skipping',
      ]) {
        expect(workflow).not.toContain(fallback);
        expect(program).not.toContain(fallback);
      }
    }
  });
});
