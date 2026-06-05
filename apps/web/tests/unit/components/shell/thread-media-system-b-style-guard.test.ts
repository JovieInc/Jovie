import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../../..');

const guardedFiles = [
  'components/shell/ThreadAudioCard.tsx',
  'components/shell/ThreadImageCard.tsx',
  'components/shell/ThreadVideoCard.tsx',
];

const rawVisualPatterns = [
  /\b(?:text|rounded|shadow|border|bg|px|py|min-w|min-h|max-w|max-h|w|h|tracking|duration|z)-\[[^\]]+\]/,
  /\bfont-\[[^\]]+\]/,
  /tracking-\[-/,
  /color-mix\s*\(\s*in\s+srgb/i,
  /\brgba?\(/,
  /#[0-9A-Fa-f]{3,8}\b/,
  /--surface-[0-9]/,
];

describe('thread media System B style guard', () => {
  it('keeps thread media card component visuals on named primitives', () => {
    for (const file of guardedFiles) {
      const source = readFileSync(path.join(webRoot, file), 'utf8');
      const offenders = rawVisualPatterns
        .filter(pattern => pattern.test(source))
        .map(pattern => pattern.toString());

      expect(offenders, `${file} leaked ${offenders.join(', ')}`).toEqual([]);
    }
  });

  it('keeps thread media card CSS on globally defined System B tokens', () => {
    const source = readFileSync(
      path.join(webRoot, 'styles/design-system.css'),
      'utf8'
    );
    const threadMediaCss = source.match(
      /:where\(\.system-b-thread-media-card\)[\s\S]*?\.system-b-entity-chip-popover-content/
    )?.[0];

    expect(threadMediaCss).toContain('var(--system-b-bg-surface-0)');
    expect(threadMediaCss).toContain('var(--system-b-bg-surface-2)');
    expect(threadMediaCss).toContain('var(--system-b-primary-bg)');
    expect(threadMediaCss).toContain('var(--system-b-primary-fg)');
    expect(threadMediaCss).not.toMatch(/--linear-/);
    expect(threadMediaCss).not.toMatch(/--surface-[0-9]/);
    expect(threadMediaCss).not.toMatch(/\brgba?\(/);
    expect(threadMediaCss).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
  });
});
