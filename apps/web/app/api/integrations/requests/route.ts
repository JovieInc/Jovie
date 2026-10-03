import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserByClerkId } from '@/lib/db/queries/shared';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { integrationSignalSchema } from '@/lib/integrations/builder';
import { submitIntegrationSignal } from '@/lib/integrations/requests';
import { createRateLimitHeaders, generalLimiter } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { userId, isAuthenticated } = await getCurrentUserEntitlements();
    if (!isAuthenticated || !userId)
      return NextResponse.json(
        { error: 'Sign in to request an integration.' },
        { status: 401 }
      );
    const rate = await generalLimiter.limit(`integration-request:${userId}`);
    if (!rate.success)
      return NextResponse.json(
        { error: 'Too many requests. Try again shortly.' },
        { status: 429, headers: createRateLimitHeaders(rate) }
      );
    const body = await parseJsonBody(request, {
      route: '/api/integrations/requests',
      maxBodySize: 4096,
    });
    if (!body.ok) return body.response;
    const parsed = integrationSignalSchema.safeParse(body.data);
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Enter a provider, capability, and use case.' },
        { status: 400 }
      );
    const user = await getUserByClerkId(db, userId);
    if (!user)
      return NextResponse.json(
        { error: 'Account not found.' },
        { status: 403 }
      );
    const result = await submitIntegrationSignal(user.id, parsed.data);
    return NextResponse.json(result, {
      status: result.kind === 'draft' ? 202 : 200,
    });
  } catch (error) {
    await captureError('Integration request failed', error, {
      route: '/api/integrations/requests',
    });
    return NextResponse.json(
      { error: 'Could not save the request. Please retry.' },
      { status: 500 }
    );
  }
}
