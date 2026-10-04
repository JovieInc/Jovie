import type { NextRequest } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { guardListsApi, jsonNoStore } from '@/lib/ovie/lists/api.server';
import { getSmartViewDetail } from '@/lib/ovie/lists/service.server';

export const runtime = 'nodejs';

/** GET — one smart view's rows across every list. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ viewId: string }> }
) {
  const denied = await guardListsApi();
  if (denied) return denied;
  const { viewId } = await params;
  try {
    const detail = await getSmartViewDetail(viewId);
    return detail
      ? jsonNoStore(detail)
      : jsonNoStore({ error: 'View not found.' }, 404);
  } catch (error) {
    await captureError('Ovie smart view read failed', error, {
      route: '/api/admin/ov-lists/views/[viewId]',
    });
    return jsonNoStore({ error: 'This view is unavailable right now.' }, 500);
  }
}
