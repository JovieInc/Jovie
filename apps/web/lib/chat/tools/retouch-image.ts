import 'server-only';

import { tool } from 'ai';
import { z } from 'zod';
import {
  type RetouchCapability,
  resolveRetouchCapability,
} from '@/lib/chat/retouch-capability';
import { chatToolSchema } from '@/lib/chat/strict-schema';
import type { getCurrentUserEntitlements } from '@/lib/entitlements/server';

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
    execute: async () => {
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
      });
      if (capability.availability !== 'available') {
        return buildUnavailablePayload(capability);
      }

      return {
        success: false as const,
        retryable: true,
        errorCode: 'TOOL_UNAVAILABLE' as const,
        error: 'Image retouching is temporarily unavailable.',
      };
    },
  });
}
