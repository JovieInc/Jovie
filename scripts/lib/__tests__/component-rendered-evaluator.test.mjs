import { describe, expect, it } from 'vitest';
import { storyCandidates } from '../../component-rendered-evaluator.mjs';

function story(id, importPath, tags = []) {
  return {
    id,
    importPath,
    tags,
    type: 'story',
  };
}

describe('rendered evaluator story selection', () => {
  it('selects one story set per requested component or story path', () => {
    const result = storyCandidates(
      {
        entries: {
          badge: story(
            'badge--certified',
            './packages/ui/atoms/Badge.stories.tsx',
            ['jovie-certification']
          ),
          marketing: story(
            'marketing-sections--legacy',
            './apps/web/components/marketing/storybook/MarketingSections.stories.tsx'
          ),
        },
      },
      {
        components: ['packages/ui/atoms/Badge.tsx'],
        storyPaths: [
          'apps/web/components/marketing/storybook/MarketingSections.stories.tsx',
        ],
      }
    );

    expect(result.missingRequests).toEqual([]);
    expect(result.stories.map(entry => entry.id)).toEqual([
      'marketing-sections--legacy',
      'badge--certified',
    ]);
  });

  it('reports requested components or story paths with no selected story', () => {
    const result = storyCandidates(
      {
        entries: {
          badge: story(
            'badge--certified',
            './packages/ui/atoms/Badge.stories.tsx',
            ['jovie-certification']
          ),
        },
      },
      {
        components: [
          'packages/ui/atoms/Badge.tsx',
          'packages/ui/atoms/Missing.tsx',
        ],
        storyPaths: ['apps/web/components/missing/MissingStory.stories.tsx'],
      }
    );

    expect(result.stories.map(entry => entry.id)).toEqual(['badge--certified']);
    expect(result.missingRequests).toEqual([
      'apps/web/components/missing/MissingStory.stories.tsx',
      'packages/ui/atoms/Missing.tsx',
    ]);
  });
});
