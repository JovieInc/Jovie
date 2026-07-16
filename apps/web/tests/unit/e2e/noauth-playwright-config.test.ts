import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('no-auth Playwright config', () => {
  it('does not synthesize an authenticated user for public requests', () => {
    const config = readFileSync(
      resolve(import.meta.dirname, '../../../playwright.config.noauth.ts'),
      'utf8'
    );

    expect(config).not.toContain('x-test-mode');
  });
});
