// Distinctive tokens used to attribute unit/integration/E2E files to a
// risk-register surface. Single-file globs (proxy.ts) must yield stem tokens
// (`proxy`), not extension-qualified ones (`proxy.ts`), or E2E inventory
// stays at 0 forever.
//
// Matching is scoped to the surface's apps/<pkg>/ prefix and uses symmetric
// path-token boundaries (`/`, `.`, `_`, `-`) so bare ids like `proxy` cannot
// hit apps/ovie/proxy.test.ts, while kebab/snake inventory names still match.

/** @type {ReadonlySet<string>} */
export const GENERIC_PATH_SEGMENTS = Object.freeze(
  new Set([
    'apps',
    'web',
    'app',
    'api',
    'lib',
    'src',
    'tests',
    'test',
    'unit',
    'integration',
    'e2e',
    'spec',
    'dev',
    'auth',
    'utils',
    'helpers',
    'config',
    'route',
    'routes',
    'page',
    'pages',
    'index',
    'common',
    'components',
  ])
);

const SOURCE_EXT = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/u;

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * App package prefix from a surface glob (`apps/web/proxy.ts` → `apps/web/`).
 * @param {{ glob: string }} surface
 * @returns {string | null}
 */
export function surfaceAppPrefix(surface) {
  const pathOnly = surface.glob.split(':')[0].replace(/\/\*\*?$/u, '');
  const parts = pathOnly.replaceAll('\\', '/').split('/');
  if (parts[0] === 'apps' && parts[1]) {
    return `apps/${parts[1].toLowerCase()}/`;
  }
  return null;
}

/**
 * @param {{ id: string, glob: string }} surface
 * @returns {string[]}
 */
export function extractSurfaceTokens(surface) {
  const pathOnly = surface.glob.split(':')[0].replace(/\/\*\*?$/u, '');
  const segments = pathOnly
    .split('/')
    .map(s => s.toLowerCase().replace(/[()]/gu, '').replace(SOURCE_EXT, ''))
    .filter(
      s =>
        s.length > 0 &&
        !GENERIC_PATH_SEGMENTS.has(s) &&
        !s.startsWith('[') &&
        !s.includes('*')
    );

  /** @type {Set<string>} */
  const tokens = new Set();
  if (segments.length > 0) {
    tokens.add(segments[segments.length - 1]);
    if (segments.length >= 2) {
      tokens.add(segments.slice(-2).join('/'));
      tokens.add(segments.slice(-2).join('-'));
    }
  }
  // Hyphenated ids stay; also keep short distinctive ids like `proxy`.
  if (surface.id.includes('-') || !GENERIC_PATH_SEGMENTS.has(surface.id)) {
    tokens.add(surface.id.toLowerCase());
  }
  return Array.from(tokens);
}

/**
 * True when `testPath` belongs to `surface`: same apps/<pkg>/ tree, and a
 * token matches as a path segment (or multi-segment substring for `a/b`).
 * @param {string} testPath
 * @param {{ id: string, glob: string }} surface
 * @param {readonly string[]} [tokens]
 * @returns {boolean}
 */
export function testPathMatchesSurface(
  testPath,
  surface,
  tokens = extractSurfaceTokens(surface)
) {
  const path = String(testPath).toLowerCase().replaceAll('\\', '/');
  const prefix = surfaceAppPrefix(surface);
  if (prefix && !path.startsWith(prefix)) return false;

  return tokens.some(token => {
    if (token.includes('/')) {
      return path.includes(token);
    }
    // Symmetric path-token boundaries: token may sit between `/`, `.`, `_`, or
    // `-` (kebab/snake inventory names like middleware-proxy.test.ts). Still
    // rejects mid-word substrings (approxy). Cross-app false hits stay blocked
    // by the apps/<pkg>/ prefix above.
    return new RegExp(
      `(?:^|[/._-])${escapeRegex(token)}(?:$|[./_-])`,
      'u'
    ).test(path);
  });
}
