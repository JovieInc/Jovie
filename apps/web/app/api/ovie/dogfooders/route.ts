import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { authorizeSummerControl } from '@/lib/ovie/control';
import {
  DogfoodRosterConflictError,
  dogfooderUpsertSchema,
} from '@/lib/ovie/dogfood-roster';
import {
  listDogfooders,
  upsertDogfooder,
} from '@/lib/ovie/dogfood-roster.server';
import { resolveOviePrincipal } from '@/lib/ovie/mcp/principal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/ovie/dogfooders';
const headers = { 'Cache-Control': 'private, no-store' } as const;

function json(body: Readonly<Record<string, unknown>>, status: number) {
  return NextResponse.json(body, { status, headers });
}

async function authorize(request: Request) {
  try {
    const principal = await resolveOviePrincipal(request);
    return authorizeSummerControl(principal);
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const gate = await authorize(request);
  if (!gate) return json({ error: 'dogfood_roster_unavailable' }, 503);
  if (!gate.ok) {
    return json(
      { error: gate.status === 401 ? 'unauthorized' : 'forbidden' },
      gate.status
    );
  }
  try {
    return json({ dogfooders: await listDogfooders() }, 200);
  } catch (error) {
    await captureError('Dogfood roster list failed', error, { route: ROUTE });
    return json({ error: 'dogfood_roster_unavailable' }, 503);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const gate = await authorize(request);
  if (!gate) return json({ error: 'dogfood_roster_unavailable' }, 503);
  if (!gate.ok) {
    return json(
      { error: gate.status === 401 ? 'unauthorized' : 'forbidden' },
      gate.status
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const parsed = dogfooderUpsertSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'invalid_dogfooder' }, 400);

  try {
    return json({ dogfooder: await upsertDogfooder(parsed.data) }, 200);
  } catch (error) {
    if (error instanceof DogfoodRosterConflictError) {
      return json({ error: 'invalid_signal_transition' }, 409);
    }
    await captureError('Dogfood roster upsert failed', error, { route: ROUTE });
    return json({ error: 'dogfood_roster_unavailable' }, 503);
  }
}
