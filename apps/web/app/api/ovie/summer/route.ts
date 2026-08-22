import { NextResponse } from 'next/server';
import { resolveOviePrincipal } from '@/lib/ovie/mcp/principal';
import { getOvieOperatingStore } from '@/lib/ovie/mcp/runtime-store';
import {
  respondToOvieSummerAction,
  respondToOvieSummerPending,
} from '@/lib/ovie/summer-http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  return respondToOvieSummerPending({
    principal: await resolveOviePrincipal(request),
    store: getOvieOperatingStore(),
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return respondToOvieSummerAction({
    principal: await resolveOviePrincipal(request),
    store: getOvieOperatingStore(),
    body: await request.json().catch(() => null),
  });
}
