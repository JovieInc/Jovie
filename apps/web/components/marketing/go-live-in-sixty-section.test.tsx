import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GoLiveInSixtySection } from './go-live-in-sixty-section';
import storyMeta, { Default } from './go-live-in-sixty-section.stories';

describe('GoLiveInSixtySection', () => {
  it('keeps the shipped heading bounded and covered by Storybook', () => {
    const source = readFileSync(
      resolve(__dirname, './go-live-in-sixty-section.tsx'),
      'utf8'
    );

    expect(source).toContain("data-testid='go-live-sixty-section'");
    expect(source).toContain('line-clamp-2');
    expect(storyMeta.component).toBe(GoLiveInSixtySection);
    expect(Default).toEqual({});
  });
});
