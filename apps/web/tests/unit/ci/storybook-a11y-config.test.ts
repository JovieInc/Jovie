import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const previewSource = readFileSync(
  resolve(process.cwd(), '.storybook/preview.tsx'),
  'utf8'
);

describe('Storybook accessibility test contract', () => {
  it('fails component tests when a story has an accessibility violation', () => {
    expect(previewSource).toMatch(/a11y:\s*\{\s*test:\s*['"]error['"],/);
  });
});
