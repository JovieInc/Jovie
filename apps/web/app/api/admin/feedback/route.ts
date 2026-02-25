import { NextResponse } from 'next/server';

import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { getAdminFeedbackItems } from '@/lib/feedback';

export const runtime = 'nodejs';

export async function GET() {
  const entitlements = await getCurrentUserEntitlements();

  if (!entitlements.isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!entitlements.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const items = await getAdminFeedbackItems(200);

  return NextResponse.json({
    items: items.map(item => ({
      id: item.id,
      message: item.message,
      source: item.source,
      status: item.status,
      context: item.context,
      dismissedAtIso: item.dismissedAt?.toISOString() ?? null,
      createdAtIso: item.createdAt.toISOString(),
      user: item.user,
    })),
  });
}
