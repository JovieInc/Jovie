import { NextResponse } from 'next/server';
import { authorizeSummerControl } from '@/lib/ovie/control';
import { resolveOviePrincipal } from '@/lib/ovie/mcp/principal';
import { getOvieOperatingStore } from '@/lib/ovie/mcp/runtime-store';
import { applyOvieDump } from '@/lib/ovie/persist';

const headers = { 'Cache-Control': 'private, no-store' } as const;

export async function POST(request: Request): Promise<NextResponse> {
  let gate: ReturnType<typeof authorizeSummerControl>;
  try {
    gate = authorizeSummerControl(await resolveOviePrincipal(request));
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers });
  }
  if (!gate.ok) {
    return NextResponse.json({ ok: false }, { status: gate.status, headers });
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

  const receipts = await applyOvieDump(items, {
    store: getOvieOperatingStore(),
  });
  return NextResponse.json(
    { ok: true, receipts, workerSpawned: false },
    { headers }
  );
}
