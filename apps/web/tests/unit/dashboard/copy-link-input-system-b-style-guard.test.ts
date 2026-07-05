import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const copyLinkSourcePath =
  'components/features/dashboard/atoms/CopyLinkInput.tsx';

const forbiddenLocalChromePatterns = [
  /\bgreen-/,
  /\bscale-(?:50|100)\b/,
  /\btransition-all\b/,
  /-translate-y-1\/2/,
  /rgba?\(/,
  /\b(?:bg|border|shadow)-\[/,
] as const;

describe('CopyLinkInput System B source contract', () => {
  it('keeps copied-state chrome on named System B primitives', () => {
    const source = readFileSync(resolve(appRoot, copyLinkSourcePath), 'utf8');

    for (const pattern of forbiddenLocalChromePatterns) {
      expect(source, `${copyLinkSourcePath} matched ${pattern}`).not.toMatch(
        pattern
      );
    }

    for (const className of [
      'system-b-copy-link-input',
      'system-b-copy-link-icon',
    ]) {
      expect(source).toContain(className);
    }

    expect(source).toContain("variant='ghost'");
    expect(source).not.toContain('system-b-copy-link-button');

    expect(source).toContain('data-copied');
    expect(source).toContain('data-visible');

    for (const stableGeometryClass of [
      'pr-9',
      'h-7',
      'h-9',
      'right-1.5',
      'inset-y-0',
      'p-1',
      'h-3.5 w-3.5',
    ]) {
      expect(source).toContain(stableGeometryClass);
    }
  });

  it('defines the copy-link visual states in the design system source of truth', () => {
    const styles = readFileSync(
      resolve(appRoot, 'styles/design-system.css'),
      'utf8'
    );

    for (const selector of [
      '.system-b-copy-link-input',
      '.system-b-copy-link-input[data-copied="true"]',
      '.system-b-copy-link-icon',
      '.system-b-copy-link-icon[data-visible="true"]',
    ]) {
      expect(styles).toContain(selector);
    }

    expect(styles).not.toContain('system-b-copy-link-button');
  });
});
