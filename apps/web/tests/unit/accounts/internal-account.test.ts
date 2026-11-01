import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  isInternalAccount,
  parseAccountClass,
  resolveNewAccountClass,
} from '@/lib/accounts/internal-account';

describe('resolveNewAccountClass', () => {
  it('lets the harness header win', () => {
    expect(
      resolveNewAccountClass({ email: 'real@band.com', header: 'canary' })
    ).toBe('canary');
    expect(
      resolveNewAccountClass({ email: 'a@band.com', header: ' AGENT ' })
    ).toBe('agent');
  });

  it('falls back to the email rules, then to customer', () => {
    expect(resolveNewAccountClass({ email: 'x+e2e-1@gmail.com' })).toBe(
      'internal'
    );
    expect(resolveNewAccountClass({ email: 'fan@gmail.com' })).toBeNull();
    expect(resolveNewAccountClass({ email: null })).toBeNull();
  });

  it('ignores unknown header values', () => {
    expect(parseAccountClass('customer')).toBeNull();
    expect(
      resolveNewAccountClass({ email: 'fan@gmail.com', header: 'admin' })
    ).toBeNull();
  });
});

describe('isInternalAccount', () => {
  it('is internal by class even when the email looks external', () => {
    expect(
      isInternalAccount({ email: 'fan@gmail.com', accountClass: 'internal' })
    ).toBe(true);
  });
  it('is internal by email rule when no class is set', () => {
    expect(
      isInternalAccount({ email: `tim@${['timwhite', 'co'].join('.')}` })
    ).toBe(true);
  });
  it('treats an unclassifiable account as external', () => {
    expect(isInternalAccount({ email: null, accountClass: null })).toBe(false);
  });
});

/**
 * Invariant: company metrics classify accounts through
 * lib/accounts/internal-account.ts only. Strict part (deterministic): no file
 * outside the classifier modules may build its own `~*` query from the raw
 * pattern. Heuristic part (warn-only until validated, see
 * feedback_validate_invariants): a metrics file that aggregates an
 * account-scoped table but never mentions the shared classifier is reported.
 */
const here = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(here, '..', '..', '..');
const ALLOWED_RAW_PATTERN_USERS = new Set([
  'lib/utils/email.ts',
  'lib/accounts/internal-account.ts',
]);
// Operational listings, not metrics: they must show internal accounts too.
// waitlist.ts filters through organic-waitlist.ts.
const NOT_A_METRIC = new Set([
  'lib/admin/users.ts',
  'lib/admin/platform-connections.ts',
  'lib/admin/waitlist.ts',
]);
const METRIC_DIRS = ['lib/admin', 'lib/ovie', 'lib/analytics', 'lib/hud'];
const ACCOUNT_SCOPED =
  /\b(from\((users|clickEvents|audienceMembers|notificationSubscriptions|waitlistEntries)\)|FROM (users|click_events|audience_members|notification_subscriptions|waitlist_entries)\b)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(name) && !/\.(test|stories)\./.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('internal-account classifier coverage', () => {
  it('no file builds its own query from the raw email pattern', () => {
    const offenders = walk(WEB_ROOT)
      .map(file => relative(WEB_ROOT, file))
      .filter(file => !file.startsWith('tests/'))
      .filter(file => !ALLOWED_RAW_PATTERN_USERS.has(file))
      .filter(file =>
        readFileSync(join(WEB_ROOT, file), 'utf8').includes(
          'INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN'
        )
      );
    expect(offenders).toEqual([]);
  });

  it('warns about account-scoped metric files that skip the shared classifier', () => {
    const unfiltered = METRIC_DIRS.flatMap(dir => walk(join(WEB_ROOT, dir)))
      .map(file => relative(WEB_ROOT, file))
      .filter(file => !NOT_A_METRIC.has(file))
      .filter(file => {
        const source = readFileSync(join(WEB_ROOT, file), 'utf8');
        return (
          ACCOUNT_SCOPED.test(source) &&
          /count\(|COUNT\(/.test(source) &&
          !source.includes('@/lib/accounts/internal-account') &&
          !source.includes('isInternalOrTestAccountEmail')
        );
      });
    if (unfiltered.length > 0) {
      process.stderr.write(
        `[internal-account] metric files without the shared classifier (warn-only):\n  ${unfiltered.join('\n  ')}\n`
      );
    }
    expect(Array.isArray(unfiltered)).toBe(true);
  });
});
