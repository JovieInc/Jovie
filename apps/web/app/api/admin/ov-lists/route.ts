import type { NextRequest } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  guardListsApi,
  jsonNoStore,
  listCreateSchema,
} from '@/lib/ovie/lists/api.server';
import { insertList } from '@/lib/ovie/lists/list-store.server';
import { ListModelError } from '@/lib/ovie/lists/model';
import { getSidebarLists } from '@/lib/ovie/lists/service.server';

export const runtime = 'nodejs';

/** GET /api/admin/ov-lists — sidebar lists + non-empty pinned smart views. */
export async function GET() {
  const denied = await guardListsApi();
  if (denied) return denied;
  try {
    return jsonNoStore(await getSidebarLists());
  } catch (error) {
    await captureError('Ovie lists read failed', error, {
      route: '/api/admin/ov-lists',
    });
    return jsonNoStore({ error: 'Lists are unavailable right now.' }, 500);
  }
}

/** POST /api/admin/ov-lists — create a manual list. */
export async function POST(request: NextRequest) {
  const denied = await guardListsApi();
  if (denied) return denied;
  const parsed = await parseJsonBody(request, { route: '/api/admin/ov-lists' });
  if (!parsed.ok) return parsed.response;
  const body = listCreateSchema.safeParse(parsed.data);
  if (!body.success) return jsonNoStore({ error: 'Name is required.' }, 400);
  try {
    return jsonNoStore(
      { list: await insertList({ name: body.data.name }) },
      201
    );
  } catch (error) {
    if (error instanceof ListModelError) {
      return jsonNoStore({ error: error.message }, 400);
    }
    await captureError('Ovie list create failed', error, {
      route: '/api/admin/ov-lists',
    });
    return jsonNoStore({ error: 'Could not create the list.' }, 500);
  }
}
