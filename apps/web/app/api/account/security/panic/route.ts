import { and, eq, gte, ne } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { SUPPORT_EMAIL } from '@/constants/domains';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { securityEvents } from '@/lib/db/schema/security';
import { sendEmail } from '@/lib/email/send';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  executeAccountContainment,
  SECURITY_EVENT_TYPES,
} from '@/lib/security/account-security';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const SUPPORT_NOTIFICATION_COOLDOWN_MS = 60 * 60 * 1000;

// POST /api/account/security/panic — panic button (JOV-6600):
// freezes links (snapshot first, revertable), revokes all sessions
// including the current one, and notifies support.
export async function POST(req: NextRequest) {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const ipAddress = extractClientIP(req.headers);
  const userAgent = req.headers.get('user-agent');

  try {
    const result = await executeAccountContainment({
      appUserId: userId,
      ipAddress,
      userAgent,
    });

    // Contact support, but at most once per hour so repeated invocations
    // cannot be used to spam the support inbox. The panic event written
    // above is excluded from the cooldown lookup.
    let supportNotified = false;
    try {
      const priorPanics = await db
        .select({ id: securityEvents.id })
        .from(securityEvents)
        .where(
          and(
            eq(securityEvents.userId, userId),
            eq(securityEvents.type, SECURITY_EVENT_TYPES.PANIC),
            gte(
              securityEvents.createdAt,
              new Date(Date.now() - SUPPORT_NOTIFICATION_COOLDOWN_MS)
            ),
            result.eventId ? ne(securityEvents.id, result.eventId) : undefined
          )
        )
        .limit(1);

      if (priorPanics.length === 0) {
        const sent = await sendEmail({
          to: SUPPORT_EMAIL,
          subject: '[Security] Account containment triggered',
          text: `User ${userId} invoked the panic button. Sessions revoked: ${result.sessionsRevoked}. Links frozen: ${result.linksFrozen} across ${result.profilesFrozen} profile(s). Event: ${result.eventId ?? 'n/a'}.`,
          html: `<p>User <code>${userId}</code> invoked the panic button.</p><ul><li>Sessions revoked: ${result.sessionsRevoked}</li><li>Links frozen: ${result.linksFrozen} across ${result.profilesFrozen} profile(s)</li><li>Audit event: ${result.eventId ?? 'n/a'}</li></ul>`,
        });
        supportNotified = sent.success;
      }
    } catch (notifyError) {
      // Containment already succeeded; never fail the panic response
      // because the support notification could not be delivered.
      void captureError('Panic support notification failed', notifyError, {
        source: 'api/account/security/panic',
      });
    }

    return NextResponse.json(
      {
        ok: true,
        sessionsRevoked: result.sessionsRevoked,
        linksFrozen: result.linksFrozen,
        profilesFrozen: result.profilesFrozen,
        supportNotified,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    void captureError('Account containment failed', error, {
      source: 'api/account/security/panic',
    });
    logger.error('Account containment failed', { userId });
    return NextResponse.json(
      { error: 'Unable to secure the account right now. Please try again.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
