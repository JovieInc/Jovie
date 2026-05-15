import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COOKIE_REGISTRY,
  getCookiesByCategory,
  isRegisteredCookieName,
  NONESSENTIAL_PROXY_COOKIE_NAMES,
} from '@/lib/cookies/registry';

describe('cookie registry', () => {
  it('keeps registry names unique', () => {
    const names = COOKIE_REGISTRY.map(entry => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('identifies exact and prefix cookie names', () => {
    expect(isRegisteredCookieName('jv_aid')).toBe(true);
    expect(isRegisteredCookieName('__clerk_db_jwt')).toBe(true);
    expect(isRegisteredCookieName('unknown_cookie')).toBe(false);
  });

  it('registers active first-party cookie writers', () => {
    expect(COOKIE_REGISTRY.map(entry => entry.name)).toEqual(
      expect.arrayContaining([
        'jv_tracking_consent',
        'jovie_dsp',
        'jv_pref_spotify',
        'jovie_lead_attribution',
      ])
    );
  });

  it('marks only nonessential proxy cookies as blocked before consent', () => {
    const blocked = new Set(NONESSENTIAL_PROXY_COOKIE_NAMES);
    expect(blocked).toEqual(
      new Set(['jv_city', 'jv_region', 'jv_aid', 'jv_identified'])
    );

    for (const cookieName of blocked) {
      const entry = COOKIE_REGISTRY.find(item => item.name === cookieName);
      expect(entry).toBeDefined();
      expect(entry?.preConsent).toBe(false);
      expect(entry?.category).toBe('analytics');
    }
  });

  it('keeps cookie policy disclosure aligned with the registry', () => {
    const policy = readFileSync(
      join(process.cwd(), 'content/legal/cookies.md'),
      'utf8'
    );
    const policyRows = policy.split('\n').filter(line => line.startsWith('|'));

    for (const entry of COOKIE_REGISTRY) {
      const row = policyRows.find(line =>
        line.includes(`| \`${entry.name}\` |`)
      );
      expect(row).toBeDefined();
      expect(row ?? '').toContain(`| ${entry.duration} |`);
    }
  });

  it('documents that Statsig does not currently set browser cookies', () => {
    expect(
      getCookiesByCategory('analytics').map(entry => entry.name)
    ).not.toEqual(expect.arrayContaining(['statsig_*', '_stsg_*']));
  });
});
