import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLAIM_LINK_OUTREACH_LOOP } from '@/lib/growth/loop-links';
import { getOutboundClaimUrl } from './claim-url';

describe('getOutboundClaimUrl', () => {
  it('always points at the production public claim route', () => {
    expect(getOutboundClaimUrl('tok-1')).toBe('https://jov.ie/claim/tok-1');
  });

  it('ignores the deploy host, so staging never leaks into outreach', () => {
    const previous = process.env.NEXT_PUBLIC_PROFILE_URL;
    process.env.NEXT_PUBLIC_PROFILE_URL = 'https://staging.jov.ie';
    try {
      const url = getOutboundClaimUrl('tok-2');
      expect(url).not.toContain('staging');
      expect(url).not.toContain('/app/');
    } finally {
      process.env.NEXT_PUBLIC_PROFILE_URL = previous;
    }
  });
});

it('opts draft links into registry attribution without changing legacy target URLs or token encoding', () => {
  const loops = readFileSync(
    resolve(import.meta.dirname, '../../../../canon/growth-loops.jsonl'),
    'utf8'
  )
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
  const loop = loops.find(row => row.id === 'claim-link-outreach');
  expect(loop).toMatchObject(CLAIM_LINK_OUTREACH_LOOP);
  const token = 'synthetic/token ?#%';
  const legacy = getOutboundClaimUrl(token);
  const tracked = new URL(getOutboundClaimUrl(token, { tracked: true }));
  expect(tracked.origin).toBe('https://jov.ie');
  expect(tracked.pathname).toBe(`/claim/${encodeURIComponent(token)}`);
  expect(tracked.searchParams.get('utm_source')).toBe(loop.utmSource);
  expect(tracked.searchParams.get('utm_medium')).toBe(loop.utmMedium);
  expect(tracked.searchParams.get('utm_campaign')).toBe(loop.id);
  expect(new URL(legacy).search).toBe('');
});
