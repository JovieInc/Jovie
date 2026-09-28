import { describe, expect, it } from 'vitest';
import { evaluateCertificationAdmission } from '@/lib/agent-os/certification';
import { MARKETING_COMPONENT_REGISTRY } from '../data/marketing/componentRegistry';
import {
  affectedEntries,
  buildPacket,
  certificationPlans,
  defectReceipts,
  fileDefects,
  storyFileFor,
  testFilesFor,
} from './marketing-certification-producer';

const SHA = 'b'.repeat(40);
const footer = MARKETING_COMPONENT_REGISTRY.find(
  entry => entry.id === 'shell.footer'
);
if (!footer?.resolvedSource)
  throw new Error('fixture entry shell.footer must be source-backed');

function report(file: string, title: string, status: string) {
  return {
    testResults: [
      {
        name: `/repo/apps/web/${file}`,
        status,
        assertionResults: [{ title, status }],
      },
    ],
  };
}

const invariantsPassed = {
  testResults: [
    'tests/unit/marketing/component-registry.test.ts',
    'tests/unit/marketing/landing-page-grammar.test.ts',
    'tests/unit/marketing/recipe-manifest.test.ts',
  ].map(name => ({
    name: `/repo/apps/web/${name}`,
    status: 'passed',
    assertionResults: [{ title: 'x', status: 'passed' }],
  })),
};

function packetFor(overrides: Partial<Parameters<typeof buildPacket>[0]> = {}) {
  return buildPacket({
    entry: footer!,
    sha: SHA,
    runRef: 'run',
    penIssueIds: new Set(),
    invariants: invariantsPassed,
    ownTests: report(
      'components/site/MarketingFooter.test.tsx',
      'renders',
      'passed'
    ),
    ownTestFiles: ['components/site/MarketingFooter.test.tsx'],
    stories: report(
      'components/marketing/storybook/MarketingShells.stories.tsx',
      'MarketingFooter',
      'passed'
    ),
    story: {
      path: 'components/marketing/storybook/MarketingShells.stories.tsx',
      storyName: 'MarketingFooter',
    },
    sourceDigest: 'c'.repeat(64),
    ...overrides,
  });
}

describe('marketing certification producer', () => {
  it('selects entries whose source, declared tests or story changed', () => {
    const plans = [
      { id: 'a', dependencies: ['apps/web/a.tsx', 'apps/web/a.test.tsx'] },
      { id: 'b', dependencies: ['apps/web/b.tsx', 'apps/web/b.stories.tsx'] },
    ];
    expect(
      affectedEntries(plans, ['apps/web/a.test.tsx']).map(p => p.id)
    ).toEqual(['a']);
    expect(
      affectedEntries(plans, ['apps/web/b.stories.tsx', 'README.md']).map(
        p => p.id
      )
    ).toEqual(['b']);
    expect(affectedEntries(plans, ['a.tsx'])).toEqual([]);
  });

  it('certifies with the sibling test plus declared @coverage-via targets', () => {
    const source =
      '// @coverage-via apps/web/tests/unit/x.test.ts\n// @coverage-via apps/web/tests/unit/gone.test.ts\nexport {};';
    const existing = new Set([
      'apps/web/c/X.test.tsx',
      'apps/web/tests/unit/x.test.ts',
    ]);
    expect(
      testFilesFor('apps/web/c/X.tsx', source, p => existing.has(p))
    ).toEqual(['apps/web/c/X.test.tsx', 'apps/web/tests/unit/x.test.ts']);
    expect(testFilesFor('apps/web/c/Y.tsx', 'export {};', () => false)).toEqual(
      []
    );
  });

  it('plans each entry with source+test+story dependencies and re-runs on any hit', () => {
    const via = 'apps/web/tests/unit/marketing/footer-links.test.ts';
    const storyFiles = [
      { path: 'shells.stories.tsx', title: footer!.storybookTitle },
    ];
    const base = {
      entries: [footer!],
      storyFiles,
      exists: (path: string) => path === via,
      readSource: () => `// @coverage-via ${via}\nexport {};`,
    };
    const all = certificationPlans({ ...base, all: true, changed: [] });
    expect(all).toHaveLength(1);
    expect(all[0].dependencies).toEqual([
      footer!.resolvedSource,
      via,
      'apps/web/shells.stories.tsx',
    ]);
    expect(all[0].ownTestFiles).toEqual([
      'tests/unit/marketing/footer-links.test.ts',
    ]);
    const selected = (changed: string[]) =>
      certificationPlans({ ...base, all: false, changed }).map(
        plan => plan.entry.id
      );
    expect(selected(['README.md'])).toEqual([]);
    expect(selected([via])).toEqual(['shell.footer']);
    expect(selected(['apps/web/shells.stories.tsx'])).toEqual(['shell.footer']);
    expect(selected([footer!.resolvedSource!])).toEqual(['shell.footer']);
  });

  it('resolves a story from its meta title plus story name', () => {
    const files = [
      { path: 'shells.stories.tsx', title: 'Marketing/Shells' },
      { path: 'hero.stories.tsx', title: 'Marketing/Sections/Hero' },
    ];
    expect(storyFileFor('Marketing/Shells/MarketingFooter', files)).toEqual({
      path: 'shells.stories.tsx',
      storyName: 'MarketingFooter',
    });
    expect(storyFileFor('Marketing/Sections/Hero', files)).toEqual({
      path: 'hero.stories.tsx',
      storyName: '',
    });
    expect(storyFileFor('Marketing/Recipes/Nope', files)).toBeNull();
  });

  it('a fully evidenced entry is admitted as machine-passed review_ready', () => {
    const admission = evaluateCertificationAdmission({
      packet: packetFor(),
      evaluatedAt: '2026-09-28T01:00:00.000Z',
    });
    expect(admission.blockers).toEqual([]);
    expect(admission.state).toBe('review_ready');
  });

  it('aggregates multiple certifying test files: any failure fails, any gap reports', () => {
    const twoFiles = [
      'components/site/MarketingFooter.test.tsx',
      'tests/unit/marketing/footer-links.test.ts',
    ];
    const failed = packetFor({
      ownTests: {
        testResults: [
          {
            name: '/repo/apps/web/components/site/MarketingFooter.test.tsx',
            status: 'passed',
            assertionResults: [{ title: 'renders', status: 'passed' }],
          },
          {
            name: '/repo/apps/web/tests/unit/marketing/footer-links.test.ts',
            status: 'failed',
            assertionResults: [{ title: 'links resolve', status: 'failed' }],
          },
        ],
      },
      ownTestFiles: twoFiles,
    });
    expect(failed.testsCoverage[0].status).toBe('failed');
    const missingAndFailed = packetFor({
      ownTests: report(
        'tests/unit/marketing/footer-links.test.ts',
        'links resolve',
        'failed'
      ),
      ownTestFiles: twoFiles,
    });
    expect(missingAndFailed.testsCoverage[0].status).toBe('failed');
    const partialMissing = packetFor({ ownTestFiles: twoFiles });
    expect(partialMissing.testsCoverage[0].status).toBe('missing');
  });

  it('never reports missing or failed evidence as passed', () => {
    const noTest = packetFor({ ownTestFiles: [], ownTests: null });
    expect(noTest.testsCoverage[0].status).toBe('missing');
    const brokenStory = packetFor({
      stories: report(
        'components/marketing/storybook/MarketingShells.stories.tsx',
        'MarketingFooter',
        'failed'
      ),
    });
    expect(brokenStory.visualProof[0].status).toBe('failed');
    const wrongStory = packetFor({
      stories: report(
        'components/marketing/storybook/MarketingShells.stories.tsx',
        'OtherStory',
        'passed'
      ),
    });
    expect(wrongStory.visualProof[0].status).toBe('missing');
    const penFlagged = packetFor({ penIssueIds: new Set(['shell.footer']) });
    expect(penFlagged.canonicalReferences[0].status).toBe('failed');
    for (const packet of [noTest, brokenStory, wrongStory, penFlagged]) {
      expect(evaluateCertificationAdmission({ packet }).state).toBe('working');
    }
  });

  it('files real defects once per entry and tier, never missing evidence', () => {
    expect(defectReceipts(packetFor())).toEqual([]);
    expect(
      defectReceipts(packetFor({ ownTestFiles: [], ownTests: null }))
    ).toEqual([]);
    const broken = packetFor({
      stories: report(
        'components/marketing/storybook/MarketingShells.stories.tsx',
        'MarketingFooter',
        'failed'
      ),
    });
    expect(defectReceipts(broken)).toEqual([
      expect.objectContaining({
        fingerprint: 'marketing-cert:shell.footer:visual_proof',
        tier: 'visual_proof',
      }),
    ]);
  });

  it('upserts one fingerprinted issue per defect only when Linear is configured', async () => {
    const broken = packetFor({
      stories: report(
        'components/marketing/storybook/MarketingShells.stories.tsx',
        'MarketingFooter',
        'failed'
      ),
    });
    const calls: { fingerprint: string; title: string; description: string }[] =
      [];
    const upsert = async (input: (typeof calls)[number]) => {
      calls.push(input);
      return { ok: true, action: 'created' };
    };
    const previous = process.env.LINEAR_API_KEY;
    try {
      delete process.env.LINEAR_API_KEY;
      expect(await fileDefects(broken, SHA, async () => upsert)).toBe(0);
      process.env.LINEAR_API_KEY = 'lin_test';
      expect(await fileDefects(packetFor(), SHA, async () => upsert)).toBe(0);
      expect(await fileDefects(broken, SHA, async () => upsert)).toBe(1);
    } finally {
      if (previous === undefined) delete process.env.LINEAR_API_KEY;
      else process.env.LINEAR_API_KEY = previous;
    }
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      fingerprint: 'marketing-cert:shell.footer:visual_proof',
      title: expect.stringContaining('shell.footer visual_proof'),
    });
    expect(calls[0]?.description).toContain(SHA);
  });
});
