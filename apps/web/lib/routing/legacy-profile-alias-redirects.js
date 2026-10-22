/**
 * Edge redirects for legacy profile deep links (`/dualipa/listen`).
 *
 * next.config redirects run before the Node proxy, so the common content miss
 * never pays the regional function hop that blew the JOV-8338 alias budget.
 * A real release, rename, or unpublished collision keeps its public URL: the
 * mode page corrects via `jovie_alias_content`, and `?alias-content=1` still
 * reaches the catch-all resolver.
 */

const LEGACY_PROFILE_ALIAS_CONTENT_COOKIE = 'jovie_alias_content';
const LEGACY_PROFILE_ALIAS_HASH_KEY = 'alias';
const LEGACY_PROFILE_ALIAS_CONTENT_QUERY = 'alias-content';
const LEGACY_PROFILE_ALIAS_HOLD_MAX_AGE_SECONDS = 300;

// Two-segment filesystem routes whose second segment is an alias. Redirects
// run before those files, so the username pattern must not match these roots.
const LEGACY_PROFILE_ALIAS_RESERVED_ROOTS = ['app', 'api', 'investor-portal'];

// Slug → profile mode. Keep aligned with LEGACY_PROFILE_MODE_BY_SLUG.
const LEGACY_PROFILE_MODE_ALIAS_MODES = [
  ['listen', 'listen'],
  ['music', 'listen'],
  ['releases', 'releases'],
  ['subscribe', 'subscribe'],
  ['tip', 'pay'],
  ['tour', 'tour'],
  ['shows', 'tour'],
  ['events', 'tour'],
];

const LEGACY_PROFILE_ALIAS_SLUGS = new Set(
  LEGACY_PROFILE_MODE_ALIAS_MODES.map(([slug]) => slug)
);

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

function legacyProfileAliasUsernamePattern() {
  const roots = LEGACY_PROFILE_ALIAS_RESERVED_ROOTS.map(
    root => `${root}/`
  ).join('|');
  return `:username((?!${roots})[^/]+)`;
}

function legacyProfileAliasBypass() {
  return [
    { type: 'query', key: LEGACY_PROFILE_ALIAS_CONTENT_QUERY },
    { type: 'cookie', key: LEGACY_PROFILE_ALIAS_CONTENT_COOKIE },
  ];
}

function legacyProfileAliasRedirects() {
  const username = legacyProfileAliasUsernamePattern();
  const bypass = legacyProfileAliasBypass();
  return LEGACY_PROFILE_MODE_ALIAS_MODES.flatMap(([alias, mode]) => {
    const source = `/${username}/${alias}`;
    return [
      {
        source,
        has: [
          {
            type: 'query',
            key: 'source',
            value: '^(?<profileSource>link|qr)$',
          },
        ],
        missing: bypass,
        destination: `/:username?mode=${mode}&source=:profileSource#${LEGACY_PROFILE_ALIAS_HASH_KEY}=${alias}`,
        permanent: false,
      },
      {
        source,
        missing: [...bypass, { type: 'query', key: 'source' }],
        destination: `/:username?mode=${mode}#${LEGACY_PROFILE_ALIAS_HASH_KEY}=${alias}`,
        permanent: false,
      },
    ];
  });
}

function isLegacyProfileAliasSlug(slug) {
  return LEGACY_PROFILE_ALIAS_SLUGS.has(slug);
}

function readLegacyAliasHash(hash) {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const alias = new URLSearchParams(raw).get(LEGACY_PROFILE_ALIAS_HASH_KEY);
  if (!alias || !isLegacyProfileAliasSlug(alias)) return null;
  return alias;
}

function buildLegacyAliasHoldCookie(username, alias, secure) {
  if (!SAFE_SEGMENT.test(username) || !isLegacyProfileAliasSlug(alias)) {
    return null;
  }
  const secureAttribute = secure ? '; Secure' : '';
  return `${LEGACY_PROFILE_ALIAS_CONTENT_COOKIE}=1; Path=/${username}/${alias}; Max-Age=${LEGACY_PROFILE_ALIAS_HOLD_MAX_AGE_SECONDS}; SameSite=Lax${secureAttribute}`;
}

function isSafeRenamedAliasLocation(location) {
  return /^\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(location);
}

module.exports = {
  LEGACY_PROFILE_ALIAS_CONTENT_COOKIE,
  LEGACY_PROFILE_ALIAS_CONTENT_QUERY,
  LEGACY_PROFILE_ALIAS_HASH_KEY,
  LEGACY_PROFILE_ALIAS_HOLD_MAX_AGE_SECONDS,
  LEGACY_PROFILE_ALIAS_RESERVED_ROOTS,
  LEGACY_PROFILE_MODE_ALIAS_MODES,
  buildLegacyAliasHoldCookie,
  isLegacyProfileAliasSlug,
  isSafeRenamedAliasLocation,
  legacyProfileAliasRedirects,
  readLegacyAliasHash,
};
