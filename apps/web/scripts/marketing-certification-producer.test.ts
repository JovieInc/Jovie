import { describe, expect, it } from 'vitest';
import { evaluateCertificationAdmission } from '@/lib/agent-os/certification';
import { MARKETING_COMPONENT_REGISTRY } from '../data/marketing/componentRegistry';
import {
  affectedEntries,
  buildPacket,
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
});
