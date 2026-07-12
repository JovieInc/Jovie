import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Playwright no-auth config', () => {
  it('does not authenticate public surfaces with a global bypass header', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'playwright.config.noauth.ts'),
      'utf8'
    );

    expect(source).not.toContain("'x-test-mode': 'bypass-auth'");
    expect(source).not.toContain('extraHTTPHeaders');
  });
});
