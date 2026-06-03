import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const guardedSources = [
  'components/jovie/components/SuggestedProfilesCarousel.tsx',
  'components/jovie/components/chat-prompt-styles.ts',
  'components/jovie/components/SlashCommandMenu.tsx',
  'components/jovie/components/SuggestedPrompts.tsx',
  'components/jovie/components/TokenizedText.tsx',
] as const;

const forbiddenVisualPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient|bg-gradient/,
  /\b(?:bg|border|text|hover:bg|hover:text|focus-visible:ring)-\[/,
  /\b(?:h|w|max-w|min-w|min-h|grid-cols|gap|px|py|rounded|shadow|tracking|transition|align)-\[/,
] as const;

describe('chat suggestions and slash picker System B source contract', () => {
  it('keeps prompts, slash headers, suggestion cards, and transcript chips on named primitives', () => {
    for (const sourcePath of guardedSources) {
      const source = readFileSync(resolve(process.cwd(), sourcePath), 'utf8');

      for (const pattern of forbiddenVisualPatterns) {
        expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
