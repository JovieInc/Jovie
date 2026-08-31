import { describe, expect, it } from 'vitest';
import { storyCandidates } from '../../component-rendered-evaluator.mjs';

const BADGE_STORY = './packages/ui/atoms/Badge.stories.tsx';
const CATALOG_STORY =
  './apps/web/components/marketing/storybook/MarketingSections.stories.tsx';

function story(id, importPath, tags = [], extra = {}) {
  return { id, importPath, tags, type: 'story', ...extra };
}

function index(stories) {
  return { entries: Object.fromEntries(stories.map(item => [item.id, item])) };
}

const storyIds = result => result.stories.map(entry => entry.id);

describe('rendered evaluator story selection', () => {
  it('selects one story set per requested component or story path', () => {
    const result = storyCandidates(
      index([
        story('badge--certified', BADGE_STORY, ['jovie-certification']),
        story('marketing-sections--legacy', CATALOG_STORY),
      ]),
      {
        components: ['packages/ui/atoms/Badge.tsx'],
        storyPaths: [
          'apps/web/components/marketing/storybook/MarketingSections.stories.tsx',
        ],
      }
    );

    expect(result.missingRequests).toEqual([]);
    expect(storyIds(result)).toEqual([
      'marketing-sections--legacy',
      'badge--certified',
    ]);
  });

  it('reports requested components or story paths with no selected story', () => {
    const result = storyCandidates(
      index([story('badge--certified', BADGE_STORY, ['jovie-certification'])]),
      {
        components: [
          'packages/ui/atoms/Badge.tsx',
          'packages/ui/atoms/Missing.tsx',
        ],
        storyPaths: ['apps/web/components/missing/MissingStory.stories.tsx'],
      }
    );

    expect(storyIds(result)).toEqual(['badge--certified']);
    expect(result.missingRequests).toEqual([
      'apps/web/components/missing/MissingStory.stories.tsx',
      'packages/ui/atoms/Missing.tsx',
    ]);
  });

  it('matches requested Storybook import paths exactly after normalization', () => {
    const result = storyCandidates(
      index([
        story(
          'duplicate--suffix',
          './apps/web/legacy/packages/ui/atoms/Badge.stories.tsx',
          ['jovie-certification']
        ),
        story('badge--certified', BADGE_STORY, ['jovie-certification']),
      ]),
      { components: ['packages/ui/atoms/Badge.tsx'], storyPaths: [] }
    );

    expect(result.missingRequests).toEqual([]);
    expect(storyIds(result)).toEqual(['badge--certified']);
  });

  it('selects the exact requested story export within a shared catalog file', () => {
    const result = storyCandidates(
      index([
        story('marketing-sections--unrelated', CATALOG_STORY, [
          'jovie-certification',
        ]),
        story('marketing-sections--legacy-panel', CATALOG_STORY, [], {
          name: 'Legacy Panel',
        }),
      ]),
      {
        components: [],
        storyPaths: [
          'apps/web/components/marketing/storybook/MarketingSections.stories.tsx#LegacyPanel',
        ],
      }
    );

    expect(result.missingRequests).toEqual([]);
    expect(storyIds(result)).toEqual(['marketing-sections--legacy-panel']);
  });
});
