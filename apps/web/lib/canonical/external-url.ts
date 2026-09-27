/**
 * Semantic contract for single external URL fields (e.g. `social_links.url`,
 * provider identity URLs such as `spotify_url`). JOV-5922 — second field
 * type adopting the shared semantic-contract primitive, proving the contract
 * shape is reusable without copying validator logic.
 *
 * Admits exactly one absolute http(s) URL. Concatenated values, delimiter-
 * joined lists, bare handles, and non-http schemes are quarantined.
 */

import {
  type CanonicalProvenance,
  type ContractRejection,
  defineSemanticContract,
} from './semantic-contract';

export const EXTERNAL_URL_FIELD = 'social_links.url';
export const EXTERNAL_URL_CONTRACT_VERSION = 1;
export const EXTERNAL_URL_CONTRACT_OWNER = 'platform-profiles';

export type ExternalUrlRejectionCode =
  | 'not_a_string'
  | 'empty'
  | 'serialized_collection'
  | 'list_delimiters'
  | 'whitespace_fragment'
  | 'not_parseable'
  | 'unsupported_scheme';

function reject(
  code: ExternalUrlRejectionCode,
  detail: string
): ContractRejection {
  return { code, detail };
}

export const EXTERNAL_URL_CONTRACT = defineSemanticContract<string>({
  field: EXTERNAL_URL_FIELD,
  version: EXTERNAL_URL_CONTRACT_VERSION,
  owner: EXTERNAL_URL_CONTRACT_OWNER,
  evaluate(raw: unknown, _provenance: CanonicalProvenance) {
    if (typeof raw !== 'string') {
      return {
        ok: false,
        rejections: [
          reject(
            'not_a_string',
            `url must be a single string, got ${
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
        rejections: [reject('empty', 'url is empty or whitespace only')],
      };
    }
    if (/^\s*[[{]/.test(trimmed)) {
      return {
        ok: false,
        rejections: [
          reject(
            'serialized_collection',
            'url looks like a serialized array/object, not a single URL'
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
            'url contains internal whitespace (possible concatenation)'
          ),
        ],
      };
    }
    if (/[,;|]/.test(trimmed)) {
      return {
        ok: false,
        rejections: [
          reject(
            'list_delimiters',
            'url contains list/aggregation delimiters (comma, pipe, or semicolon)'
          ),
        ],
      };
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return {
        ok: false,
        rejections: [
          reject('not_parseable', 'url is not a parseable absolute URL'),
        ],
      };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        ok: false,
        rejections: [
          reject(
            'unsupported_scheme',
            `url scheme '${parsed.protocol}' is not http(s)`
          ),
        ],
      };
    }

    return { ok: true, canonical: parsed.href };
  },
});

/** Admit a candidate external-URL observation. Pure; safe to call anywhere. */
export function admitExternalUrl(
  raw: unknown,
  provenance: CanonicalProvenance
) {
  return EXTERNAL_URL_CONTRACT.admit(raw, provenance);
}
