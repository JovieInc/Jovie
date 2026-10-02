import { limitFleetRequest } from '@/lib/actions/fleet/rate-limit';
import { handleSummerFleetEvents } from '@/lib/actions/fleet/summer-http';
import { summerFleetRuntime } from '@/lib/actions/fleet/summer-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const denial = await limitFleetRequest(request);
  if (denial) return denial;
  return handleSummerFleetEvents(request, summerFleetRuntime());
}
