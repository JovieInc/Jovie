import { handleFleetControl } from '@/lib/actions/fleet/http';
import { fleetRuntime } from '@/lib/actions/fleet/runtime';
export const dynamic = 'force-dynamic';
export async function POST(
  request: Request,
  context: { params: Promise<{ operation: string }> }
) {
  const { operation } = await context.params;
  if (!['approve', 'execute', 'status'].includes(operation))
    return Response.json(
      { error: { code: 'VALIDATION_FAILED' } },
      { status: 404 }
    );
  return handleFleetControl(
    request,
    operation as 'approve' | 'execute' | 'status',
    fleetRuntime()
  );
}
