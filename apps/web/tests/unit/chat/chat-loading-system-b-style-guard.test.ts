import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');

const guardedRoutes = [
  'app/app/(shell)/chat/loading.tsx',
  'app/app/(shell)/chat/[id]/loading.tsx',
  'app/app/(shell)/dashboard/profile/loading.tsx',
];

const guardedLoadingSources = [
  'components/jovie/components/ChatMessageSkeleton.tsx',
];

const localChromePatterns = [
  /rounded-\[[^\]]+\]/,
  /bg-\[[^\]]+\]/,
  /shadow-\[[^\]]+\]/,
  /linear-gradient|radial-gradient|bg-gradient/,
  /\brgba?\(/,
  /#[0-9A-Fa-f]{3,8}\b/,
  /\bborder-black\//,
  /\bborder-white\//,
  /\bdark:border-white\//,
  /--linear-/,
];

function expectNoLocalChrome(source: string, label: string) {
  const offenders = localChromePatterns
    .filter(pattern => pattern.test(source))
    .map(pattern => pattern.toString());

  expect(offenders, `${label} leaked ${offenders.join(', ')}`).toEqual([]);
}

function extractConversationLoadingBranch(source: string) {
  const start = source.indexOf(
    'export function ChatLoadingConversationSkeleton'
  );
  const end = source.indexOf('CHAT_COMPOSER_DOCK_CLASSNAME,', start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('chat and profile loading System B style guard', () => {
  it('keeps shell loading composer chrome on named System B primitives', () => {
    for (const route of guardedRoutes) {
      const source = readFileSync(path.join(webRoot, route), 'utf8');

      expectNoLocalChrome(source, route);
      expect(source).toMatch(
        /system-b-(shell-loading-composer|chat-conversation-loading)/
      );
      expect(source).not.toContain('border-(--linear-app-frame-seam)');
    }
  });

  it('keeps chat conversation loading surfaces on named primitives', () => {
    for (const sourcePath of guardedLoadingSources) {
      const source = readFileSync(path.join(webRoot, sourcePath), 'utf8');

      expectNoLocalChrome(source, sourcePath);
      expect(source).toContain('system-b-chat-message-skeleton');
      expect(source).toContain('system-b-chat-conversation-loading-composer');
    }

    const jovieChatSectionsSource = readFileSync(
      path.join(webRoot, 'components/jovie/JovieChatSections.tsx'),
      'utf8'
    );
    const loadingBranch = extractConversationLoadingBranch(
      jovieChatSectionsSource
    );

    expectNoLocalChrome(
      loadingBranch,
      'ChatLoadingConversationSkeleton conversation loading branch'
    );
    expect(loadingBranch).toContain('system-b-chat-conversation-loading');
    expect(loadingBranch).toContain(
      'system-b-chat-conversation-loading-viewport'
    );
    expect(loadingBranch).toContain('ChatConversationComposerSkeleton');
  });

  it('defines the shell loading composer from System B aliases', () => {
    const source = readFileSync(
      path.join(webRoot, 'styles/design-system.css'),
      'utf8'
    );
    const composerCss = source.match(
      /:where\(\.system-b-shell-loading-composer\)[\s\S]*?\/\* ============================================\s+SYSTEM B ONBOARDING V2 PRIMITIVES/
    )?.[0];

    expect(composerCss).toBeDefined();
    expect(composerCss).toContain('var(--system-b-app-frame-seam)');
    expect(composerCss).toContain('var(--system-b-radius-pill)');
    expect(composerCss).toContain('var(--system-b-app-content-surface)');
    expect(composerCss).toContain('var(--system-b-bg-surface-0)');
    expect(composerCss).not.toMatch(/--linear-/);
    expect(composerCss).not.toMatch(/\brgba?\(/);
    expect(composerCss).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(composerCss).not.toMatch(/\b(?:box-)?shadow\b/);
  });

  it('defines chat loading primitives from System B aliases', () => {
    const source = readFileSync(
      path.join(webRoot, 'styles/design-system.css'),
      'utf8'
    );
    const chatLoadingCss = source.match(
      /:where\(\.system-b-chat-message-skeleton\)[\s\S]*?:where\(\.system-b-chat-conversation-loading-composer-action-primary\)[\s\S]*?\}/
    )?.[0];

    expect(chatLoadingCss).toBeDefined();

    for (const className of [
      'system-b-chat-message-skeleton',
      'system-b-chat-message-skeleton-user-bubble',
      'system-b-chat-message-skeleton-assistant-frame',
      'system-b-chat-conversation-loading',
      'system-b-chat-conversation-loading-viewport',
      'system-b-chat-conversation-loading-dock',
      'system-b-chat-conversation-loading-composer',
      'system-b-chat-conversation-loading-composer-grid',
      'system-b-chat-conversation-loading-composer-title',
      'system-b-chat-conversation-loading-composer-action-primary',
    ]) {
      expect(chatLoadingCss).toContain(className);
    }

    expect(chatLoadingCss).toContain('var(--system-b-app-content-surface)');
    expect(chatLoadingCss).toContain('var(--system-b-app-frame-seam)');
    expect(chatLoadingCss).not.toMatch(/--linear-/);
    expect(chatLoadingCss).not.toMatch(/\brgba?\(/);
    expect(chatLoadingCss).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
  });
});
