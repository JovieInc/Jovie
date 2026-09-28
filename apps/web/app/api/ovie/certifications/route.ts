import { NextResponse } from 'next/server';
import { readOvieCertificationInventory } from '@/lib/ovie/certifications/inventory.server';
import { authorizeSummerControl } from '@/lib/ovie/control';
import { resolveOviePrincipal } from '@/lib/ovie/mcp/principal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store' } as const;

/**
 * One read over every certification domain the kernel knows. Each domain
 * reports connected / empty / not_connected / error, so an unconnected
 * domain is never presented as a certified zero (`universal: false`).
 */
export async function GET(request: Request): Promise<NextResponse> {
  let principal;
  try {
    principal = await resolveOviePrincipal(request);
  } catch {
    return NextResponse.json(
      { error: 'certification_inventory_unavailable' },
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
    return NextResponse.json(await readOvieCertificationInventory(), {
      headers,
    });
  } catch {
    return NextResponse.json(
      { error: 'certification_inventory_unavailable' },
      { status: 503, headers }
    );
  }
}
