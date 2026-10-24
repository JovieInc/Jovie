import type { NextRequest } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { meshJsonNoStore } from '@/lib/ovie/mesh/api.server';
import { loadMeshRead } from '@/lib/ovie/mesh/read.server';
import { requireOvieApiAccess } from '@/lib/ovie/privacy-lock/access';

export const runtime = 'nodejs';

/** GET /api/admin/mesh — read-only mesh roster for the Ovie Mesh page. */
export async function GET(_request: NextRequest) {
  const denied = await requireOvieApiAccess();
  if (denied) return denied;
  try {
    return meshJsonNoStore(await loadMeshRead());
  } catch (error) {
    await captureError('Mesh read failed', error, {
      route: '/api/admin/mesh',
    });
    return meshJsonNoStore({ error: 'Mesh is unavailable right now.' }, 500);
  }
}
