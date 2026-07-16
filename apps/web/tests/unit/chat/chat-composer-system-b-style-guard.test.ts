import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const guardedSources = [
  'components/jovie/components/ChatInput.tsx',
  'components/jovie/components/ChatComposerToolbar.tsx',
] as const;

const forbiddenLocalChromePatterns = [
  /--linear-/,
  /--geist-cyan/,
  /\bcolor-mix\(/,
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient|bg-gradient/,
  /\b(?:bg|border|hover:bg|hover:text|focus-within:ring|focus-visible:ring)-\[/,
  /\btext-\[color:/,
  /\bshadow-\[/,
] as const;

describe('chat composer System B source contract', () => {
  it('keeps composer chrome on named System B primitives', () => {
    for (const sourcePath of guardedSources) {
      const source = readFileSync(resolve(appRoot, sourcePath), 'utf8');

      for (const pattern of forbiddenLocalChromePatterns) {
        expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('defines the composer visual states in the design system source of truth', () => {
    const styles = readFileSync(
      resolve(appRoot, 'styles/design-system.css'),
      'utf8'
    );

    for (const className of [
      'system-b-chat-content-shell',
      'system-b-chat-composer-dock',
      'system-b-chat-composer-scroll-fade',
      'system-b-chat-composer-thread-scroll-padding',
      'system-b-chat-composer-surface',
      'system-b-chat-composer-input',
      'system-b-chat-composer-picker-shell',
      'system-b-chat-composer-primary-action',
      'system-b-chat-composer-menu',
    ]) {
      expect(styles).toContain(className);
    }

    const inputRule = styles.match(
      /\.system-b-chat-composer-input\s*\{[\s\S]*?\}/
    )?.[0];
    expect(inputRule).toContain('color: var(--color-text-primary-token)');
    expect(inputRule).toContain(
      '-webkit-text-fill-color: var(--color-text-primary-token)'
    );

    const toolbarSource = readFileSync(
      resolve(appRoot, 'components/jovie/components/ChatComposerToolbar.tsx'),
      'utf8'
    );
    expect(toolbarSource).toContain("variant='ghost'");
    expect(toolbarSource).not.toContain('system-b-chat-composer-icon-button');

    const paletteSource = readFileSync(
      resolve(appRoot, 'components/organisms/SharedCommandPalette.tsx'),
      'utf8'
    );
    expect(paletteSource).toContain(
      'text-3xs font-semibold uppercase tracking-[0.1em] text-tertiary-token'
    );
    expect(paletteSource).not.toContain(
      'text-3xs font-semibold uppercase tracking-[0.1em] text-quaternary-token'
    );
  });
});
