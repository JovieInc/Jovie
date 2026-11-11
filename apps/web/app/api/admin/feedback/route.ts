import { NextResponse } from 'next/server';
import { operatorAccess } from '@/lib/api/route-access';
import { defineRoute } from '@/lib/api/route-pipeline';
import { getAdminFeedbackItems } from '@/lib/feedback';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

async function getHandler() {
  let items: Awaited<ReturnType<typeof getAdminFeedbackItems>>;
  try {
    items = await getAdminFeedbackItems(200);
  } catch (error) {
    logger.error('[api/admin/feedback] Failed to load feedback items:', error);
    return NextResponse.json(
      { error: 'Unable to load feedback items' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    items: items.map(item => ({
      id: item.id,
      message: item.message,
      source: item.source,
      status: item.status,
      classification: item.classification,
      disposition: item.disposition,
      context: item.context,
      dismissedAtIso: item.dismissedAt?.toISOString() ?? null,
      createdAtIso: item.createdAt.toISOString(),
      user: item.user,
    })),
  });
}

export const GET = defineRoute(
  {
    route: '/api/admin/feedback',
    access: operatorAccess({ purpose: 'read' }),
    legacy: { cache: 'none', unhandledErrors: 'rethrow' },
  },
  getHandler
);
