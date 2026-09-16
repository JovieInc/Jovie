/**
 * Regression: an accidentally inactive checker must not pass.
 * Reads the shipped ESLint config and lints real fixtures through that config.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ESLINT_CONFIG_PATH,
  formatMessages,
  lintShipped,
  restyleMessages,
  SHADCN_FIXTURES_DIR,
} from './shadcn-lint-test-utils';

const INVALID_FIXTURE = path.join(
  SHADCN_FIXTURES_DIR,
  'invalid',
  'restyle-button-card-input.tsx'
);
const UNRECOGNIZED_FIXTURE = path.join(
  SHADCN_FIXTURES_DIR,
  'enrollment',
  'unrecognized-import-restyle.tsx'
);

describe('shadcn lint enrollment', () => {
  it('enrolls @shadcn/lint and recognizes @jovie/ui in the live ESLint config', () => {
    const config = readFileSync(ESLINT_CONFIG_PATH, 'utf8');
    expect(config).toContain("require('@shadcn/lint')");
    expect(config).toContain("'shadcn/no-restyle'");
    expect(config).toContain("ui: '@jovie/ui'");
    expect(config).toContain("'^@jovie/ui(/|$)'");
    expect(config).toMatch(/['"]error['"]/);
  });

  it('reports restyles on @jovie/ui Button/Card/Input and ignores unrecognized imports', async () => {
    const recognized = restyleMessages(
      await lintShipped(INVALID_FIXTURE, { ignore: false })
    );
    const unrecognized = restyleMessages(
      await lintShipped(UNRECOGNIZED_FIXTURE, { ignore: false })
    );

    expect(
      recognized.length,
      formatMessages(recognized).join('\n')
    ).toBeGreaterThan(0);
    expect(formatMessages(recognized).join('\n')).toMatch(/Button|Card|Input/);
    expect(
      unrecognized,
      `unrecognized import was flagged:\n${formatMessages(unrecognized).join('\n')}`
    ).toEqual([]);
  }, 30_000);
});
