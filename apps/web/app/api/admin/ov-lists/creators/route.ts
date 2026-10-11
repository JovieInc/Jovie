import type { NextRequest } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { guardListsApi, jsonNoStore } from '@/lib/ovie/lists/api.server';
import { searchListCreators } from '@/lib/ovie/lists/creators.server';

export const runtime = 'nodejs';

/** GET ?q= — find existing creator profiles to add to a list by hand. */
export async function GET(request: NextRequest) {
  const denied = await guardListsApi();
  if (denied) return denied;
  const query = (request.nextUrl.searchParams.get('q') ?? '').slice(0, 100);
  try {
    return jsonNoStore({ creators: await searchListCreators(query) });
  } catch (error) {
    await captureError('Ovie list creator search failed', error, {
      route: '/api/admin/ov-lists/creators',
    });
    return jsonNoStore({ error: 'Search is unavailable right now.' }, 500);
  }
}
