import type { NextRequest } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { guardListsApi, jsonNoStore } from '@/lib/ovie/lists/api.server';
import { suggestForList } from '@/lib/ovie/lists/service.server';

export const runtime = 'nodejs';

const ROUTE = '/api/admin/ov-lists/[id]/suggest';

/**
 * POST — train this list's learner on its labels and propose the next batch
 * as pending suggestions. Never adds members.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await guardListsApi();
  if (denied) return denied;
  const { id } = await params;
  try {
    const result = await suggestForList(id);
    if (result.outcome === 'not_found') {
      return jsonNoStore({ error: 'List not found.' }, 404);
    }
    if (result.outcome === 'conflict') {
      return jsonNoStore(
        { error: 'This list changed while suggesting. Try again.' },
        409
      );
    }
    return jsonNoStore({ list: result.list });
  } catch (error) {
    await captureError('Ovie list suggest failed', error, { route: ROUTE });
    return jsonNoStore({ error: 'Could not suggest creators right now.' }, 500);
  }
}
