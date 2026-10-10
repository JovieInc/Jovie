import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadCsf } from 'storybook/internal/csf-tools';
import { describe, expect, it } from 'vitest';

describe('production pricing story exports', () => {
  it('indexes the pricing story without treating shared copy as a story', () => {
    const fileName = resolve(
      'components/organisms/PricingRecipeBody.stories.tsx'
    );
    const csf = loadCsf(readFileSync(fileName, 'utf8'), {
      fileName,
      makeTitle: title => title,
    }).parse();

    expect(csf.stories.map(story => story.id)).toEqual([
      'marketing-recipes-pricingproduction--pricing',
    ]);
  });
});
