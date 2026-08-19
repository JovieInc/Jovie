import { NextResponse } from 'next/server';
import { respondToOvieLanded } from '@/lib/ovie/landing-http';
import { resolveOviePrincipal } from '@/lib/ovie/mcp/principal';
import { getOvieOperatingStore } from '@/lib/ovie/mcp/runtime-store';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const principal = await resolveOviePrincipal(request);
  const body: unknown = await request.json().catch(() => null);
  const rec =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  return respondToOvieLanded({
    authenticated: principal.authenticated,
    isAdmin: principal.isAdmin,
    store: getOvieOperatingStore(),
    id: typeof rec.id === 'string' ? rec.id : '',
    landed_ref: typeof rec.landed_ref === 'string' ? rec.landed_ref : '',
  });
}
