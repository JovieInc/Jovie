import { readFileSync } from 'node:fs';
import { load as yamlLoad } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { deriveSteps, WORKFLOW_PATH } from '../../preflight.mjs';
import {
  coveredBy,
  NOT_LOCAL,
  SOURCE_VALIDATION_GUARDS,
  selectManifestGuards,
  workflowCommands,
} from '../source-validation-manifest.mjs';

const read = f =>
  readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
const runs = deriveSteps(read(WORKFLOW_PATH))
  .map(s => s.run)
  .filter(Boolean);
const commands = workflowCommands(runs, pkg.scripts, coveredBy);

describe('Source Validation manifest parity', () => {
  it('checks offer prose when a new billing helper has no direct guard import', () => {
    const guard = selectManifestGuards([
      'apps/web/lib/billing/price-versions.ts',
    ]).find(g => g.id === 'duplicate-literals');
    expect(guard?.command).toContain(
      'node scripts/invariants/offer-claims/check.mjs'
    );
    expect(guard?.command).toContain('node scripts/invariants/validate.mjs');
  });

  it.each([
    'apps/web/components/features/auth/AuthOfferSummary.tsx',
    'apps/web/components/features/auth/AuthOfferSummary.stories.tsx',
    'packages/ui/atoms/card.stories.ts',
    'packages/ui/atoms/card.states.stories.tsx',
  ])('runs the unchanged certificate gate for %s', path => {
    const guard = selectManifestGuards([path]).find(
      g => g.id === 'component-certificate'
    );
    expect(guard?.command).toBe('pnpm component-certificate:gate');
    expect(guard?.covers).toContain('pnpm component-certificate:gate');
  });

  it('runs overlapping local and CI guards once, preserving the worktree-aware command', () => {
    const guards = selectManifestGuards(
      ['apps/web/app/[username]/tip/thank-you/page.tsx'],
      'release/test'
    );
    expect(new Set(guards.map(g => g.id)).size).toBe(guards.length);
    expect(guards.find(g => g.id === 'web-eslint')?.command).toBe(
      'LINT_CHANGED_WORKTREE=1 ESLINT_CHANGED_BASE=origin/release/test pnpm --filter @jovie/web run lint:eslint:changed'
    );
    expect(guards.map(g => g.id)).toEqual(
      expect.arrayContaining([
        'projected-tree-budget',
        'design-authority',
        'web-eslint',
        'stack-pattern-ratchet',
        'dead-ends',
        'design-noise',
        'route-js-budget',
      ])
    );
  });

  it('every command Source Validation runs is a manifest guard or has a NOT_LOCAL reason', () => {
    const missing = commands.filter(c => !coveredBy(c));
    expect(
      missing,
      `add to SOURCE_VALIDATION_GUARDS or NOT_LOCAL in scripts/lib/source-validation-manifest.mjs:\n${missing.join('\n')}`
    ).toEqual([]);
  });

  it('every guard still names a command that its workflow runs (no stale entries)', () => {
    const stale = [];
    for (const g of SOURCE_VALIDATION_GUARDS) {
      const text = g.workflow
        ? JSON.stringify(yamlLoad(read(`.github/workflows/${g.workflow}`)))
        : commands.join('\n') + JSON.stringify(runs);
      for (const c of g.covers)
        if (!text.includes(c)) stale.push(`${g.id}: ${c}`);
    }
    expect(stale).toEqual([]);
  });

  it('NOT_LOCAL entries carry a reason and still match a workflow command', () => {
    for (const n of NOT_LOCAL) expect(n.reason.length).toBeGreaterThan(8);
    const dead = NOT_LOCAL.filter(
      n => !commands.some(c => c.includes(n.match))
    );
    expect(dead.map(n => n.match)).toEqual([]);
  });

  it('selects path-scoped guards, including the ones that failed PR #24021', () => {
    const ids = selectManifestGuards(['.github/workflows/x.yml']).map(
      g => g.id
    );
    for (const id of [
      'wf:topology',
      'wf:control-tests',
      'wf:token-budget',
      'wf:token-scope',
    ])
      expect(ids).toContain(id);
    expect(selectManifestGuards(['README.md']).map(g => g.id)).toEqual([
      'projected-tree-budget',
    ]);
  });

  it.each([
    'apps/web/components/features/admin/waitlist-table/AdminWaitlistTableWithViews.tsx',
    'apps/web/components/example.test.tsx',
    'apps/web/components/example.stories.tsx',
    'apps/web/lib/example.ts',
  ])(
    'runs CI changed-web ESLint locally for %s, including hook dependencies',
    file => {
      const guard = selectManifestGuards([file], 'staging').find(
        entry => entry.id === 'web-eslint'
      );
      expect(guard?.command).toBe(
        'LINT_CHANGED_WORKTREE=1 ESLINT_CHANGED_BASE=origin/staging pnpm --filter @jovie/web run lint:eslint:changed'
      );
      expect(guard?.heavy).not.toBe(true);
    }
  );

  it.each([
    'apps/web/components/organisms/DesktopTitlebarSlot.tsx',
    'apps/web/components/organisms/DesktopTitlebarSlot.stories.tsx',
    'apps/web/app/app/layout.tsx',
    'packages/ui/atoms/button.tsx',
    'docs/design-system/component-certification.json',
    'docs/design-system/component-certification.d/e1-admin.json',
    'docs/design-system/cert-screens.json',
    'scripts/lib/component-certificate.mjs',
    'scripts/lib/component-cert-screens.mjs',
  ])('runs the component and screen certificate gate for %s', file => {
    const gate = selectManifestGuards([file]).find(
      guard => guard.id === 'component-certificate'
    );
    expect(gate?.command).toBe('pnpm component-certificate:gate');
    expect(gate?.heavy).not.toBe(true);
  });
});
