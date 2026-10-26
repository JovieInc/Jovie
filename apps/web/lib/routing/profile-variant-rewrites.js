/**
 * Edge rewrites that give the public profile a bounded set of ISR variants,
 * so the FIRST HTML already carries the featured item chosen for the visitor
 * (no client swap after paint).
 *
 * A request to `/:username` is rewritten, before the page cache lookup, to
 * `/:username/profile-variant-render/<key>/__profile-variant` when a request
 * signal changes the one-right-thing decision:
 *
 * - arrived from a streaming service: Referer host or utm_source
 * - edge country in VARIANT_COUNTRIES (header x-vercel-ip-country)
 * - returning marker cookie `jv_returning` (set client-side only after consent)
 *
 * Key shape: `<d|o><r|n>-<CC|xx>`. At most 2 x 2 x 14 = 56 variants per
 * profile, each cached like the canonical page (revalidate 3600). Requests
 * with none of these signals keep the canonical page. Stays CommonJS for
 * next.config; types and decoding live in `one-right-thing/variant.ts`.
 */

const PROFILE_VARIANT_MARKER = '__profile-variant';
const RETURNING_COOKIE = 'jv_returning';

// Keep the unmatched-country behavior bounded: only these markets get their
// own variant, everything else shares the `xx` variant.
const VARIANT_COUNTRIES = [
  'US',
  'GB',
  'DE',
  'FR',
  'CA',
  'AU',
  'BR',
  'MX',
  'JP',
  'NL',
  'SE',
  'ES',
  'IT',
];

// Hosts must stay aligned with HOST_TO_NAME dsp entries in visitor-signals.ts
// (enforced by profile-variant.test.ts).
const DSP_REFERRER_PATTERN =
  '^https?://([a-z0-9-]+\\.)*(spotify\\.com|spotify\\.link|music\\.apple\\.com|itunes\\.apple\\.com|music\\.youtube\\.com|deezer\\.com|tidal\\.com|music\\.amazon\\.[a-z.]+|soundcloud\\.com|bandcamp\\.com)(/.*)?$';
const DSP_UTM_PATTERN =
  '^(spotify|apple_music|apple|applemusic|youtube_music|deezer|tidal|amazon_music|soundcloud|bandcamp)$';

function buildProfileVariantRewrites() {
  const countryHas = {
    type: 'header',
    key: 'x-vercel-ip-country',
    value: `(?<cc>${VARIANT_COUNTRIES.join('|')})`,
  };
  const dspSignals = [
    [{ type: 'header', key: 'referer', value: DSP_REFERRER_PATTERN }],
    [{ type: 'query', key: 'utm_source', value: DSP_UTM_PATTERN }],
  ];
  const rules = [];
  for (const returning of [true, false]) {
    const returningHas = returning
      ? [{ type: 'cookie', key: RETURNING_COOKIE, value: '1' }]
      : [];
    const returningMissing = returning
      ? []
      : [{ type: 'cookie', key: RETURNING_COOKIE }];
    const r = returning ? 'r' : 'n';
    // Most specific first: first matching rewrite wins.
    for (const dsp of dspSignals) {
      rules.push({
        has: [...returningHas, ...dsp, countryHas],
        missing: returningMissing,
        key: `d${r}-:cc`,
      });
      rules.push({
        has: [...returningHas, ...dsp],
        missing: returningMissing,
        key: `d${r}-xx`,
      });
    }
    rules.push({
      has: [...returningHas, countryHas],
      missing: returningMissing,
      key: `o${r}-:cc`,
    });
    if (returning) {
      rules.push({ has: returningHas, missing: [], key: 'or-xx' });
    }
  }
  return rules.map(rule => ({
    source: '/:username',
    has: rule.has,
    ...(rule.missing.length > 0 ? { missing: rule.missing } : {}),
    destination: `/:username/profile-variant-render/${rule.key}/${PROFILE_VARIANT_MARKER}`,
  }));
}

module.exports = {
  PROFILE_VARIANT_MARKER,
  RETURNING_COOKIE,
  VARIANT_COUNTRIES,
  DSP_REFERRER_PATTERN,
  DSP_UTM_PATTERN,
  buildProfileVariantRewrites,
};
