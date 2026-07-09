import 'server-only';

import * as Sentry from '@sentry/nextjs';
import {
  completeRetouchJob,
  countRetouchJobsSince,
  createRetouchJob,
  failRetouchJob,
  markRetouchJobRunning,
  resolveRetouchUserId,
} from './jobs';
import {
  RETOUCH_MODEL_ID,
  RetouchGatewayUnconfiguredError,
  RetouchNoImageReturnedError,
  runRetouchModel,
} from './provider-gemini';
import { uploadRetouchResult } from './storage';
import {
  buildRetouchPrompt,
  getRetouchStyleVersion,
  WHITE_SPACE_STYLE_ID,
} from './style';

/**
 * Retouch executor — the end-to-end pipeline behind the chat retouch tool.
 * Owns entitlement daily-budget enforcement and the retouch_jobs lifecycle;
 * every exit path is a structured result (never a throw) so chat renders a
 * user-readable error instead of the generic crash.
 */

export type RetouchErrorCode =
  | 'USER_NOT_FOUND'
  | 'DAILY_LIMIT_REACHED'
  | 'PROVIDER_UNAVAILABLE'
  | 'IDENTITY_GUARDRAIL_REFUSAL'
  | 'RETOUCH_FAILED';

export type RetouchExecutionResult =
  | {
      readonly success: true;
      readonly jobId: string;
      readonly styleId: typeof WHITE_SPACE_STYLE_ID;
      readonly resultUrl: string;
      readonly sourceImageUrl: string;
    }
  | {
      readonly success: false;
      readonly errorCode: RetouchErrorCode;
      readonly error: string;
      readonly retryable: boolean;
    };

function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

export async function executeRetouch(params: {
  readonly clerkUserId: string;
  readonly sourceImageUrl: string;
  readonly instructions: string | null;
  readonly conversationId: string | null;
  /** Plan-derived daily budget (entitlements.aiRetouchDailyLimit). Null = unlimited. */
  readonly dailyLimit: number | null;
}): Promise<RetouchExecutionResult> {
  const userId = await resolveRetouchUserId(params.clerkUserId);
  if (!userId) {
    return {
      success: false,
      errorCode: 'USER_NOT_FOUND',
      error: 'We could not find your account. Please try again.',
      retryable: true,
    };
  }

  if (params.dailyLimit !== null) {
    const usedToday = await countRetouchJobsSince({
      userId,
      since: startOfUtcDay(new Date()),
    });
    if (usedToday >= params.dailyLimit) {
      return {
        success: false,
        errorCode: 'DAILY_LIMIT_REACHED',
        error: `You've used all ${params.dailyLimit} retouches for today. Your limit resets at midnight UTC.`,
        retryable: false,
      };
    }
  }

  const jobId = await createRetouchJob({
    userId,
    sourceAssetId: params.sourceImageUrl,
    model: RETOUCH_MODEL_ID,
    style: WHITE_SPACE_STYLE_ID,
    styleVersion: getRetouchStyleVersion(),
    perImageOverride: params.instructions,
    chatThreadId: params.conversationId,
  });

  try {
    await markRetouchJobRunning(jobId);

    const generated = await runRetouchModel({
      sourceImageUrl: params.sourceImageUrl,
      prompt: buildRetouchPrompt({ instructions: params.instructions }),
    });

    const uploaded = await uploadRetouchResult({
      userId,
      jobId,
      image: generated.image,
      mediaType: generated.mediaType,
    });

    await completeRetouchJob({
      jobId,
      resultAssetId: uploaded.assetId,
      tokenUsage: generated.tokenUsage,
    });

    return {
      success: true,
      jobId,
      styleId: WHITE_SPACE_STYLE_ID,
      resultUrl: uploaded.url,
      sourceImageUrl: params.sourceImageUrl,
    };
  } catch (error) {
    if (error instanceof RetouchGatewayUnconfiguredError) {
      // Expected operational state (key missing between capability check and
      // call) — treat as feature-disabled, do not capture to Sentry.
      await failRetouchJob({ jobId, error: error.code });
      return {
        success: false,
        errorCode: 'PROVIDER_UNAVAILABLE',
        error: 'Image retouching is temporarily unavailable.',
        retryable: false,
      };
    }

    if (error instanceof RetouchNoImageReturnedError) {
      // The model declined to edit — typically the white-space.md identity
      // guardrails (low-quality or ambiguous input). Not an application error.
      await failRetouchJob({
        jobId,
        error: `${error.code}: ${error.modelText}`,
        status: 'identity_check_failed',
      });
      return {
        success: false,
        errorCode: 'IDENTITY_GUARDRAIL_REFUSAL',
        error:
          "This photo couldn't be retouched while preserving your likeness. Try a clearer, well-lit photo where your face is fully visible.",
        retryable: true,
      };
    }

    Sentry.captureException(error, {
      tags: { feature: 'retouch' },
      extra: { jobId, conversationId: params.conversationId },
    });
    await failRetouchJob({
      jobId,
      error: error instanceof Error ? error.message : String(error),
    }).catch(() => {
      // Job-row bookkeeping must never mask the user-facing error path.
    });
    return {
      success: false,
      errorCode: 'RETOUCH_FAILED',
      error: 'Unable to retouch this photo. Please try again.',
      retryable: true,
    };
  }
}
