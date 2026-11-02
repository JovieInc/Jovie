import { NextResponse } from 'next/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import deferredLaunchEntries from './generated/deferred-launch-entries.json';

/**
 * JOV-8505: runtime enforcement of the artist launch manifest.
 *
 * The generated manifest (docs/product/generated/artist-launch-inventory.json)
 * is the single source of truth; this module serves the entry points classified
 * C ("deferred") through a checked-in projection that
 * `node scripts/artist-launch-contract.mjs --write` regenerates and `--check`
 * verifies. A deferred entry point must have no affordance on any declared
 * discovery or execution channel: launch-scope surfaces and the artist cohort
 * get a bounded 404 before auth or database work, while the implementation and
 * data behind the surface stay intact until it is promoted to B.
 *
 * Server entry points only — never import from client components.
 */

const deferredHandlers: Readonly<Record<string, readonly string[]>> =
  deferredLaunchEntries.handlers;

/** Whether a route handler's manifest classification is C (deferred). */
export function isDeferredLaunchRoute(route: string): boolean {
  return Object.hasOwn(deferredHandlers, route);
}

/**
 * Bounded refusal for a deferred entry point: a static no-store 404 with a
 * constant body. Pure map lookup, no auth, database, or store work, so the
 * refusal itself cannot be used for enumeration timing or resource abuse.
 * Returns null when the route is not deferred and execution may continue.
 */
export function deferredLaunchRefusal(route: string): Response | null {
  if (!isDeferredLaunchRoute(route)) return null;
  return NextResponse.json(
    { error: 'Not found' },
    { status: 404, headers: NO_STORE_HEADERS }
  );
}
