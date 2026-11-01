import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => ({
  URL_ENCRYPTION_KEY: 'handoff-test-key-only',
}));
vi.mock('@/lib/env-server', () => ({ env: config }));

import {
  AGENT_CLAIM_HANDOFF_DOMAIN,
  agentClaimPath,
  agentClaimUrl,
  type ClaimHandoffSubject,
  checkAgentClaimHandoff,
  isAgentDraftId,
  mintAgentClaimHandoff,
} from './claim-handoff';
import { mintDraftCapability } from './draft-capability';

const now = new Date('2026-10-28T12:00:00Z');
function subject(
  overrides: Partial<ClaimHandoffSubject> = {}
): ClaimHandoffSubject {
  return {
    id: '9efebd98-39b7-4a77-8965-04b5aafad9ad',
    artistId: 'spotify:4Z8W4fKeB5YxbusRsdQVPb',
    capabilityHash: 'a'.repeat(64),
    expiresAt: new Date('2026-11-04T12:00:00Z'),
    claimedAt: null,
    acquisition: {
      agent_source: 'mcp',
      client: 'chatgpt',
      installation_id: 'install-1',
      first_touch: {},
    },
    ...overrides,
  };
}

describe('agent claim handoff', () => {
  it('verifies a minted handoff and is deterministic per draft', () => {
    const handoff = mintAgentClaimHandoff(subject());
    expect(handoff).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(mintAgentClaimHandoff(subject())).toBe(handoff);
    expect(checkAgentClaimHandoff(subject(), handoff, now)).toBe('valid');
  });

  it('is bound to the draft id, artist, capability issuance and acquisition', () => {
    const handoff = mintAgentClaimHandoff(subject());
    for (const changed of [
      subject({ id: '9efebd98-39b7-4a77-8965-04b5aafad9ae' }),
      subject({ artistId: 'spotify:0000000000000000000000' }),
      subject({ capabilityHash: 'b'.repeat(64) }),
      subject({ expiresAt: new Date('2026-11-05T12:00:00Z') }),
      subject({
        acquisition: { ...subject().acquisition, client: 'claude' },
      }),
    ]) {
      expect(checkAgentClaimHandoff(changed, handoff, now)).toBe('invalid');
    }
  });

  it('rejects missing, malformed, tampered and cross-domain tokens before any state leaks', () => {
    const s = subject({ claimedAt: now, expiresAt: new Date(0) });
    const handoff = mintAgentClaimHandoff(subject());
    expect(checkAgentClaimHandoff(null, handoff, now)).toBe('invalid');
    expect(checkAgentClaimHandoff(subject(), null, now)).toBe('invalid');
    expect(checkAgentClaimHandoff(subject(), 'short', now)).toBe('invalid');
    const flipped = `${handoff.slice(0, -1)}${handoff.endsWith('A') ? 'B' : 'A'}`;
    expect(checkAgentClaimHandoff(subject(), flipped, now)).toBe('invalid');
    // A claimed + expired draft with a wrong handoff still reports invalid.
    expect(checkAgentClaimHandoff(s, flipped, now)).toBe('invalid');
    // The draft-capability domain cannot be replayed as a handoff.
    const draftDomain = createHmac('sha256', config.URL_ENCRYPTION_KEY)
      .update('jovie-agent-draft/v1\0')
      .update('x')
      .digest('base64url');
    expect(checkAgentClaimHandoff(subject(), draftDomain, now)).toBe('invalid');
    expect(AGENT_CLAIM_HANDOFF_DOMAIN).not.toBe('jovie-agent-draft/v1');
  });

  it('expires with the draft (at most seven days)', () => {
    const handoff = mintAgentClaimHandoff(subject());
    expect(
      checkAgentClaimHandoff(
        subject(),
        handoff,
        new Date('2026-11-04T12:00:00Z')
      )
    ).toBe('expired');
  });

  it('is single use: once claimed_at is set it only resolves to claimed', () => {
    const handoff = mintAgentClaimHandoff(subject());
    expect(
      checkAgentClaimHandoff(subject({ claimedAt: now }), handoff, now)
    ).toBe('claimed');
  });

  it('builds a URL that never contains the draft token', () => {
    const { token, capability } = mintDraftCapability(
      'spotify:4Z8W4fKeB5YxbusRsdQVPb',
      { client: 'chatgpt' },
      now.getTime()
    );
    const url = agentClaimUrl(
      subject({
        id: capability.draft_id,
        expiresAt: new Date(capability.expires_at),
      })
    );
    expect(url).toMatch(
      new RegExp(`/claim/agent/${capability.draft_id}\\?h=[A-Za-z0-9_-]{43}$`)
    );
    expect(url).not.toContain(token);
    expect(url).not.toContain(token.split('.')[1]);
    expect(agentClaimPath('id', 'h')).toBe('/claim/agent/id?h=h');
  });

  it('accepts only UUID draft ids', () => {
    expect(isAgentDraftId(subject().id)).toBe(true);
    expect(isAgentDraftId('../etc')).toBe(false);
    expect(isAgentDraftId('agent')).toBe(false);
  });
});
