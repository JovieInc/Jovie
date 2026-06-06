import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const guardedSources = [
  'components/jovie/components/ImageAttachmentChip.tsx',
  'components/jovie/components/ImagePreviewStrip.tsx',
  'components/jovie/components/ChatAvatarUploadCard.tsx',
  'components/jovie/components/ChatActionCard.tsx',
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

  it('defines chat action-card visual states in the design system source of truth', () => {
    const actionCardSource = readFileSync(
      resolve(process.cwd(), 'components/jovie/components/ChatActionCard.tsx'),
      'utf8'
    );
    const designSystemSource = readFileSync(
      resolve(process.cwd(), 'styles/design-system.css'),
      'utf8'
    );
    const requiredClasses = [
      'system-b-chat-action-card',
      'system-b-chat-action-card-icon-shell',
      'system-b-chat-action-card-icon',
      'system-b-chat-action-card-copy',
      'system-b-chat-action-card-title',
      'system-b-chat-action-card-body',
      'system-b-chat-action-card-primary',
      'system-b-chat-action-card-primary-icon',
      'system-b-chat-action-card-dismiss',
      'system-b-chat-action-card-dismiss-icon',
    ];

    for (const className of requiredClasses) {
      expect(actionCardSource).toContain(className);
      expect(designSystemSource).toContain(`.${className}`);
    }
  });
});
