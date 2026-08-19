import { NextResponse } from 'next/server';
import { respondToOviePending } from '@/lib/ovie/landing-http';
import { resolveOviePrincipal } from '@/lib/ovie/mcp/principal';
import { getOvieOperatingStore } from '@/lib/ovie/mcp/runtime-store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const principal = await resolveOviePrincipal(request);
  return respondToOviePending({
    authenticated: principal.authenticated,
    isAdmin: principal.isAdmin,
    store: getOvieOperatingStore(),
  });
}
