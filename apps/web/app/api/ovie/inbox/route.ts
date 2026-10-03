import { NextResponse } from 'next/server';
import { authorizeSummerControl } from '@/lib/ovie/control';
import { buildOvieInbox } from '@/lib/ovie/inbox.server';
import { resolveOviePrincipal } from '@/lib/ovie/mcp/principal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store' } as const;

/** Founder Ovie Inbox: pending Summer cards + Design Lab taste, and history. */
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
      { error: gate.status === 401 ? 'unauthorized' : 'forbidden' },
      { status: gate.status, headers }
    );
  }

  return NextResponse.json(await buildOvieInbox(), { headers });
}
