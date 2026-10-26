import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = join(__dirname, '../../../..');

/**
 * Only these files may change what a subscription pays. Everything else must go
 * through the price-change gate (lib/billing/price-changes). plan-change.ts and
 * client.ts act on a subscriber's own request.
 */
const ALLOWED = new Set([
  'lib/stripe/client.ts',
  'lib/stripe/plan-change.ts',
  'lib/billing/price-changes/stripe-port.ts',
]);

const MUTATION =
  /\b(subscriptions\.update|subscriptionSchedules\.(create|update))\s*\(/;

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(entry) && !/\.(test|spec|stories)\./.test(entry))
      out.push(path);
  }
}

describe('Stripe subscription price mutations', () => {
  it('only happen in allowlisted modules', () => {
    const files: string[] = [];
    for (const dir of ['lib', 'app']) walk(join(webRoot, dir), files);
    const offenders = files
      .map(file => relative(webRoot, file))
      .filter(file => !ALLOWED.has(file))
      .filter(file => MUTATION.test(readFileSync(join(webRoot, file), 'utf8')));
    expect(
      offenders,
      'route new subscription price changes through lib/billing/price-changes (scheduled change + notice + gate)'
    ).toEqual([]);
  });
});
