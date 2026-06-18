import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const SMOKE_CONFIGS = [
  'playwright.config.smoke.ts',
  'playwright.config.smoke.mobile.ts',
] as const;

describe('playwright smoke configs', () => {
  it.each(
    SMOKE_CONFIGS
  )('reserves heap for the managed web server in %s', configPath => {
    const source = readFileSync(configPath, 'utf8');

    expect(source).toContain('NODE_OPTIONS');
    expect(source).toContain('--max-old-space-size=8192');
  });
});
