import { NextRequest } from 'next/server';

/**
 * Build a POST NextRequest whose body is intentionally unparseable JSON.
 *
 * Used across route-level unit tests to assert the shared `parseJsonBody`
 * helper surfaces a 400 (and not a 500 + Sentry page) when a client sends a
 * malformed body. Kept in one place so the repro input stays identical
 * across routes and we don't re-derive what "malformed" looks like.
 */
export function malformedJsonRequest(routePath: string): NextRequest {
  return new NextRequest(`http://localhost${routePath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not valid json',
  });
}
