/**
 * Drives the shipped apps/web ESLint config against real @jovie/ui fixtures.
 * Does not reimplement @shadcn/lint.
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatMessages,
  lintShipped,
  restyleMessages,
  SHADCN_FIXTURES_DIR,
  WEB_ROOT,
} from './shadcn-lint-test-utils';

const VALID_FIXTURE = path.join(
  SHADCN_FIXTURES_DIR,
  'valid',
  'approved-button-card-input.tsx'
);
const INVALID_FIXTURE = path.join(
  SHADCN_FIXTURES_DIR,
  'invalid',
  'restyle-button-card-input.tsx'
);
const BUTTON_SOURCE = path.resolve(
  WEB_ROOT,
  '../../packages/ui/atoms/button.tsx'
);
const CARD_SOURCE = path.resolve(WEB_ROOT, '../../packages/ui/atoms/card.tsx');
const INPUT_SOURCE = path.resolve(
  WEB_ROOT,
  '../../packages/ui/atoms/input.tsx'
);

describe('shipped shadcn/no-restyle', () => {
  it('fails restyle classNames on Button, Card, and Input imported from @jovie/ui', async () => {
    const results = await lintShipped(INVALID_FIXTURE, { ignore: false });
    const messages = restyleMessages(results);
    const text = formatMessages(messages).join('\n');

    expect(messages.length, text).toBeGreaterThan(0);
    expect(text).toMatch(/Button/i);
    expect(text).toMatch(/Card/i);
    expect(text).toMatch(/Input/i);
    expect(text).toMatch(
      /variant|size|owns|approved|@jovie\/ui|Do not restyle/i
    );
  }, 30_000);

  it('allows approved variants, sizes, and layout/placement classNames', async () => {
    const results = await lintShipped(VALID_FIXTURE);
    const messages = restyleMessages(results);
    expect(formatMessages(messages)).toEqual([]);
  }, 30_000);

  it('does not flag canonical component-source files for internal styling', async () => {
    const results = await lintShipped(BUTTON_SOURCE, { ignore: false });
    const cardResults = await lintShipped(CARD_SOURCE, { ignore: false });
    const inputResults = await lintShipped(INPUT_SOURCE, { ignore: false });
    expect(restyleMessages(results)).toEqual([]);
    expect(restyleMessages(cardResults)).toEqual([]);
    expect(restyleMessages(inputResults)).toEqual([]);
  }, 30_000);
});
