import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const guardedSources = [
  'components/jovie/components/ImageAttachmentChip.tsx',
  'components/jovie/components/ImagePreviewStrip.tsx',
  'components/jovie/components/ChatAvatarUploadCard.tsx',
  'components/jovie/components/ChatLinkConfirmationCard.tsx',
  'components/jovie/components/ChatLinkRemovalCard.tsx',
  'components/jovie/components/ScrollToBottom.tsx',
] as const;

const forbiddenVisualPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient|bg-gradient/,
  /\b(?:bg|border|text|hover:bg|hover:text|focus-visible:ring)-\[/,
  /\b(?:z|max-h|max-w|min-h|min-w|h|w|rounded|shadow|drop-shadow|tracking|transition)-\[/,
] as const;

describe('chat attachment and action System B source contract', () => {
  it('keeps image/link/avatar/scroll affordances on named System B primitives', () => {
    for (const sourcePath of guardedSources) {
      const source = readFileSync(resolve(process.cwd(), sourcePath), 'utf8');

      for (const pattern of forbiddenVisualPatterns) {
        expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
