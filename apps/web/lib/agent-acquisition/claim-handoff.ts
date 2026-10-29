import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';
import { BASE_URL } from '@/constants/app';
import { agentClaimPath } from './claim-path';
import { agentArtifactSignature } from './draft-capability';
import type { AgentAcquisition } from './draft-contract';

export { AGENT_CLAIM_PATH_PREFIX, agentClaimPath } from './claim-path';

/**
 * Claim handoff for agent-created drafts (JOV-9760).
 *
 * The handoff is the only thing an agent shows a person. It is NOT the
 * draft_token: it cannot read, mutate or resume the draft through the agent
 * API, and the draft_token never appears in a URL.
 *
 * It is an HMAC over the draft's immutable fields, so it is:
 * - bound to one draft id, artist, draft-token issuance (via the stored
 *   capability hash, never the token itself) and acquisition record;
 * - bounded by the draft's own expiry (at most AGENT_DRAFT_TTL_MS, 7 days);
 * - single use on claim: claiming sets `claimed_at` with a compare-and-set,
 *   after which the same handoff only ever resolves to the claimed state.
 *
 * Deterministic for a given draft, so both write tools and retries return
 * the same URL.
 */
export const AGENT_CLAIM_HANDOFF_DOMAIN = 'jovie-agent-claim-handoff/v1';

const HANDOFF_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ClaimHandoffSubject {
  readonly id: string;
  readonly artistId: string;
  readonly capabilityHash: string;
  readonly expiresAt: Date;
  readonly claimedAt: Date | null;
  readonly acquisition: AgentAcquisition;
}

export type ClaimHandoffCheck = 'valid' | 'invalid' | 'expired' | 'claimed';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter(key => record[key] !== undefined)
      .sort((left, right) => left.localeCompare(right))
      .map(key => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function handoffBody(subject: ClaimHandoffSubject): string {
  return canonical({
    d: subject.id,
    a: subject.artistId,
    c: subject.capabilityHash,
    x: subject.expiresAt.getTime(),
    q: createHash('sha256')
      .update(canonical(subject.acquisition))
      .digest('base64url'),
  });
}

/**
 * Digest of exactly what the person reviewed. The claim form carries it and
 * the claim refuses to proceed if the stored draft no longer matches.
 */
export function agentDraftPreviewDigest(preview: unknown): string {
  return createHash('sha256').update(canonical(preview)).digest('base64url');
}

export function isAgentDraftId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function mintAgentClaimHandoff(subject: ClaimHandoffSubject): string {
  return agentArtifactSignature(
    AGENT_CLAIM_HANDOFF_DOMAIN,
    handoffBody(subject)
  ).toString('base64url');
}

/**
 * Order matters: the MAC is checked before expiry or claim state so a
 * caller without a valid handoff learns nothing about the draft.
 */
export function checkAgentClaimHandoff(
  subject: ClaimHandoffSubject | null,
  handoff: string | null | undefined,
  now = new Date()
): ClaimHandoffCheck {
  if (!subject || !handoff || !HANDOFF_PATTERN.test(handoff)) return 'invalid';
  const expected = agentArtifactSignature(
    AGENT_CLAIM_HANDOFF_DOMAIN,
    handoffBody(subject)
  );
  const provided = Buffer.from(handoff, 'base64url');
  if (
    provided.toString('base64url') !== handoff ||
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  )
    return 'invalid';
  if (subject.claimedAt) return 'claimed';
  if (subject.expiresAt <= now) return 'expired';
  return 'valid';
}

export function agentClaimUrl(subject: ClaimHandoffSubject): string {
  return `${BASE_URL}${agentClaimPath(subject.id, mintAgentClaimHandoff(subject))}`;
}
