import 'server-only';
import { NextResponse } from 'next/server';

/** Mesh API responses are operator-only and must never be cached. */
export const MESH_NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store',
} as const;

export function meshJsonNoStore(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: MESH_NO_STORE_HEADERS });
}
