import { NextResponse } from 'next/server';
import { authorizeSummerControl } from '@/lib/ovie/control';
import { resolveOviePrincipal } from '@/lib/ovie/mcp/principal';

const headers = { 'Cache-Control': 'private, no-store' } as const;

/**
 * Admin-only GET over an Ovie read: bearer principal resolution and the
 * Summer-control gate, then `read`. Admin-only and never cached; failures
 * report `unavailableError` at 503 rather than a fake zero payload.
 */
export function ovieAdminReadRoute(
  unavailableError: string,
  read: () => Promise<unknown>
): (request: Request) => Promise<NextResponse> {
  return async function GET(request: Request): Promise<NextResponse> {
    let principal;
    try {
      principal = await resolveOviePrincipal(request);
    } catch {
      return NextResponse.json(
        { error: unavailableError },
        { status: 503, headers }
      );
    }
    const gate = authorizeSummerControl(principal);
    if (!gate.ok) {
      return NextResponse.json(
        { error: 'forbidden' },
        { status: gate.status, headers }
      );
    }

    try {
      return NextResponse.json(await read(), { headers });
    } catch {
      return NextResponse.json(
        { error: unavailableError },
        { status: 503, headers }
      );
    }
  };
}
