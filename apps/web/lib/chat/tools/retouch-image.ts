import 'server-only';

import { tool } from 'ai';
import { z } from 'zod';
import {
  type RetouchCapability,
  resolveRetouchCapability,
} from '@/lib/chat/retouch-capability';
import { chatToolSchema } from '@/lib/chat/strict-schema';
import type { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { executeRetouch } from '@/lib/services/retouching/executor';
import { isRetouchConfigured } from '@/lib/services/retouching/provider-gemini';

type CurrentUserEntitlements = Awaited<
  ReturnType<typeof getCurrentUserEntitlements>
>;

function buildUnavailablePayload(capability: RetouchCapability) {
  return {
    success: false as const,
    retryable: capability.reasonCode !== 'PLAN_UNAVAILABLE',
    errorCode: (capability.reasonCode ?? 'TOOL_UNAVAILABLE') as
      | 'PLAN_UNAVAILABLE'
      | 'TOOL_UNPROVISIONED'
      | 'TOOL_UNAVAILABLE',
    error: capability.reason ?? 'Image retouching is temporarily unavailable.',
  };
}

export function createRetouchImageTool(input: {
  readonly profileId: string | null;
  readonly entitlements: CurrentUserEntitlements | null;
  readonly clerkUserId: string;
  /**
   * Public URL of the most recent image the user attached in this turn's
   * message history (extracted server-side from UIMessage file parts).
   * Null when no image attachment is present.
   */
  readonly sourceImageUrl: string | null;
  readonly conversationId: string | null;
}) {
  return tool({
    description:
      'Retouch an attached or referenced artist photo using the White Space editorial style. Use when the artist asks to retouch, touch up, polish, or enhance a photo or press shot.',
    inputSchema: chatToolSchema({
      styleId: z
        .enum(['white-space'])
        .optional()
        .describe('Retouch style preset. Defaults to white-space.'),
      instructions: z
        .string()
        .max(500)
        .optional()
        .describe('Optional retouch direction from the artist.'),
    }),
    execute: async ({ instructions }) => {
      if (!input.profileId) {
        return {
          success: false as const,
          retryable: false,
          errorCode: 'PROFILE_REQUIRED' as const,
          error: 'Profile ID required',
        };
      }

      const capability = resolveRetouchCapability({
        entitlements: input.entitlements,
        provisioned: isRetouchConfigured(),
      });
      if (capability.availability !== 'available') {
        return buildUnavailablePayload(capability);
      }

      if (!input.sourceImageUrl) {
        return {
          success: false as const,
          retryable: true,
          errorCode: 'NO_IMAGE_ATTACHED' as const,
          error:
            'No photo found to retouch. Attach the image you want retouched and ask again.',
        };
      }

      const result = await executeRetouch({
        clerkUserId: input.clerkUserId,
        sourceImageUrl: input.sourceImageUrl,
        instructions: instructions?.trim() || null,
        conversationId: input.conversationId,
        dailyLimit: input.entitlements?.aiRetouchDailyLimit ?? null,
      });

      if (!result.success) {
        return {
          success: false as const,
          retryable: result.retryable,
          errorCode: result.errorCode,
          error: result.error,
        };
      }

      return {
        success: true as const,
        state: 'retouched' as const,
        jobId: result.jobId,
        styleId: result.styleId,
        resultUrl: result.resultUrl,
        sourceImageUrl: result.sourceImageUrl,
      };
    },
  });
}
