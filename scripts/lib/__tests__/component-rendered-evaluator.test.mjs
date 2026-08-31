import { describe, expect, it } from 'vitest';
import { storyCandidates } from '../../component-rendered-evaluator.mjs';

const BADGE = './packages/ui/atoms/Badge.stories.tsx';
const CATALOG =
  './apps/web/components/marketing/storybook/MarketingSections.stories.tsx';
// biome-ignore format: compact fixture keeps this source-PR under the hard size cap
const index = rows => ({ entries: Object.fromEntries(rows.map(([id, importPath, extra = {}]) => [id, { id, importPath, tags: ['jovie-certification'], type: 'story', ...extra }])) });
const ids = result => result.stories.map(story => story.id);

describe('rendered evaluator story selection', () => {
  it('tracks selected and missing requests independently', () => {
    // biome-ignore format: compact fixture keeps this source-PR under the hard size cap
    const result = storyCandidates(index([['badge--certified', BADGE], ['marketing-sections--legacy', CATALOG, { tags: [] }]]), { components: ['packages/ui/atoms/Badge.tsx', 'packages/ui/atoms/Missing.tsx'], storyPaths: ['apps/web/components/marketing/storybook/MarketingSections.stories.tsx', 'apps/web/components/missing/MissingStory.stories.tsx'] });
    expect(ids(result)).toEqual([
      'marketing-sections--legacy',
      'badge--certified',
    ]);
    expect(result.missingRequests).toEqual([
      'apps/web/components/missing/MissingStory.stories.tsx',
      'packages/ui/atoms/Missing.tsx',
    ]);
  });

  it('uses exact paths, TS/JS extensions, and exact catalog exports', () => {
    // biome-ignore format: compact fixture keeps this source-PR under the hard size cap
    const stories = index([['duplicate--suffix', './apps/web/legacy/packages/ui/atoms/Badge.stories.tsx'], ['badge--certified', BADGE], ['helper--certified', './packages/ui/atoms/Helper.stories.ts'], ['avatar--certified', './packages/ui/atoms/Avatar.stories.jsx'], ['marketing-sections--unrelated', CATALOG], ['marketing-sections--legacy-panel', CATALOG, { name: 'Legacy Panel' }], ['marketing-sections--action-coverage', CATALOG, { exportName: 'ActionCoverage' }]]);
    const adjacent = storyCandidates(stories, {
      components: [
        'packages/ui/atoms/Badge.tsx',
        'packages/ui/atoms/Helper.ts',
        'packages/ui/atoms/Avatar.jsx',
      ],
      storyPaths: [],
    });
    const catalog = storyCandidates(stories, {
      components: [],
      storyPaths: [
        'apps/web/components/marketing/storybook/MarketingSections.stories.tsx#LegacyPanel',
        'apps/web/components/marketing/storybook/MarketingSections.stories.tsx#ActionCoverage',
      ],
    });
    expect(ids(adjacent)).toEqual([
      'badge--certified',
      'helper--certified',
      'avatar--certified',
    ]);
    expect(ids(catalog)).toEqual([
      'marketing-sections--legacy-panel',
      'marketing-sections--action-coverage',
    ]);
  });
});
