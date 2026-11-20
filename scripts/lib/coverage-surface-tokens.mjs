// Distinctive tokens used to attribute unit/integration/E2E files to a
// risk-register surface. Single-file globs (proxy.ts) must yield stem tokens
// (`proxy`), not extension-qualified ones (`proxy.ts`), or E2E inventory
// stays at 0 forever.

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
 * @param {{ id: string, glob: string }} surface
 * @returns {string[]}
 */
export function extractSurfaceTokens(surface) {
  const pathOnly = surface.glob.split(':')[0].replace(/\/\*\*?$/u, '');
  const segments = pathOnly
    .split('/')
    .map(s =>
      s
        .toLowerCase()
        .replace(/[()]/gu, '')
        .replace(SOURCE_EXT, '')
    )
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
