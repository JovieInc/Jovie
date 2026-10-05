import { NextResponse } from 'next/server';
import { authorizeSummerControl } from '@/lib/ovie/control';
import { readOvieInbox } from '@/lib/ovie/inbox.server';
import { resolveOviePrincipal } from '@/lib/ovie/mcp/principal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store' } as const;

/** One authorized projection; mutations retain their domain authorization. */
export async function GET(request: Request): Promise<NextResponse> {
  let principal;
  try {
    principal = await resolveOviePrincipal(request);
  } catch {
    return NextResponse.json(
      { error: 'inbox_unavailable' },
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
    return NextResponse.json(await readOvieInbox(), {
      headers,
    });
  } catch {
    return NextResponse.json(
      { error: 'inbox_unavailable' },
      { status: 503, headers }
    );
  }
}
