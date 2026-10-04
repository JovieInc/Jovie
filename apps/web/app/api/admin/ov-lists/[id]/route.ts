import type { NextRequest } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  guardListsApi,
  jsonNoStore,
  listPatchSchema,
} from '@/lib/ovie/lists/api.server';
import { deleteList, updateList } from '@/lib/ovie/lists/list-store.server';
import { ListModelError } from '@/lib/ovie/lists/model';
import { getListDetail } from '@/lib/ovie/lists/service.server';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };
const ROUTE = '/api/admin/ov-lists/[id]';

/** GET — list with member creators and suggestion precision. */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const denied = await guardListsApi();
  if (denied) return denied;
  const { id } = await params;
  try {
    const detail = await getListDetail(id);
    return detail
      ? jsonNoStore(detail)
      : jsonNoStore({ error: 'List not found.' }, 404);
  } catch (error) {
    await captureError('Ovie list read failed', error, { route: ROUTE });
    return jsonNoStore({ error: 'This list is unavailable right now.' }, 500);
  }
}

/** PATCH — apply rating/favorite/swipe/suggestion decisions in order. */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const denied = await guardListsApi();
  if (denied) return denied;
  const { id } = await params;
  const parsed = await parseJsonBody(request, { route: ROUTE });
  if (!parsed.ok) return parsed.response;
  const body = listPatchSchema.safeParse(parsed.data);
  if (!body.success) {
    return jsonNoStore(
      { error: 'Invalid list action.', details: body.error.flatten() },
      400
    );
  }
  try {
    const result = await updateList(id, body.data.actions);
    if (result.outcome === 'not_found') {
      return jsonNoStore({ error: 'List not found.' }, 404);
    }
    if (result.outcome === 'conflict') {
      return jsonNoStore(
        { error: 'This list changed in another tab. Try again.' },
        409
      );
    }
    return jsonNoStore({ list: result.list });
  } catch (error) {
    if (error instanceof ListModelError) {
      return jsonNoStore({ error: error.message }, 400);
    }
    await captureError('Ovie list update failed', error, { route: ROUTE });
    return jsonNoStore({ error: 'Could not update the list.' }, 500);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const denied = await guardListsApi();
  if (denied) return denied;
  const { id } = await params;
  try {
    return (await deleteList(id))
      ? jsonNoStore({ ok: true })
      : jsonNoStore({ error: 'List not found.' }, 404);
  } catch (error) {
    await captureError('Ovie list delete failed', error, { route: ROUTE });
    return jsonNoStore({ error: 'Could not delete the list.' }, 500);
  }
}
