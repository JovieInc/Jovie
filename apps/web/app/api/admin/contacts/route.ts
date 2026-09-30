import { NextResponse } from 'next/server';

import {
  getCanonicalContacts,
  getContactStageTimeline,
  setCanonicalContactStage,
} from '@/lib/admin/contacts';
import { isContactLifecycleStage } from '@/lib/contacts/lifecycle';
import { getOvieOperatorEntitlements } from '@/lib/ovie/privacy-lock/access';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

async function requireAdmin(purpose?: 'read') {
  const entitlements = await getOvieOperatorEntitlements({ purpose });
  if (!entitlements.isAuthenticated) {
    return {
      error: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      ),
    };
  }
  if (!entitlements.isAdmin) {
    return {
      error: NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      ),
    };
  }
  return { entitlements };
}

export async function GET(request: Request) {
  const gate = await requireAdmin('read');
  if (gate.error) return gate.error;

  const { searchParams } = new URL(request.url);
  const dedupeKey = searchParams.get('key');

  if (dedupeKey) {
    const timeline = await getContactStageTimeline(dedupeKey);
    return NextResponse.json(
      {
        timeline: timeline.map(item => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
        })),
      },
      { headers: NO_STORE_HEADERS }
    );
  }

  const result = await getCanonicalContacts({
    page: Number(searchParams.get('page') ?? '1'),
    pageSize: Number(searchParams.get('pageSize') ?? '50'),
    search: searchParams.get('q') ?? '',
    stage: searchParams.get('stage'),
  });

  return NextResponse.json(
    { rows: result.contacts, total: result.total },
    { headers: NO_STORE_HEADERS }
  );
}

interface StageUpdateBody {
  dedupeKey?: string;
  toStage?: string;
  reason?: string;
  identity?: {
    displayName?: string | null;
    emailNormalized?: string | null;
    primaryHandle?: string | null;
    avatarUrl?: string | null;
    userId?: string | null;
    creatorProfileId?: string | null;
    leadId?: string | null;
    waitlistEntryId?: string | null;
  };
}

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  let body: StageUpdateBody;
  try {
    body = (await request.json()) as StageUpdateBody;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (
    typeof body.dedupeKey !== 'string' ||
    body.dedupeKey.length === 0 ||
    !isContactLifecycleStage(body.toStage)
  ) {
    return NextResponse.json(
      { error: 'dedupeKey and a valid toStage are required' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const actorId = gate.entitlements?.userId ?? null;

  const result = await setCanonicalContactStage({
    dedupeKey: body.dedupeKey,
    toStage: body.toStage,
    actorUserId: actorId,
    actorType: 'founder',
    reason: body.reason ?? null,
    identity: body.identity,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: 'Contacts table unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(
    { ok: true, stage: result.stage },
    { headers: NO_STORE_HEADERS }
  );
}
