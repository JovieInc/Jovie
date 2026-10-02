import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  certifyMobileChatSurface,
  KNOWN_BAD_MOBILE_CHAT_FIXTURE,
  MOBILE_CHAT_RULES,
  MOBILE_CHAT_SURFACE_FILES,
  type MobileChatSurfaceId,
} from '@/lib/chat/mobile-chat-certification';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function readLiveSources(): Record<MobileChatSurfaceId, string> {
  const sources = {} as Record<MobileChatSurfaceId, string>;
  for (const [surface, file] of Object.entries(MOBILE_CHAT_SURFACE_FILES) as [
    MobileChatSurfaceId,
    string,
  ][]) {
    sources[surface] = readFileSync(resolve(appRoot, file), 'utf8');
  }
  return sources;
}

describe('mobile chat certification (JOV-7203)', () => {
  it('rejects the preserved founder-rejected fixture and names why', () => {
    const result = certifyMobileChatSurface(KNOWN_BAD_MOBILE_CHAT_FIXTURE);

    expect(result.ok).toBe(false);
    const rejectedRules = result.violations.map(v => v.rule);
    for (const rule of MOBILE_CHAT_RULES) {
      expect(rejectedRules).toContain(rule.id);
    }
  });

  it('certifies the live chat surface implementation', () => {
    const result = certifyMobileChatSurface(readLiveSources());

    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it.each([
    [
      'fixed-viewport-height shell returns',
      'workspaceSurface',
      (source: string) =>
        source
          .replace("scroll='panel'", '')
          .replace('absolute inset-0', 'min-h-screen'),
      'viewport-anchor',
    ],
    [
      'composer dock loses its bottom pin',
      'composerDockStyles',
      (source: string) => source.replace('bottom: 0;', 'bottom: auto;'),
      'composer-dock-pinned',
    ],
    [
      'composer dock loses safe-area padding',
      'composerDockStyles',
      (source: string) => source.replace('env(safe-area-inset-bottom)', '0px'),
      'composer-safe-area',
    ],
    [
      'transcript loses composer scroll clearance',
      'chatTokens',
      (source: string) =>
        source.replace(
          /--system-b-chat-composer-thread-scroll-padding:\s*[^;]+;/,
          ''
        ),
      'thread-scroll-clearance',
    ],
    [
      'keyboard viewport listener removed',
      'chatView',
      (source: string) =>
        source.replace(/window\.visualViewport/g, 'undefined'),
      'keyboard-viewport-listener',
    ],
    [
      'composer dock unmounted from the view',
      'chatView',
      (source: string) =>
        source.replace("data-testid='chat-composer-dock'", ''),
      'composer-dock-mounted',
    ],
  ] as const)(
    'rejects a reintroduced regression: %s',
    (_name, surface, mutate, expectedRule) => {
      const sources = readLiveSources();
      sources[surface] = mutate(sources[surface]);

      const result = certifyMobileChatSurface(sources);

      expect(result.ok).toBe(false);
      expect(result.violations.map(v => v.rule)).toContain(expectedRule);
    }
  );
});
