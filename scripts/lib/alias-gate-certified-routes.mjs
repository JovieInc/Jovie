#!/usr/bin/env node
/**
 * Split the production public-profile alias perf gate into blocking and
 * warning routes (Tim 2026-10-31): a route blocks a release only when its
 * golden-path surface holds a current production certification. Which
 * surfaces are certified comes from the certification ledger
 * (GET /api/internal/ovie/golden-path-evidence, the same ledger the Ovie
 * certification inventory reads), never from a hand-kept list. As surfaces
 * certify the blocking set grows on its own; an unreadable ledger certifies
 * nothing, so the gate degrades to warnings and never stalls a release.
 *
 * Usage: node alias-gate-certified-routes.mjs <route-id>... < ledger-response.json
 * Prints GitHub output lines: blocking, warning, certification.
 */
import { pathToFileURL } from 'node:url';

export const CERTIFIED_SCHEMA = 'jovie.prod-golden-path-certified/v1';

/** Which golden-path surface (prod-golden-path-ledger.ts) owns each gate route. */
export const ALIAS_ROUTE_SURFACE = Object.freeze({
  'public-profile-listen': 'public-profile',
  'public-profile-music': 'public-profile',
  'public-profile-releases': 'public-profile',
  'public-profile-subscribe': 'public-profile',
  'public-profile-tip': 'public-profile',
  'public-profile-tour': 'public-profile',
});

/** Parse the ledger response; anything unexpected certifies nothing. */
export function readCertifiedSurfaces(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { certification: 'unavailable', surfaces: new Set() };
  }
  if (
    !body ||
    body.schema !== CERTIFIED_SCHEMA ||
    !Array.isArray(body.certifiedSurfaces) ||
    !body.certifiedSurfaces.every(id => typeof id === 'string')
  ) {
    return { certification: 'unavailable', surfaces: new Set() };
  }
  return {
    certification: body.ledger === 'present' ? 'present' : 'missing',
    surfaces: new Set(body.certifiedSurfaces),
  };
}

export function splitAliasRoutes(routes, certifiedSurfaces) {
  const blocking = [];
  const warning = [];
  for (const route of routes) {
    const surface = ALIAS_ROUTE_SURFACE[route];
    if (!surface)
      throw new Error(`alias gate route ${route} has no golden-path surface`);
    (certifiedSurfaces.has(surface) ? blocking : warning).push(route);
  }
  return { blocking, warning };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const routes = process.argv.slice(2);
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const { certification, surfaces } = readCertifiedSurfaces(
    Buffer.concat(chunks).toString('utf8')
  );
  const { blocking, warning } = splitAliasRoutes(routes, surfaces);
  process.stdout.write(
    `certification=${certification}\nblocking=${blocking.join(' ')}\nwarning=${warning.join(' ')}\n`
  );
}
