import { limitFleetRequest } from '@/lib/actions/fleet/rate-limit';
import { handleSummerFleetEvents } from '@/lib/actions/fleet/summer-http';
import { summerFleetRuntime } from '@/lib/actions/fleet/summer-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Five sequential 15s canonical reads plus authentication, durable CAS and reply.
// The caller allows 110s; the normal 30s API default cannot cover this batch.
export const maxDuration = 100;

export async function POST(request: Request): Promise<Response> {
  const denial = await limitFleetRequest(request);
  if (denial) return denial;
  return handleSummerFleetEvents(request, summerFleetRuntime());
}
