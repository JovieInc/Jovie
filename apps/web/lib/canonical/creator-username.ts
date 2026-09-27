/**
 * Semantic contract for `creator_profiles.username` / `username_normalized`.
 * JOV-5922 — first concrete adoption of the semantic-contract primitive.
 *
 * The storage type is `text`; format validation (`validateUsernameCore`)
 * alone is not sufficient for canonical admission. This contract layers
 * plausibility rules over the format rules so that values which are
 * structurally text but semantically not a single username — serialized
 * collections, URLs, delimiter-joined handle lists, whitespace/sentence
 * fragments — are quarantined with provenance instead of being written to
 * canon or silently coerced.
 *
 * Plausibility rules are deterministic and script-agnostic: they reject
 * container/URL shapes, not words in any particular language. Legitimate
 * international names are handled upstream by the producer's
 * transliteration into the ASCII handle alphabet; this contract admits the
 * resulting handle, not the display name.
 */

import {
  normalizeUsername,
  validateUsernameCore,
} from '@/lib/validation/username-core';

import {
  type CanonicalProvenance,
  type ContractRejection,
  defineSemanticContract,
} from './semantic-contract';

export const CREATOR_USERNAME_FIELD = 'creator_profiles.username';
export const CREATOR_USERNAME_CONTRACT_VERSION = 1;
export const CREATOR_USERNAME_CONTRACT_OWNER = 'platform-profiles';

/** Stable rejection codes for the creator-username contract. */
export type CreatorUsernameRejectionCode =
  | 'not_a_string'
  | 'empty'
  | 'serialized_collection'
  | 'url_in_value'
  | 'list_delimiters'
  | 'whitespace_fragment'
  | `format:${string}`;

function reject(
  code: CreatorUsernameRejectionCode,
  detail: string
): ContractRejection {
  return { code, detail };
}

/** Matches serialized array/object shapes, e.g. '["foo","bar"]' or '{"a":1}'. */
const SERIALIZED_COLLECTION_PATTERN = /^\s*[[{]/;
/** Matches URL-like values: schemes, scheme-relative, or leading www. */
const URL_PATTERN = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)/i;
/** Delimiter-joined candidate sets: 'foo,bar', 'foo | bar', 'foo;bar'. */
const LIST_DELIMITER_PATTERN = /[,;|]/;

export const CREATOR_USERNAME_CONTRACT = defineSemanticContract<string>({
  field: CREATOR_USERNAME_FIELD,
  version: CREATOR_USERNAME_CONTRACT_VERSION,
  owner: CREATOR_USERNAME_CONTRACT_OWNER,
  evaluate(raw: unknown, _provenance: CanonicalProvenance) {
    if (typeof raw !== 'string') {
      return {
        ok: false,
        rejections: [
          reject(
            'not_a_string',
            `username must be a single string, got ${
              raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw
            }`
          ),
        ],
      };
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      return {
        ok: false,
        rejections: [reject('empty', 'username is empty or whitespace only')],
      };
    }

    // Plausibility gates run before format validation so a rejection is
    // attributed to the correct defect class (a serialized list is not
    // merely a bad character).
    if (SERIALIZED_COLLECTION_PATTERN.test(trimmed)) {
      return {
        ok: false,
        rejections: [
          reject(
            'serialized_collection',
            'username looks like a serialized array/object, not a single handle'
          ),
        ],
      };
    }
    if (URL_PATTERN.test(trimmed)) {
      return {
        ok: false,
        rejections: [
          reject(
            'url_in_value',
            'username looks like a URL, not a bare handle'
          ),
        ],
      };
    }
    if (LIST_DELIMITER_PATTERN.test(trimmed)) {
      return {
        ok: false,
        rejections: [
          reject(
            'list_delimiters',
            'username contains list/aggregation delimiters (comma, pipe, or semicolon)'
          ),
        ],
      };
    }
    if (/\s/.test(trimmed)) {
      return {
        ok: false,
        rejections: [
          reject(
            'whitespace_fragment',
            'username contains internal whitespace or a sentence fragment'
          ),
        ],
      };
    }

    const format = validateUsernameCore(trimmed);
    if (!format.isValid) {
      return {
        ok: false,
        rejections: [
          reject(
            `format:${format.errorCode ?? 'INVALID'}`,
            format.error ?? 'username fails the canonical format rules'
          ),
        ],
      };
    }

    return { ok: true, canonical: normalizeUsername(trimmed) };
  },
});

/** Admit a candidate username observation. Pure; safe to call anywhere. */
export function admitCreatorUsername(
  raw: unknown,
  provenance: CanonicalProvenance
) {
  return CREATOR_USERNAME_CONTRACT.admit(raw, provenance);
}
