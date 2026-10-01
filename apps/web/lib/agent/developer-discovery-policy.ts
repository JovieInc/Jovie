/**
 * Developer-discovery policy (JOV-6265).
 *
 * Guards the agreement between the human `/developers` page and the
 * machine `/llms.txt` developer resources, and rejects false write-API
 * claims and internal-surface leaks in public agent guidance. Pure
 * functions only — the surfaces themselves stay owned by `/developers`,
 * `/llms.txt`, `/llms-full.txt`, and the shared company-identity policy
 * (JOV-6261). This module adds no second documentation system.
 */

/**
 * Static jov.ie developer surfaces that both the `/developers` page and
 * the `/llms.txt` developer resources must list. Dynamic templates
 * (`{username}`), external docs, and the founder-only Ovie control are
 * intentionally out of scope: they are not static public developer routes.
 */
export const STATIC_DEVELOPER_SURFACE_PATHS = [
  '/api/v1',
  '/openapi.json',
  '/llms.txt',
  '/llms-full.txt',
  '/cli',
  '/api-versioning',
] as const;

/** Normalizes a resource href to a comparable static path, if it is one. */
function normalizeDeveloperSurfaceHref(href: string): string | null {
  let path = href.trim();
  const originMatch = /^https:\/\/[a-z0-9.-]+jov\.ie(\/.*)?$/i.exec(path);
  if (originMatch) {
    path = originMatch[1] ?? '/';
  } else if (!path.startsWith('/')) {
    return null;
  }
  path = path.split(/[?#]/u)[0] ?? path;
  if (path.length > 1) path = path.replace(/\/+$/u, '');
  return (STATIC_DEVELOPER_SURFACE_PATHS as readonly string[]).includes(path)
    ? path
    : null;
}

/** Extracts the static developer surfaces a machine-guidance body lists. */
export function extractStaticDeveloperSurfaces(
  machineGuidanceBody: string
): string[] {
  return STATIC_DEVELOPER_SURFACE_PATHS.filter(path =>
    new RegExp(
      `https://[a-z0-9.-]+${path.replaceAll('/', '\\/')}(?![\\w/-])`,
      'u'
    ).test(machineGuidanceBody)
  );
}

/**
 * Returns the HTML/Markdown availability disagreements between the
 * `/developers` page resource links and a machine-guidance body: a surface
 * one surface lists that the other omits. Empty means the surfaces agree.
 */
export function findHtmlMarkdownAvailabilityDisagreement(
  pageResourceHrefs: readonly string[],
  machineGuidanceBody: string
): string[] {
  const page = new Set(
    pageResourceHrefs
      .map(href => normalizeDeveloperSurfaceHref(href))
      .filter((path): path is string => path !== null)
  );
  const machine = new Set(extractStaticDeveloperSurfaces(machineGuidanceBody));
  const disagreements: string[] = [];
  for (const path of STATIC_DEVELOPER_SURFACE_PATHS) {
    if (machine.has(path) && !page.has(path)) {
      disagreements.push(`developers page omits ${path}`);
    }
    if (page.has(path) && !machine.has(path)) {
      disagreements.push(`machine guidance omits ${path}`);
    }
  }
  return disagreements;
}

/**
 * Claim patterns that misdescribe the anonymous, read-only public artist
 * API as writable. Real guidance phrases the boundary as a negation
 * ("the public artist API and anonymous MCP tools are read-only"), which
 * none of these patterns match.
 */
const FALSE_WRITE_API_CLAIM_PATTERNS = [
  /\b(?:POST|PUT|PATCH|DELETE)\s+(?:https:\/\/[a-z0-9.-]+)?\/api\/v1\b/iu,
  /\bpublic artist API\b[^.\n]{0,80}\b(?:supports|allows|accepts|enables)\b[^.\n]{0,40}\b(?:writes?|mutations?|POST|PUT|PATCH|DELETE)\b/iu,
  /\b(?:write|create|update|delete|modify)\b[^.\n]{0,60}\b(?:via|through|using)\b[^.\n]{0,40}\bpublic artist API\b/iu,
  /\bpublic artist API\b[^.\n]{0,60}\b(?:writes?|create|update|delete|modify)\b/iu,
] as const;

/** True when text claims write access through the public artist API. */
export function containsFalseWriteApiClaim(text: string): boolean {
  return FALSE_WRITE_API_CLAIM_PATTERNS.some(pattern => pattern.test(text));
}

/** Internal agent/system names that must never appear in public guidance. */
const INTERNAL_SURFACE_NAMES = [
  'Summer',
  'Eve',
  'Hermes',
  'Symphony',
  'gbrain',
] as const;

/** Internal-only routes that must never be advertised as public surfaces. */
const INTERNAL_ROUTE_PATTERNS = [
  /https?:\/\/[a-z0-9.-]*jov\.ie\/(?:hud|investor-portal|app\/|api\/symphony|api\/summer|api\/eve)\b/iu,
] as const;

/**
 * True when public guidance leaks an internal-only surface: an internal
 * agent/system name or an internal-only route presented as reachable.
 * The founder-only Ovie control is deliberately disclosed as founder-only
 * and is not a leak.
 */
export function containsInternalSurfaceLeak(text: string): boolean {
  return (
    INTERNAL_SURFACE_NAMES.some(name =>
      new RegExp(`\\b${name}\\b`, 'u').test(text)
    ) || INTERNAL_ROUTE_PATTERNS.some(pattern => pattern.test(text))
  );
}
