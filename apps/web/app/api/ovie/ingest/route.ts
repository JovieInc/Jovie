import { NextResponse } from 'next/server';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { authorizeSummerControl } from '@/lib/ovie/control';
import { applyOvieDump } from '@/lib/ovie/ingest';

export async function POST(request: Request): Promise<NextResponse> {
  const entitlements = await getCurrentUserEntitlements();
  const gate = authorizeSummerControl({
    authenticated: entitlements.isAuthenticated,
    isAdmin: entitlements.isAdmin,
  });
  if (!gate.ok) {
    return NextResponse.json({ ok: false }, { status: gate.status });
  }

  const body: unknown = await request.json().catch(() => null);
  const items =
    body &&
    typeof body === 'object' &&
    'items' in body &&
    Array.isArray((body as { items: unknown }).items)
      ? (body as { items: unknown[] }).items.filter(
          (item): item is string => typeof item === 'string'
        )
      : [];

  const receipts = applyOvieDump(items);
  return NextResponse.json({ ok: true, receipts });
}
