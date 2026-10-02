import 'server-only';

import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { env } from '@/lib/env-server';
import { parseAgentArtistInput } from './artist-input';
import {
  AGENT_DRAFT_TTL_MS,
  agentAcquisitionSchema,
  type DraftCapability,
  draftCapabilitySchema,
} from './draft-contract';

function signature(body: string): Buffer {
  if (!env.URL_ENCRYPTION_KEY)
    throw new Error('Draft capability signing is unavailable');
  return createHmac('sha256', env.URL_ENCRYPTION_KEY)
    .update('jovie-agent-draft/v1\0')
    .update(body)
    .digest();
}

export function draftTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** A draft-only capability never authorizes an account, claim or publication. */
export function mintDraftCapability(
  artistId: string,
  acquisition: unknown,
  now = Date.now(),
  storefront?: string
) {
  const artist = parseAgentArtistInput({ input: artistId });
  if (
    artist.kind !== 'exact' ||
    artistId !== `${artist.provider}:${artist.id}` ||
    (storefront !== undefined &&
      (artist.provider !== 'apple_music' || !/^[a-z]{2}$/.test(storefront)))
  ) {
    throw new Error('An exact canonical artist identity is required');
  }
  const capability: DraftCapability = {
    version: 1,
    draft_id: randomUUID(),
    artist_id: artistId,
    ...(storefront ? { storefront } : {}),
    issued_at: now,
    expires_at: now + AGENT_DRAFT_TTL_MS,
    acquisition: agentAcquisitionSchema.parse(acquisition),
  };
  const body = Buffer.from(JSON.stringify(capability)).toString('base64url');
  const token = `${body}.${signature(body).toString('base64url')}`;
  if (token.length > 8192)
    throw new Error('Draft capability exceeds its size bound');
  return { capability, token };
}

export function verifyDraftCapability(
  token: string,
  now = Date.now()
): DraftCapability | null {
  if (token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token))
    return null;
  const [body, provided] = token.split('.');
  const expected = signature(body!);
  const actual = Buffer.from(provided!, 'base64url');
  if (
    actual.toString('base64url') !== provided ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return null;
  try {
    const parsed = draftCapabilitySchema.safeParse(
      JSON.parse(Buffer.from(body!, 'base64url').toString('utf8'))
    );
    if (!parsed.success) return null;
    const value = parsed.data;
    const artist = parseAgentArtistInput({ input: value.artist_id });
    if (
      artist.kind !== 'exact' ||
      value.artist_id !== `${artist.provider}:${artist.id}` ||
      (value.storefront !== undefined && artist.provider !== 'apple_music') ||
      value.issued_at > now ||
      value.expires_at <= now ||
      value.expires_at <= value.issued_at ||
      value.expires_at - value.issued_at > AGENT_DRAFT_TTL_MS
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
