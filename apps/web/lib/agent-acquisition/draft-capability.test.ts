import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => ({
  URL_ENCRYPTION_KEY: 'draft-test-key-only',
}));
vi.mock('@/lib/env-server', () => ({ env: config }));

import {
  draftTokenHash,
  mintDraftCapability,
  verifyDraftCapability,
} from './draft-capability';
import { AGENT_DRAFT_TTL_MS } from './draft-contract';

const artist = 'spotify:4Z8W4fKeB5YxbusRsdQVPb';
const now = 1_800_000_000_000;
const provenance = {
  agent_source: 'mcp',
  client: 'test',
  installation_id: 'install',
  referral_token: 'ref',
  session_or_run_id: 'run',
  intent: 'visibility',
  first_touch: { source: 'agent', campaign: 'launch', landingPath: '/start' },
};
const sign = (value: unknown) => {
  const body = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${body}.${createHmac('sha256', config.URL_ENCRYPTION_KEY).update('jovie-agent-draft/v1\0').update(body).digest('base64url')}`;
};

describe('draft-only capabilities', () => {
  it('round-trips exact identity and acquisition while issuing independent drafts', () => {
    const first = mintDraftCapability(artist, provenance, now);
    expect(verifyDraftCapability(first.token, now)).toEqual(first.capability);
    expect(first.capability.acquisition).toEqual(provenance);
    expect(first.capability.expires_at).toBe(now + AGENT_DRAFT_TTL_MS);
    expect(
      mintDraftCapability(artist, provenance, now).capability.draft_id
    ).not.toBe(first.capability.draft_id);
    expect(draftTokenHash(first.token)).toMatch(/^[a-f0-9]{64}$/);
    expect(draftTokenHash(first.token)).not.toContain(first.token);
  });
  it('rejects tampering, malformed or noncanonical signatures, and oversized input', () => {
    const { token, capability } = mintDraftCapability(artist, {}, now);
    const [body, signature] = token.split('.');
    const tampered = Buffer.from(
      JSON.stringify({ ...capability, artist_id: 'apple_music:657515' })
    ).toString('base64url');
    for (const value of [
      '',
      'x.y',
      `${tampered}.${signature}`,
      `${body}.${'A'.repeat(43)}`,
      'a'.repeat(8193),
    ])
      expect(verifyDraftCapability(value, now)).toBeNull();
    // Base64 padding bits cannot produce a second spelling of the same token.
    const alphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const changed =
      signature!.slice(0, -1) +
      alphabet[alphabet.indexOf(signature!.at(-1)!) + 1];
    expect(verifyDraftCapability(`${body}.${changed}`, now)).toBeNull();
  });
  it('rejects future, expired, malformed and overlong grants even with a valid signature', () => {
    const { token, capability } = mintDraftCapability(artist, {}, now);
    expect(verifyDraftCapability(token, now - 1)).toBeNull();
    expect(verifyDraftCapability(token, capability.expires_at - 1)).toEqual(
      capability
    );
    expect(verifyDraftCapability(token, capability.expires_at)).toBeNull();
    for (const patch of [
      { version: 2 },
      { artist_id: 'Radiohead' },
      { artist_id: 'spotify:artist:4Z8W4fKeB5YxbusRsdQVPb' },
      { expires_at: now },
      { expires_at: now + AGENT_DRAFT_TTL_MS + 1 },
      { draft_id: 'invalid' },
      { publish: true },
    ])
      expect(
        verifyDraftCapability(sign({ ...capability, ...patch }), now)
      ).toBeNull();
    const invalidJson = Buffer.from('{').toString('base64url');
    const sig = createHmac('sha256', config.URL_ENCRYPTION_KEY)
      .update('jovie-agent-draft/v1\0')
      .update(invalidJson)
      .digest('base64url');
    expect(verifyDraftCapability(`${invalidJson}.${sig}`, now)).toBeNull();
  });
  it('accepts only canonical exact identities and bounded provenance when minting', () => {
    expect(
      verifyDraftCapability(
        mintDraftCapability('apple_music:657515', {}, now, 'gb').token,
        now
      )?.storefront
    ).toBe('gb');
    expect(() => mintDraftCapability(artist, {}, now, 'gb')).toThrow();
    expect(() =>
      mintDraftCapability('apple_music:657515', {}, now, '../')
    ).toThrow();
    for (const input of [
      'Radiohead',
      'spotify:artist:4Z8W4fKeB5YxbusRsdQVPb',
      'https://example.com',
    ])
      expect(() => mintDraftCapability(input, {}, now)).toThrow();
    expect(() =>
      mintDraftCapability(artist, { owner_id: 'pretend' }, now)
    ).toThrow();
    expect(() =>
      mintDraftCapability(artist, { intent: 'x'.repeat(201) }, now)
    ).toThrow();
    expect(
      verifyDraftCapability(
        mintDraftCapability('apple_music:657515', undefined, now).token,
        now
      )?.acquisition
    ).toEqual({ first_touch: {} });
  });
  it('fails closed when the signing key is unavailable', () => {
    const key = config.URL_ENCRYPTION_KEY;
    try {
      config.URL_ENCRYPTION_KEY = '';
      expect(() => mintDraftCapability(artist, {}, now)).toThrow('unavailable');
    } finally {
      config.URL_ENCRYPTION_KEY = key;
    }
  });
});
