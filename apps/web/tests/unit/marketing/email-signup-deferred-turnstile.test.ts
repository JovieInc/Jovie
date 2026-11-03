import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every page-level email signup loads Cloudflare Turnstile only after the
 * visitor touches the form. Mounting it on page load put a polling vendor
 * iframe, its debug console errors and a CSP-blocked `fetch('data:,')` probe
 * on every view of /card and /changelog (31 console errors on /card,
 * 2026-11-01).
 */
const webRoot = resolve(__dirname, '../../..');

function productionCallers(): string[] {
  const out = execFileSync(
    'git',
    ['grep', '-l', '<ChangelogEmailSignup', '--', 'app', 'components'],
    { cwd: webRoot, encoding: 'utf8' }
  );
  return out
    .split('\n')
    .filter(Boolean)
    .filter(file => !/\.(test|stories)\.[jt]sx?$/.test(file));
}

describe('email signup Turnstile deferral', () => {
  it('defers the security check in every production caller', () => {
    const callers = productionCallers();
    expect(callers.length).toBeGreaterThan(0);
    for (const file of callers) {
      const source = readFileSync(resolve(webRoot, file), 'utf8');
      const usages = source.match(/<ChangelogEmailSignup\b[^>]*>/gs) ?? [];
      for (const usage of usages) {
        expect(usage, `${file} must pass deferSecurityCheck`).toContain(
          'deferSecurityCheck'
        );
      }
    }
  });
});
