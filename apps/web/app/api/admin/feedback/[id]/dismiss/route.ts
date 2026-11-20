import { NextResponse } from 'next/server';
import {
  type OperatorRouteInput,
  operatorAccess,
} from '@/lib/api/route-access';
import { defineRoute } from '@/lib/api/route-pipeline';
import { dismissFeedbackItem } from '@/lib/feedback';

export const runtime = 'nodejs';

async function postHandler(
  _input: OperatorRouteInput,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const result = await dismissFeedbackItem(id);

  if (!result) {
    return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export const POST = defineRoute(
  {
    route: '/api/admin/feedback/[id]/dismiss',
    access: operatorAccess({ session: 'fresh' }),
    legacy: { cache: 'none', unhandledErrors: 'rethrow' },
  },
  postHandler
);
