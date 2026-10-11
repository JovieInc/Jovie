import { NextResponse } from 'next/server';
import { dismissFeedbackItem } from '@/lib/feedback';
import { getOvieOperatorEntitlements } from '@/lib/ovie/privacy-lock/access';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const entitlements = await getOvieOperatorEntitlements({ session: 'fresh' });

  if (!entitlements.isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!entitlements.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await context.params;
  const result = await dismissFeedbackItem(id);

  if (!result) {
    return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
