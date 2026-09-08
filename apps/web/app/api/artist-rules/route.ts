import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  activateSuggestedArtistRule,
  createConfirmedArtistRule,
  listArtistRulesForProfile,
  revokeArtistRule,
} from '@/lib/artist-rules/store';
import { getCachedAuth } from '@/lib/auth/cached';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createSchema = z.object({
  creatorProfileId: z.string().uuid(),
  category: z.enum(['visual', 'voice', 'commercial', 'safety', 'workflow']),
  ruleKey: z.string().trim().min(1).max(80),
  instruction: z.string().trim().min(1).max(500),
  strength: z.enum(['hard_constraint', 'preference']),
  allowOverride: z.boolean(),
});

const revokeSchema = z.object({
  creatorProfileId: z.string().uuid(),
  ruleId: z.string().uuid(),
});

const activateSchema = revokeSchema.extend({
  action: z.literal('activate'),
});

async function authorize(creatorProfileId: string) {
  const { userId } = await getCachedAuth();
  if (!userId) return { ok: false as const, status: 401, userId: null };
  const access = await getExactProfileAccess(db, userId, creatorProfileId);
  if (!access.ok) return { ok: false as const, status: 403, userId };
  return { ok: true as const, status: 200, userId };
}

export async function GET(request: Request) {
  const creatorProfileId = new URL(request.url).searchParams.get(
    'creatorProfileId'
  );
  const parsed = z.string().uuid().safeParse(creatorProfileId);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid profile' }, { status: 400 });
  }
  const auth = await authorize(parsed.data);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }
  return NextResponse.json({
    rules: await listArtistRulesForProfile(parsed.data),
  });
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid rule' }, { status: 400 });
  }
  const auth = await authorize(parsed.data.creatorProfileId);
  if (!auth.ok || !auth.userId) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }
  const rule = await createConfirmedArtistRule({
    ...parsed.data,
    actorUserId: auth.userId,
    allowOverride:
      parsed.data.strength === 'hard_constraint'
        ? parsed.data.allowOverride
        : true,
  });
  return NextResponse.json({ rule }, { status: 201 });
}

export async function DELETE(request: Request) {
  const parsed = revokeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid rule' }, { status: 400 });
  }
  const auth = await authorize(parsed.data.creatorProfileId);
  if (!auth.ok || !auth.userId) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }
  const revoked = await revokeArtistRule({
    ...parsed.data,
    actorUserId: auth.userId,
  });
  return revoked
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'Active rule not found' }, { status: 404 });
}

export async function PATCH(request: Request) {
  const parsed = activateSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid rule' }, { status: 400 });
  }
  const auth = await authorize(parsed.data.creatorProfileId);
  if (!auth.ok || !auth.userId) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }
  const rule = await activateSuggestedArtistRule({
    creatorProfileId: parsed.data.creatorProfileId,
    ruleId: parsed.data.ruleId,
    actorUserId: auth.userId,
  });
  return rule
    ? NextResponse.json({ rule })
    : NextResponse.json({ error: 'Suggested rule not found' }, { status: 404 });
}
