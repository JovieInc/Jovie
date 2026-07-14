import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  enqueueForEve,
  isP0Finding,
  shouldFastTrack,
  writeRemediationManifest,
} from '../../qa-swarm/autonomy.mjs';
import {
  buildGbrainSlug,
  persistGbrainFinding,
} from '../../qa-swarm/gbrain.mjs';
import { buildEnrichedIssueBody } from '../../qa-swarm/linear.mjs';
import { getQaSwarmPaths } from '../../qa-swarm/paths.mjs';
import { proposeQaSwarmFindings } from '../../qa-swarm/propose.mjs';
import {
  getRecipeByCommand,
  QA_SWARM_RECIPES,
} from '../../qa-swarm/registry.mjs';
import {
  isQaSwarmFinding,
  isQaSwarmProposeInput,
  QA_SWARM_RECIPE_IDS,
} from '../../qa-swarm/types.mjs';

const tempRoots = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

function makeTempRepo() {
  const repoRoot = mkdtempSync(path.join(tmpdir(), 'qa-swarm-test-'));
  tempRoots.push(repoRoot);
  const originalCwd = process.cwd();
  process.chdir(repoRoot);
  return {
    repoRoot,
    restore() {
      process.chdir(originalCwd);
    },
  };
}

describe('qa-swarm registry', () => {
  it('defines six recipes with matching slash-command files', () => {
    expect(QA_SWARM_RECIPES).toHaveLength(6);

    for (const recipe of QA_SWARM_RECIPES) {
      const commandPath = path.join(
        process.cwd(),
        '.claude',
        'commands',
        `${recipe.command}.md`
      );
      expect(existsSync(commandPath)).toBe(true);
      expect(getRecipeByCommand(recipe.command).id).toBe(recipe.id);
    }
  });
});

describe('qa-swarm enriched linear issues', () => {
  it('builds canonical follow-up shape with recipe enrichment', () => {
    const body = buildEnrichedIssueBody(
      {
        id: 'auth-500',
        recipeId: 'diff-review',
        title: 'Auth gate returns 500',
        summary: 'Signed-in dashboard routes fail with 500 after proxy change.',
        priority: 'P0',
        kind: 'objective',
        evidencePaths: ['apps/web/proxy.ts'],
        reproduction: 'pnpm run dev:web:fast then open /app',
      },
      {
        recipeId: 'diff-review',
        runId: 'qa-swarm-run-1',
        sourceIssue: 'JOV-3212',
        gbrainSlug: 'qa-swarm/diff-review/2026-06-20/auth-500',
      }
    );

    expect(body).toContain('## Source');
    expect(body).toContain('## Follow-up');
    expect(body).toContain('## Why it matters');
    expect(body).toContain('## Classification');
    expect(body).toContain('Required');
    expect(body).toContain('## QA swarm enrichment');
    expect(body).toContain('Recipe: Diff-review swarm');
    expect(body).toContain('Priority: P0');
    expect(body).toContain(
      'gbrain: `qa-swarm/diff-review/2026-06-20/auth-500`'
    );
  });
});

describe('qa-swarm autonomy', () => {
  it('fast-tracks P0 findings even when Eve is enabled', () => {
    const finding = {
      id: 'billing-regression',
      recipeId: 'explore',
      title: 'Checkout broken',
      summary: 'Stripe checkout returns payment error for all Pro users.',
      priority: 'P0',
      kind: 'objective',
      evidencePaths: [],
    };

    expect(isP0Finding(finding)).toBe(true);
    expect(shouldFastTrack(finding, true)).toBe(true);
  });

  it('fast-tracks flake findings that are P1-equivalent when Eve is enabled', () => {
    const finding = {
      id: 'flake-regression',
      recipeId: 'flaky-hunter',
      title: 'Repro flaky test',
      summary: 'Intermittent CI timeout on analytics.',
      priority: 'P1',
      kind: 'flake',
      evidencePaths: ['tests/e2e/dashboard.spec.ts'],
    };

    expect(isP0Finding(finding)).toBe(true);
    expect(shouldFastTrack(finding, true)).toBe(true);
  });

  it('queues non-P0 findings for Eve when enabled', () => {
    const finding = {
      id: 'spacing-nit',
      recipeId: 'vision-critique',
      title: 'Toolbar spacing',
      summary: 'Toolbar padding is 2px tighter than reference.',
      priority: 'P2',
      kind: 'taste',
      evidencePaths: ['screenshots/toolbar.png'],
      polishScore: 7,
    };

    expect(shouldFastTrack(finding, true)).toBe(false);
  });
});

describe('qa-swarm propose pipeline', () => {
  it.each([
    '../escape',
    'nested/run',
    'nested\\run',
    '/tmp/escape',
    '.',
  ])('rejects hostile run id %s before creating run artifacts', async runId => {
    const { repoRoot, restore } = makeTempRepo();

    try {
      await expect(
        proposeQaSwarmFindings({
          recipeId: 'diff-review',
          runId,
          dryRun: true,
          findings: [
            {
              id: 'hostile-run-id',
              recipeId: 'diff-review',
              title: 'Hostile run id',
              summary: 'Must be rejected before filesystem writes.',
              priority: 'P1',
              kind: 'objective',
              evidencePaths: [],
            },
          ],
        })
      ).rejects.toThrow(/one safe path segment/);
      expect(existsSync(path.join(repoRoot, '.context'))).toBe(false);
    } finally {
      restore();
    }
  });

  it('persists gbrain pages, remediation manifests, and eve queue entries', async () => {
    const { repoRoot, restore } = makeTempRepo();

    try {
      const summary = await proposeQaSwarmFindings({
        recipeId: 'flaky-hunter',
        dryRun: true,
        eveEnabled: true,
        findings: [
          {
            id: 'flake-dashboard-health',
            recipeId: 'flaky-hunter',
            title: 'Dashboard health flake',
            summary:
              'dashboard-pages-health fails intermittently on analytics.',
            priority: 'P0',
            kind: 'flake',
            evidencePaths: [
              'apps/web/tests/e2e/dashboard-pages-health.spec.ts',
            ],
            reproduction:
              'cd apps/web && pnpm playwright test tests/e2e/dashboard-pages-health.spec.ts --repeat-each=3',
          },
          {
            id: 'minor-copy',
            recipeId: 'flaky-hunter',
            title: 'Copy drift',
            summary: 'Non-blocking copy mismatch in empty state.',
            priority: 'P2',
            kind: 'taste',
            evidencePaths: [],
          },
        ],
      });

      const paths = getQaSwarmPaths(repoRoot);
      expect(summary.proposedCount).toBe(2);
      expect(summary.fastTrackedCount).toBe(1);
      expect(summary.eveQueuedCount).toBe(1);

      const gbrainQueue = readFileSync(paths.gbrainQueuePath, 'utf8')
        .trim()
        .split('\n');
      expect(gbrainQueue).toHaveLength(2);

      const remediationPath = path.join(
        paths.remediationRoot,
        'flake-dashboard-health.json'
      );
      expect(existsSync(remediationPath)).toBe(true);

      const eveQueue = readFileSync(paths.eveQueuePath, 'utf8')
        .trim()
        .split('\n');
      expect(eveQueue).toHaveLength(1);

      const slug = buildGbrainSlug(
        {
          id: 'flake-dashboard-health',
          recipeId: 'flaky-hunter',
          title: 'Dashboard health flake',
          summary: 'x',
          priority: 'P0',
          kind: 'flake',
          evidencePaths: [],
        },
        { recipeId: 'flaky-hunter', runId: summary.runId }
      );
      expect(slug).toContain('qa-swarm/flaky-hunter/');
    } finally {
      restore();
    }
  });

  it('writes gbrain markdown pages for each finding', () => {
    const { repoRoot, restore } = makeTempRepo();

    try {
      const result = persistGbrainFinding(
        {
          id: 'vision-home-jank',
          recipeId: 'vision-critique',
          title: 'Homepage hero jank',
          summary: 'Hero CTA shifts 12px on load.',
          priority: 'P1',
          kind: 'objective',
          evidencePaths: ['screenshots/home.png'],
          polishScore: 4,
        },
        { recipeId: 'vision-critique', runId: 'run-vision-1' }
      );

      expect(existsSync(result.pagePath)).toBe(true);
      const page = readFileSync(result.pagePath, 'utf8');
      expect(page).toContain('Polish score: 4/10');
      expect(page).toContain('Homepage hero jank');

      const paths = getQaSwarmPaths(repoRoot);
      expect(existsSync(paths.gbrainQueuePath)).toBe(true);
    } finally {
      restore();
    }
  });

  it('continues when Eve is disabled by still fast-tracking P0', async () => {
    const { restore } = makeTempRepo();

    try {
      const summary = await proposeQaSwarmFindings({
        recipeId: 'diff-review',
        dryRun: true,
        eveEnabled: false,
        findings: [
          {
            id: 'crash-on-save',
            recipeId: 'diff-review',
            title: 'Save crash',
            summary: 'Profile save throws uncaught exception.',
            priority: 'P0',
            kind: 'objective',
            evidencePaths: [],
          },
        ],
      });

      expect(summary.fastTrackedCount).toBe(1);
      expect(summary.eveQueuedCount).toBe(0);
    } finally {
      restore();
    }
  });

  it('validates propose input with matching recipe ids and typed optional fields', () => {
    const findings = [
      {
        id: 'invalid-metadata',
        recipeId: 'diff-review',
        title: 'Title',
        summary: 'Summary',
        priority: 'P1',
        kind: 'objective',
        evidencePaths: ['path'],
        reproduction: 123,
      },
    ];

    expect(
      isQaSwarmProposeInput({
        recipeId: 'diff-review',
        findings,
      })
    ).toBe(false);

    expect(
      isQaSwarmProposeInput({
        recipeId: 'diff-review',
        findings: [
          {
            id: 'bad-recipe-id',
            recipeId: QA_SWARM_RECIPE_IDS[1],
            title: 'Title',
            summary: 'Summary',
            priority: 'P1',
            kind: 'objective',
            evidencePaths: ['path'],
          },
        ],
      })
    ).toBe(false);

    expect(
      isQaSwarmFinding({
        id: 'good',
        recipeId: QA_SWARM_RECIPE_IDS[0],
        title: 'Good',
        summary: 'ok',
        priority: 'P1',
        kind: 'taste',
        evidencePaths: ['path'],
        metadata: {},
        polishScore: 9,
        surface: 'homepage',
      })
    ).toBe(true);
  });
});

describe('qa-swarm eve queue helper', () => {
  it('appends a durable Eve curation entry', () => {
    const { repoRoot, restore } = makeTempRepo();

    try {
      enqueueForEve(
        {
          id: 'taste-queue-1',
          recipeId: 'design-jury',
          title: 'Raycast depth',
          summary:
            'Card elevation should borrow Raycast depth, not consumer chrome.',
          priority: 'P2',
          kind: 'taste',
          evidencePaths: ['screenshots/dashboard.png'],
          referenceComp: 'Raycast',
        },
        { gbrainSlug: 'qa-swarm/design-jury/2026-06-20/taste-queue-1' }
      );

      const paths = getQaSwarmPaths(repoRoot);
      const entry = JSON.parse(readFileSync(paths.eveQueuePath, 'utf8').trim());
      expect(entry.findingId).toBe('taste-queue-1');
      expect(entry.referenceComp).toBeUndefined();
      expect(entry.gbrainSlug).toBe(
        'qa-swarm/design-jury/2026-06-20/taste-queue-1'
      );
    } finally {
      restore();
    }
  });

  it('writes remediation manifest with verification commands', () => {
    const { restore } = makeTempRepo();

    try {
      const manifestPath = writeRemediationManifest(
        {
          id: 'p0-auth',
          recipeId: 'explore',
          title: 'Auth broken',
          summary: 'Loopback auth bypass fails on /app.',
          priority: 'P0',
          kind: 'objective',
          evidencePaths: [],
        },
        {
          recipeId: 'explore',
          linearIssueUrl: 'https://linear.app/jovie/issue/JOV-999',
        }
      );

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      expect(manifest.profile).toBe('coder');
      expect(manifest.verificationCommands).toContain(
        'pnpm run test:web:smoke'
      );
      expect(manifest.linearIssueUrl).toBe(
        'https://linear.app/jovie/issue/JOV-999'
      );
    } finally {
      restore();
    }
  });
});
