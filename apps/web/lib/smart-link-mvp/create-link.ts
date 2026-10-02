import { randomBytes } from 'node:crypto';
import {
  FREE_LINKS_PER_MONTH,
  JOVIE_PLANS_PATH,
  type LinkCandidate,
  type LinkResult,
} from './contract';
import { parseLinkQuery, providerKeyForUrl } from './parse-input';
import type {
  CanonicalRelease,
  CreateLinkInput,
  ResolvedRelease,
  SmartLinkStore,
  StoredLink,
} from './types';

const CODE_ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789';

export function allocateLinkCode(): string {
  const bytes = randomBytes(8);
  let code = '';
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}

function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function plansUrl(origin: string): string {
  return new URL(JOVIE_PLANS_PATH, origin).toString();
}

function failure(
  code: NonNullable<LinkResult['code']>,
  origin: string
): LinkResult {
  if (code === 'LIMIT_REACHED') {
    return { status: 'error', code, plansUrl: plansUrl(origin) };
  }
  if (code === 'NOT_FOUND') return { status: 'not_found', code };
  return { status: 'error', code };
}

function fromStored(
  link: StoredLink,
  origin: string,
  status: 'created' | 'existing'
): LinkResult {
  const pageUrl = new URL(`/l/${link.code}`, origin).toString();
  return {
    status,
    code: link.code,
    shortUrl: pageUrl,
    pageUrl,
    title: link.title,
    artist: link.artistName,
    artworkUrl: link.artworkUrl,
    providers: [...link.providers],
    claimUrl: new URL(`/l/${link.code}/claim`, origin).toString(),
    claimed: false,
  };
}

function fromCanonical(canonical: CanonicalRelease): LinkResult {
  return {
    status: 'existing',
    shortUrl: canonical.pageUrl,
    pageUrl: canonical.pageUrl,
    title: canonical.title,
    artist: canonical.artist,
    artworkUrl: canonical.artworkUrl,
    providers: [],
    claimUrl: null,
    claimed: true,
  };
}

function choices(candidates: readonly LinkCandidate[]): LinkResult {
  return { status: 'needs_choice', candidates: [...candidates] };
}

async function findExisting(
  store: SmartLinkStore,
  input: { readonly isrc?: string | null; readonly providerKey?: string | null }
): Promise<StoredLink | null> {
  if (input.isrc) {
    const byIsrc = await store.findByIsrc(input.isrc);
    if (byIsrc) return byIsrc;
  }
  if (input.providerKey) return store.findByProviderKey(input.providerKey);
  return null;
}

async function reuseOrCanonical(
  store: SmartLinkStore,
  origin: string,
  input: { readonly isrc?: string | null; readonly providerKey?: string | null }
): Promise<LinkResult | null> {
  const canonical = await store.findCanonical(input);
  if (canonical) return fromCanonical(canonical);
  const existing = await findExisting(store, input);
  return existing ? fromStored(existing, origin, 'existing') : null;
}

async function persist(
  input: CreateLinkInput,
  release: ResolvedRelease,
  query: string,
  kind: 'track' | 'artist'
): Promise<LinkResult> {
  const providerKey = release.providerKey;
  const reused = await reuseOrCanonical(input.store, input.origin, {
    isrc: release.isrc,
    providerKey,
  });
  if (reused) return reused;
  if (release.providers.length === 0) return failure('NOT_FOUND', input.origin);

  const now = input.now ?? new Date();
  if (!input.actor.userId) {
    const hash = input.actor.anonymousSubjectHash;
    if (!hash) return failure('UPSTREAM_FAILURE', input.origin);
    const used = await input.store.countAnonymousSince(hash, monthStart(now));
    if (used >= FREE_LINKS_PER_MONTH) {
      return failure('LIMIT_REACHED', input.origin);
    }
  }

  const allocate = input.allocateCode ?? allocateLinkCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const inserted = await input.store.insert({
      code: allocate(),
      query,
      kind,
      title: release.title,
      artistName: release.artist,
      artworkUrl: release.artworkUrl,
      providers: release.providers,
      isrc: release.isrc,
      upc: release.upc,
      providerKey,
      createdByUserId: input.actor.userId,
      anonymousSubjectHash: input.actor.userId
        ? null
        : input.actor.anonymousSubjectHash,
    });
    if (inserted !== 'conflict') {
      return fromStored(inserted, input.origin, 'created');
    }
    const again = await reuseOrCanonical(input.store, input.origin, {
      isrc: release.isrc,
      providerKey,
    });
    if (again) return again;
  }
  return failure('UPSTREAM_FAILURE', input.origin);
}

function providerKeyFromRelease(
  release: ResolvedRelease,
  fallback: string | null
) {
  return (
    release.providerKey ??
    fallback ??
    providerKeyForUrl(release.providers[0]?.url ?? '') ??
    null
  );
}

/**
 * One input, one Jovie link. Repeats return the stored link and do not
 * call the resolver again. Anonymous callers share a monthly cap. A resolved
 * Jovie session is recorded as the creator and is still unclaimed: opening
 * claimUrl does not create an account or prove the person is the artist.
 */
export async function createSmartLink(
  input: CreateLinkInput
): Promise<LinkResult> {
  const parsed = parseLinkQuery(input.query, input.kind);
  if (parsed.kind === 'invalid') {
    return failure(parsed.code, input.origin);
  }

  if (parsed.kind === 'track' && parsed.source !== 'text') {
    const reused = await reuseOrCanonical(input.store, input.origin, {
      isrc: parsed.source === 'isrc' ? parsed.isrc : null,
      providerKey: parsed.source === 'url' ? parsed.providerKey : null,
    });
    if (reused) return reused;
  }

  if (parsed.kind === 'artist' && parsed.source === 'url') {
    const providerKey = providerKeyForUrl(parsed.url);
    if (providerKey) {
      const reused = await reuseOrCanonical(input.store, input.origin, {
        providerKey,
      });
      if (reused) return reused;
    }
  }

  if (parsed.kind === 'artist') {
    const resolved = await input.resolver.resolveArtist(
      parsed.source === 'url' ? parsed.url : parsed.query
    );
    if (!resolved.ok) return failure(resolved.code, input.origin);
    if (resolved.value.status === 'choices')
      return choices(resolved.value.candidates);
    return persist(
      input,
      {
        ...resolved.value.release,
        providerKey: providerKeyFromRelease(
          resolved.value.release,
          parsed.source === 'url' ? providerKeyForUrl(parsed.url) : null
        ),
      },
      input.query.trim(),
      'artist'
    );
  }

  if (parsed.source === 'url') {
    const resolved = await input.resolver.resolveTrackUrl(parsed.url);
    if (!resolved.ok) return failure(resolved.code, input.origin);
    return persist(
      input,
      {
        ...resolved.value,
        providerKey: providerKeyFromRelease(resolved.value, parsed.providerKey),
      },
      input.query.trim(),
      'track'
    );
  }

  if (parsed.source === 'isrc') {
    const resolved = await input.resolver.resolveIsrc(parsed.isrc);
    if (!resolved.ok) return failure(resolved.code, input.origin);
    return persist(
      input,
      {
        ...resolved.value,
        isrc: resolved.value.isrc ?? parsed.isrc,
        providerKey: providerKeyFromRelease(resolved.value, null),
      },
      input.query.trim(),
      'track'
    );
  }

  const found = await input.resolver.searchTracks(parsed.query);
  if (!found.ok) return failure(found.code, input.origin);
  if (found.value.length === 0) return failure('NOT_FOUND', input.origin);
  if (found.value.length > 1 || !found.value[0]?.url) {
    return choices(found.value);
  }
  const only = found.value[0];
  const resolved = await input.resolver.resolveTrackUrl(only.url!);
  if (!resolved.ok) return failure(resolved.code, input.origin);
  return persist(
    input,
    {
      ...resolved.value,
      title: resolved.value.title ?? only.name,
      artist: resolved.value.artist ?? only.artist,
      providerKey: providerKeyFromRelease(
        resolved.value,
        providerKeyForUrl(only.url!)
      ),
    },
    input.query.trim(),
    'track'
  );
}
