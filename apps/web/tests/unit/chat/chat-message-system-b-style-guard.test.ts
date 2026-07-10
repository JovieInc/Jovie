import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');

const chatMessageSourcePath = 'components/jovie/components/ChatMessage.tsx';
const designSystemPath = 'styles/design-system.css';

const forbiddenChatMessagePatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /\b(?:text|rounded|shadow|border|bg|px|py|pt|pb|pl|pr|mt|mb|min-w|min-h|max-w|max-h|w|h|gap|space-y|duration|z)-\[[^\]]+\]/,
  /\b(?:bg|text|border|hover:bg|hover:text|focus-visible:bg)-(?:white|black|surface|primary|secondary|tertiary|primary-token|secondary-token|tertiary-token)(?:\b|-)/,
  /tracking-\[-/,
  /--linear-/,
  /color-mix\s*\(/,
] as const;

describe('ChatMessage System B source contract', () => {
  it('keeps transcript message chrome on named System B primitives', () => {
    const source = readFileSync(
      resolve(appRoot, chatMessageSourcePath),
      'utf8'
    );

    for (const pattern of forbiddenChatMessagePatterns) {
      expect(source, `${chatMessageSourcePath} matched ${pattern}`).not.toMatch(
        pattern
      );
    }
  });

  it('defines all transcript visual states in the design system source of truth', () => {
    const source = readFileSync(
      resolve(appRoot, chatMessageSourcePath),
      'utf8'
    );
    const styles = readFileSync(resolve(appRoot, designSystemPath), 'utf8');
    const requiredClasses = [
      'system-b-chat-message-row',
      'system-b-chat-user-bubble',
      'system-b-chat-user-attachments',
      'system-b-chat-user-text',
      'system-b-chat-assistant-frame',
      'system-b-chat-loading-indicator',
      'system-b-chat-loading-head',
      'system-b-chat-loading-avatar',
      'system-b-chat-loading-label',
      'system-b-chat-loading-body',
      'system-b-chat-loading-line',
      'system-b-chat-assistant-stack',
      'system-b-chat-message-reply',
      'system-b-chat-copy-row',
      'system-b-chat-copy-icon',
    ];

    for (const className of requiredClasses) {
      expect(source).toContain(className);
      expect(styles).toContain(`.${className}`);
    }

    expect(source).not.toContain('system-b-chat-copy-button');
    expect(styles).not.toContain('system-b-chat-copy-button');
  });

  it('keeps user-bubble light-surface text on the canonical System B alias', () => {
    const styles = readFileSync(resolve(appRoot, designSystemPath), 'utf8');

    expect(styles).toContain('--system-b-chat-user-bubble-text');
    expect(styles).toContain('--system-b-chat-body-size: var(--text-app);');
    expect(styles).not.toMatch(/--system-b-chat-body-size:\s*[\d.]+rem/);
    expect(styles).not.toContain('var(--system-b-chat-user-bubble-text, #');
  });
});
