// Design-noise and the route JS budgets failed 18 of 79 sampled failed merge
// groups (2026-11-08 to 11-11), and PR CI does not run design-noise at all.
// `pnpm preflight:changed` runs both before a push: design-noise in every
// mode, the route JS budgets (a production build) as a heavy guard.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LOCAL_GUARDS,
  selectLocalGuards,
} from '../../../../../scripts/lib/preflight-local-guards.mjs';
import { selectManifestGuards } from '../../../../../scripts/lib/source-validation-manifest.mjs';

const REPO_ROOT = resolve(process.cwd(), '../..');
const ids = (paths: string[]) => selectLocalGuards(paths).map(g => g.id);
const guard = (id: string) => {
  const found = LOCAL_GUARDS.find(g => g.id === id);
  if (!found) throw new Error(`missing guard ${id}`);
  return found;
};

describe('preflight:changed local guards', () => {
  it('runs design-noise for any web or packages/ui component, in every mode', () => {
    for (const path of [
      'apps/web/components/features/feedback/PmfSurveyCard.tsx',
      'apps/web/app/(marketing)/page.tsx',
      'packages/ui/atoms/inline-subscribe.tsx',
      'apps/web/design-noise.baseline.json',
      'apps/web/scripts/lint-design-noise.mjs',
      'scripts/lib/shrink-only-baseline.mjs',
    ]) {
      expect(ids([path]), path).toContain('design-noise');
    }
    expect(guard('design-noise').heavy).toBeUndefined();
    expect(ids(['README.md', 'scripts/ci-fast-lanes.mjs'])).toEqual([]);
  });

  it('runs the route JS budgets when shipped web code changes, as a heavy guard', () => {
    for (const path of [
      'apps/web/app/(marketing)/page.tsx',
      'apps/web/components/home/HomepageEditorial.tsx',
      'apps/web/lib/analytics/track.ts',
      'apps/web/app/globals.css',
      'packages/ui/atoms/button.tsx',
      'apps/web/next.config.js',
      'apps/web/package.json',
      'pnpm-lock.yaml',
      'apps/web/scripts/route-js-budgets.json',
      'apps/web/scripts/route-js-budget.mjs',
    ]) {
      expect(ids([path]), path).toContain('route-js-budget');
    }
    for (const path of [
      'apps/web/tests/unit/home/homepage.test.tsx',
      'apps/web/components/home/HomepageEditorial.test.tsx',
      'apps/web/components/home/HomepageEditorial.stories.tsx',
      'apps/web/components/home/__tests__/copy.ts',
      'apps/web/scripts/lint-design-noise.mjs',
      'docs/launch/LAUNCH_GATES.md',
      '.github/workflows/ci.yml',
    ]) {
      expect(ids([path]), path).not.toContain('route-js-budget');
    }
    const budget = guard('route-js-budget');
    expect(budget.heavy).toBe(true);
    expect(budget.timeoutMs).toBeGreaterThanOrEqual(600_000);
  });

  it('measures the same bundles as Source Validation and never edits a budget', () => {
    const budget = guard('route-js-budget').command;
    expect(budget).toContain('pnpm turbo build --filter=@jovie/web');
    expect(budget).toContain(
      'node apps/web/scripts/route-js-budget.mjs --next-dir apps/web/.next'
    );
    for (const env of [
      'NEXT_PUBLIC_AUTH_MOCK=1',
      'NEXT_PUBLIC_E2E_MODE=1',
      'NEXT_PRIVATE_SKIP_SIZE_CHECK=true',
    ]) {
      expect(budget).toContain(env);
    }
    for (const { command } of LOCAL_GUARDS) {
      expect(command).not.toMatch(/--update|--tighten|--write/);
      for (const script of command.match(/apps\/web\/scripts\/\S+\.mjs/g) ??
        []) {
        expect(existsSync(join(REPO_ROOT, script)), script).toBe(true);
      }
    }
  });

  it('preflight:changed picks them up through the guard manifest', () => {
    const selected = selectManifestGuards([
      'apps/web/components/features/feedback/PmfSurveyCard.tsx',
    ]).map(g => g.id);
    expect(selected).toEqual(
      expect.arrayContaining(['design-noise', 'route-js-budget'])
    );
    expect(selectManifestGuards(['README.md'])).toEqual([]);
  });
});
