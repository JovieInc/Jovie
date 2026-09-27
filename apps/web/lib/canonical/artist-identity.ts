/**
 * Semantic contract for `artists` registry provider-backed identity.
 * JOV-6543 — adoption of the JOV-5922 semantic-contract primitive for artist
 * identity admission.
 *
 * An artist observation (provider import, credit parse, reconciliation,
 * owner edit, seed, or repair) is not canonical just because it fills the
 * storage columns. Identity is resolved by provider namespace + provider ID,
 * never by display name or handle: two different artists can share a name,
 * and an implausible provider ID must be quarantined instead of becoming a
 * canonical identity binding or an invented `sameAs` link.
 *
 * The contract admits the identity observation { name, provider IDs } and
 * returns the canonical trimmed value. Uniqueness, merge authorization, and
 * profile binding remain producer/transaction concerns (see
 * `findOrCreateArtist` and `lockSpotifyProfileIdentity`); the contract only
 * decides whether the observation is a plausible single identity.
 */

import {
  type CanonicalProvenance,
  type ContractRejection,
  defineSemanticContract,
} from './semantic-contract';

export const ARTIST_IDENTITY_FIELD = 'artists.provider_identity';
export const ARTIST_IDENTITY_CONTRACT_VERSION = 1;
export const ARTIST_IDENTITY_CONTRACT_OWNER = 'platform-profiles';

export type ArtistIdentityRejectionCode =
  | 'not_an_object'
  | 'name_not_a_string'
  | 'empty_name'
  | 'serialized_collection'
  | 'url_in_name'
  | 'provider_id_not_a_string'
  | 'implausible_provider_id';

/** Canonical artist identity observation admitted by the contract. */
export interface CanonicalArtistIdentity {
  readonly name: string;
  readonly spotifyId?: string;
  readonly appleMusicId?: string;
  readonly musicbrainzId?: string;
  readonly deezerId?: string;
}

function reject(
  code: ArtistIdentityRejectionCode,
  detail: string
): ContractRejection {
  return { code, detail };
}

/** Spotify artist IDs are always 22 base62 characters. */
const SPOTIFY_ID_PATTERN = /^[0-9A-Za-z]{22}$/;
/** MusicBrainz artist MBIDs are RFC 4122 UUIDs. */
const MUSICBRAINZ_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Serialized array/object shapes, e.g. '["a","b"]' or '{"id":"x"}'. */
const SERIALIZED_COLLECTION_PATTERN = /^\s*[[{]/;
/** URL-like values: schemes, scheme-relative, or leading www. */
const URL_PATTERN = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)/i;

interface ProviderIdSpec {
  readonly key: 'spotifyId' | 'appleMusicId' | 'musicbrainzId' | 'deezerId';
  readonly namespace: string;
  readonly pattern?: RegExp;
}

const PROVIDER_ID_SPECS: readonly ProviderIdSpec[] = [
  { key: 'spotifyId', namespace: 'spotify', pattern: SPOTIFY_ID_PATTERN },
  { key: 'appleMusicId', namespace: 'apple_music' },
  {
    key: 'musicbrainzId',
    namespace: 'musicbrainz',
    pattern: MUSICBRAINZ_ID_PATTERN,
  },
  { key: 'deezerId', namespace: 'deezer' },
];

function admitProviderId(
  spec: ProviderIdSpec,
  value: unknown
): { ok: true; id: string } | { ok: false; rejection: ContractRejection } {
  if (typeof value !== 'string') {
    return {
      ok: false,
      rejection: reject(
        'provider_id_not_a_string',
        `${spec.namespace} id must be a string, got ${
          Array.isArray(value) ? 'array' : typeof value
        }`
      ),
    };
  }
  const trimmed = value.trim();
  if (
    !trimmed ||
    /\s/.test(trimmed) ||
    URL_PATTERN.test(trimmed) ||
    SERIALIZED_COLLECTION_PATTERN.test(trimmed) ||
    (spec.pattern && !spec.pattern.test(trimmed))
  ) {
    return {
      ok: false,
      rejection: reject(
        'implausible_provider_id',
        `${spec.namespace} id '${trimmed.slice(0, 64)}' is not a plausible provider identifier`
      ),
    };
  }
  return { ok: true, id: trimmed };
}

export const ARTIST_IDENTITY_CONTRACT =
  defineSemanticContract<CanonicalArtistIdentity>({
    field: ARTIST_IDENTITY_FIELD,
    version: ARTIST_IDENTITY_CONTRACT_VERSION,
    owner: ARTIST_IDENTITY_CONTRACT_OWNER,
    evaluate(raw: unknown, _provenance: CanonicalProvenance) {
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return {
          ok: false,
          rejections: [
            reject(
              'not_an_object',
              'artist identity must be an object of { name, provider ids }'
            ),
          ],
        };
      }

      const input = raw as Record<string, unknown>;
      const rejections: ContractRejection[] = [];

      if (typeof input.name !== 'string') {
        rejections.push(
          reject(
            'name_not_a_string',
            `artist name must be a string, got ${
              input.name === null
                ? 'null'
                : Array.isArray(input.name)
                  ? 'array'
                  : typeof input.name
            }`
          )
        );
      } else {
        const name = input.name.trim();
        if (!name) {
          rejections.push(
            reject('empty_name', 'artist name is empty or whitespace only')
          );
        } else if (SERIALIZED_COLLECTION_PATTERN.test(name)) {
          rejections.push(
            reject(
              'serialized_collection',
              'artist name looks like a serialized array/object, not a single name'
            )
          );
        } else if (URL_PATTERN.test(name)) {
          rejections.push(
            reject(
              'url_in_name',
              'artist name looks like a URL, not a display name'
            )
          );
        }
      }

      const canonical: Record<string, string> = {};
      for (const spec of PROVIDER_ID_SPECS) {
        const value = input[spec.key];
        if (value === undefined || value === null || value === '') continue;
        const admitted = admitProviderId(spec, value);
        if (!admitted.ok) {
          rejections.push(admitted.rejection);
        } else {
          canonical[spec.key] = admitted.id;
        }
      }

      if (rejections.length > 0) {
        return { ok: false, rejections };
      }

      return {
        ok: true,
        canonical: {
          name: (input.name as string).trim(),
          ...canonical,
        },
      };
    },
  });

/** Admit an artist identity observation. Pure; safe to call anywhere. */
export function admitArtistIdentity(
  raw: unknown,
  provenance: CanonicalProvenance
) {
  return ARTIST_IDENTITY_CONTRACT.admit(raw, provenance);
}
