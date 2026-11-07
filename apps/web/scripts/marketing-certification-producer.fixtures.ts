import { MARKETING_COMPONENT_REGISTRY } from '../data/marketing/componentRegistry';
import { buildPacket } from './marketing-certification-producer';

export const SHA = 'b'.repeat(40);
export const footer = MARKETING_COMPONENT_REGISTRY.find(
  entry => entry.id === 'shell.footer'
);
if (!footer?.resolvedSource)
  throw new Error('fixture entry shell.footer must be source-backed');

export function report(file: string, title: string, status: string) {
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

export const invariantsPassed = {
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

export function packetFor(
  overrides: Partial<Parameters<typeof buildPacket>[0]> = {}
) {
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
