import { handleFleetInvocation } from '@/lib/actions/fleet/http';
import { fleetRuntime } from '@/lib/actions/fleet/runtime';
export const dynamic = 'force-dynamic';
export async function POST(
  request: Request,
  context: { params: Promise<{ actionId: string }> }
) {
  const { actionId } = await context.params;
  return handleFleetInvocation(request, actionId, fleetRuntime());
}
