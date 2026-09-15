import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Storybook font bootstrap', () => {
  it('loads the production Inter face with its variable weight range', () => {
    const head = readFileSync(
      resolve(process.cwd(), '.storybook/preview-head.html'),
      'utf8'
    );

    expect(head).toContain('font-family: "Inter Variable"');
    expect(head).toContain('/fonts/Inter-Latin.woff2');
    expect(head).toContain('font-weight: 100 900');
  });
});
