import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getClientTrackingToken } from '@/lib/analytics/tracking-token';

export const runtime = 'nodejs';

const requestSchema = z.object({
  profileId: z.string().uuid(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = requestSchema.safeParse({
    profileId: url.searchParams.get('profileId'),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    return NextResponse.json(getClientTrackingToken(parsed.data.profileId));
  } catch {
    return NextResponse.json({ token: null, expiresAt: null });
  }
}
