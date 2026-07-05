import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { captureError } from '@/lib/error-tracking';
import { getAppFlagValue } from '@/lib/flags/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { triggerNewRelease } from '@/lib/release-to-revenue/trigger-new-release';
import { logger } from '@/lib/utils/logger';

const providerLinkSchema = z.object({
  providerId: z.string().min(1),
  url: z.string().url(),
  label: z.string().optional(),
});

const manualTriggerSchema = z.object({
  triggerSource: z.literal('manual'),
  title: z.string().min(1),
  artworkUrl: z.string().url().nullable().optional(),
  slug: z.string().min(1).optional(),
  links: z.array(providerLinkSchema).optional(),
});

const catalogTriggerSchema = z.object({
  triggerSource: z.literal('catalog'),
  releaseId: z.string().uuid(),
});

const triggerSchema = z.discriminatedUnion('triggerSource', [
  manualTriggerSchema,
  catalogTriggerSchema,
]);

const payloadSchema = z.object({
  trigger: triggerSchema,
});

export async function POST(request: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;

  try {
    const body = await request.json();
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid-payload', details: parsed.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const enabled = await getAppFlagValue('RELEASE_TO_REVENUE_AUTOPILOT', {
      userId,
    });

    const result = await triggerNewRelease({
      userId,
      enabled,
      trigger: parsed.data.trigger,
    });

    if (!result.ok) {
      const status =
        result.code === 'forbidden'
          ? 403
          : result.code === 'feature-disabled' ||
              result.code === 'design-partner-not-configured'
            ? 404
            : result.code === 'release-not-found'
              ? 404
              : 400;

      return NextResponse.json(
        { error: result.code, message: result.message },
        { status, headers: NO_STORE_HEADERS }
      );
    }

    logger.info('[release-to-revenue/trigger] autopilot run recorded', {
      userId,
      runId: result.run.runId,
      runStatus: result.run.status,
      triggerSource: result.stepOutputs.triggerSource,
      releaseId: result.stepOutputs.releaseId,
      title: result.stepOutputs.release.title,
    });

    return NextResponse.json(
      {
        ok: true,
        runId: result.run.runId,
        runStatus: result.run.status,
        release: result.stepOutputs.release,
        triggerSource: result.stepOutputs.triggerSource,
      },
      {
        status: result.run.status === 'created' ? 201 : 200,
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (err) {
    logger.error('[release-to-revenue/trigger] failed', err);
    await captureError('release-to-revenue trigger failed', err, {
      route: '/api/release-to-revenue/trigger',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'internal-error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
