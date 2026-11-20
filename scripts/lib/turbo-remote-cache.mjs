// Local / Gem selection of the Cloudflare R2 Turbo remote cache (read-only).
//
// CI selects the cache in .github/actions/setup-node-pnpm ("Select Turbo
// remote cache"), which exports TURBO_API, so this module leaves CI alone.
// Local agents and Gem preflight get the read-only token only: the Worker
// rejects PUTs from it (infra/turbo-cache), so a laptop can never write an
// artifact CI would replay.

/** Same injection as the composite action's perl one-liner; keep them equal. */
export const SIGNATURE_STANZA = '\n  "remoteCache": { "signature": true },';

/** @param {string} turboJsonText root turbo.json (JSONC) */
export function signedTurboJson(turboJsonText) {
  const at = turboJsonText.indexOf('{');
  if (at < 0) throw new Error('turbo.json has no top-level object');
  return `${turboJsonText.slice(0, at + 1)}${SIGNATURE_STANZA}${turboJsonText.slice(at + 1)}`;
}

/**
 * @param {{ url?: string, roToken?: string, signatureKey?: string, signedJsonPath?: string }} cf
 * @returns {Record<string, string> | null} env to merge, or null when the
 *   Cloudflare cache is not configured
 */
export function cloudflareReadOnlyEnv(cf) {
  if (!cf.url || !cf.roToken) return null;
  /** @type {Record<string, string>} */
  const out = {
    TURBO_API: cf.url.replace(/\/+$/, ''),
    TURBO_TOKEN: cf.roToken,
    TURBO_TEAM: 'jovie',
    TURBO_CACHE: 'local:rw,remote:r',
  };
  if (cf.signatureKey && cf.signedJsonPath) {
    out.TURBO_ROOT_TURBO_JSON = cf.signedJsonPath;
    out.TURBO_REMOTE_CACHE_SIGNATURE_KEY = cf.signatureKey;
  }
  return out;
}

/** Doppler (jovie-web/dev) names; identical to the GitHub secret names. */
export const CF_SECRET_NAMES = /** @type {const} */ ([
  'CF_TURBO_CACHE_URL',
  'CF_TURBO_CACHE_RO_TOKEN',
  'CF_TURBO_SIGNATURE_KEY',
]);
