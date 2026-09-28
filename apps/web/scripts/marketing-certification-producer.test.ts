import { describe, expect, it } from 'vitest';
import { evaluateCertificationAdmission } from '@/lib/agent-os/certification';
import { MARKETING_COMPONENT_REGISTRY } from '../data/marketing/componentRegistry';
import {
  affectedEntries,
  buildPacket,
  defectReceipts,
  fileDefects,
  storyFileFor,
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
    ownTestFile: 'components/site/MarketingFooter.test.tsx',
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
  it('selects only entries whose repo-relative canonical source changed', () => {
    const picked = affectedEntries(MARKETING_COMPONENT_REGISTRY, [
      footer.resolvedSource!,
      'README.md',
    ]);
    expect(picked.map(entry => entry.id)).toEqual(['shell.footer']);
    expect(
      affectedEntries(MARKETING_COMPONENT_REGISTRY, [
        'components/site/MarketingFooter.tsx',
      ])
    ).toEqual([]);
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

  it('never reports missing or failed evidence as passed', () => {
    const noTest = packetFor({ ownTestFile: null, ownTests: null });
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
      defectReceipts(packetFor({ ownTestFile: null, ownTests: null }))
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
