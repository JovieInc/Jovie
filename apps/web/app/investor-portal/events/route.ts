import { and, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { db } from '@/lib/db';
import { investorLinks, investorViews } from '@/lib/db/schema/investors';
import { captureError } from '@/lib/error-tracking';
import {
  buildInvestorEventPath,
  INVESTOR_PORTAL_EVENT_NAMES,
} from '@/lib/investors/portal-events';
import { apiLimiter } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const eventSchema = z
  .object({
    event: z.enum(INVESTOR_PORTAL_EVENT_NAMES),
    slideId: z
      .string()
      .regex(/^[a-z0-9-]+$/u)
      .max(64)
      .optional(),
  })
  .strict();

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return origin !== null && origin === new URL(request.url).origin;
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return new Response(null, { status: 403 });
  }

  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return new Response(null, { status: 400 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get('__investor_token')?.value;
  if (!token) {
    return new Response(null, { status: 404 });
  }

  try {
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      'unknown';
    const rateLimit = await apiLimiter.limit(
      `investor-portal:event:${clientIp}`
    );
    if (!rateLimit.success) {
      return new Response(null, { status: 429 });
    }

    const [link] = await db
      .select({ id: investorLinks.id, expiresAt: investorLinks.expiresAt })
      .from(investorLinks)
      .where(
        and(eq(investorLinks.token, token), eq(investorLinks.isActive, true))
      )
      .limit(1);

    if (!link || (link.expiresAt && link.expiresAt <= new Date())) {
      return new Response(null, { status: 404 });
    }

    await db.insert(investorViews).values({
      investorLinkId: link.id,
      pagePath: buildInvestorEventPath(parsed.data.event, parsed.data.slideId),
      userAgent: request.headers.get('user-agent') ?? undefined,
      referrer: request.headers.get('referer') ?? undefined,
    });
  } catch (error) {
    await captureError('Investor portal event persistence failed', error, {
      context: 'investor_portal_event',
      event: parsed.data.event,
    });
  }

  // Never expose the token, investor identity, or database identifier.
  return new Response(null, { status: 204 });
}
