import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import tailwindcss from '@tailwindcss/postcss';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(import.meta.dirname, '..', '..', '..');
const GLOBALS_CSS = readFileSync(join(WEB_ROOT, 'app', 'globals.css'), 'utf8');

function readCanonicalTheme(): string {
  const theme = GLOBALS_CSS.match(/@theme \{[\s\S]*?\n\}/)?.[0];

  if (!theme) {
    throw new Error(
      'apps/web/app/globals.css is missing its canonical @theme block'
    );
  }

  return theme;
}

describe('canonical marketing container Tailwind emission', () => {
  it('registers both container aliases in the canonical theme block', () => {
    const theme = readCanonicalTheme();

    expect(theme).toContain(
      '--container-public-content: var(--ds-public-content-max);'
    );
    expect(theme).toContain(
      '--container-prose-canonical: var(--ds-prose-max);'
    );
  });

  it('emits both canonical max-width utilities through Tailwind v4', async () => {
    const compiledCss = (
      await postcss([
        tailwindcss({
          base: join(WEB_ROOT, 'tests', 'unit', 'marketing', 'fixtures'),
        }),
      ]).process(
        `${readCanonicalTheme()}\n` +
          '@source inline("max-w-public-content max-w-prose-canonical");\n' +
          '@tailwind utilities;',
        { from: undefined }
      )
    ).css;

    expect(compiledCss).toMatch(
      /--container-public-content:\s*var\(--ds-public-content-max\);/
    );
    expect(compiledCss).toMatch(
      /--container-prose-canonical:\s*var\(--ds-prose-max\);/
    );
    expect(compiledCss).toMatch(
      /\.max-w-public-content\s*\{\s*max-width:\s*var\(--container-public-content\);\s*\}/
    );
    expect(compiledCss).toMatch(
      /\.max-w-prose-canonical\s*\{\s*max-width:\s*var\(--container-prose-canonical\);\s*\}/
    );
  });
});
