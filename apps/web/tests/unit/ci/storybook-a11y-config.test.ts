import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const previewSource = readFileSync(
  resolve(process.cwd(), '.storybook/preview.tsx'),
  'utf8'
);
const vitestConfigSource = readFileSync(
  resolve(process.cwd(), 'vitest.config.mts'),
  'utf8'
);

describe('Storybook accessibility test contract', () => {
  it('fails component tests when a story has an accessibility violation', () => {
    expect(previewSource).toMatch(/a11y:\s*\{\s*test:\s*['"]error['"],/);
  });

  it('routes the Storybook test widget to the browser test project', () => {
    expect(vitestConfigSource).toContain('process.env.STORYBOOK_CONFIG_DIR');
    expect(vitestConfigSource).toContain(
      "import('./vitest.config.storybook.mts')"
    );
  });
});
