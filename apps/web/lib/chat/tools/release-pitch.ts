import * as Sentry from '@sentry/nextjs';
import { tool } from 'ai';
import { z } from 'zod';
import { isArtistRuleViolation } from '@/lib/copy/outbound-floor';
import {
  buildPitchInput,
  generatePitchDraft,
  PITCH_GRILL_PROCEDURE,
  PITCH_PLATFORMS,
  PITCH_TARGET_OPTIONS_TEXT,
  PITCH_TARGETS,
  resolvePitchDestination,
} from '@/lib/services/pitch';
import { resolveChatRelease } from '../catalog-query';
import { updateOwnedReleaseGeneratedPitches } from '../release-writes';
import { chatToolSchema } from '../strict-schema';
import type {
  ArtistContext,
  ReleaseCatalogMeta,
  ReleaseContext,
} from '../types';

/** Format available release titles for error messages. */
function formatAvailableReleases(releases: ReleaseContext[]): string {
  return releases
    .slice(0, 10)
    .map(r => r.title)
    .join(', ');
}

/**
 * Creates the generateReleasePitch tool for chat-first release pitching.
 * Saves the latest generated draft to the release's generatedPitches field.
 */
export function createGenerateReleasePitchTool(
  resolvedProfileId: string,
  identity: { clerkUserId: string; conversationId: string | null },
  releases: ReleaseContext[],
  artistRules?: ArtistContext['artistRules'],
  releaseCatalog?: ReleaseCatalogMeta
) {
  return tool({
    description: `Generate one copy-paste-ready release pitch for a specific destination. Use for playlist, radio, Sirius XM, install, playback/music supervisor, editorial post, record label, or collaborator pitching. Ask the artist where they want to pitch it before calling this tool unless a task or user message clearly maps to one of these destinations: ${PITCH_TARGET_OPTIONS_TEXT}. Ask which release they want to pitch if unclear. If the artist provides custom guidance, pass it via instructions. ${PITCH_GRILL_PROCEDURE}`,
    inputSchema: chatToolSchema({
      releaseTitle: z
        .string()
        .max(200)
        .optional()
        .describe('The title of the release to generate a pitch for'),
      releaseId: z
        .string()
        .uuid()
        .optional()
        .describe('The release ID to generate a pitch for'),
      target: z
        .enum(PITCH_TARGETS)
        .optional()
        .describe(
          `Where the artist wants to pitch the release: ${PITCH_TARGET_OPTIONS_TEXT}`
        ),
      platform: z
        .enum(PITCH_PLATFORMS)
        .optional()
        .describe('Optional platform or buyer context, such as Spotify'),
      taskTitle: z
        .string()
        .max(200)
        .optional()
        .describe('Release task title to infer the pitch destination from'),
      taskCategory: z
        .string()
        .max(100)
        .optional()
        .describe('Release task category to infer the pitch destination from'),
      instructions: z
        .string()
        .max(700)
        .optional()
        .describe(
          'Optional instructions to guide pitch generation, e.g. "mention my Nashville show" or "make it less formal"'
        ),
    }),
    execute: async ({
      releaseTitle,
      releaseId,
      target,
      platform,
      taskTitle,
      taskCategory,
      instructions,
    }) => {
      try {
        if (releases.length === 0) {
          // A failed catalog read must not masquerade as "no releases" (dogfood
          // 2026-11-10): tell the model the catalog is unreadable instead.
          if (releaseCatalog?.status === 'unavailable') {
            return {
              success: false as const,
              error:
                'The release catalog is temporarily unavailable. Try the pitch again in a moment.',
            };
          }
          return {
            success: false as const,
            error: "You don't have any releases yet. Add a release first.",
          };
        }

        const release = await resolveChatRelease(resolvedProfileId, releases, {
          releaseId,
          releaseTitle,
        });

        if (!release) {
          return {
            success: false as const,
            error: releaseTitle
              ? `Release "${releaseTitle}" not found. Available releases: ${formatAvailableReleases(releases)}`
              : `Which release should I pitch? Available releases: ${formatAvailableReleases(releases)}`,
          };
        }

        const destination = resolvePitchDestination({
          target,
          platform,
          taskTitle,
          taskCategory,
          instructions,
        });

        if (!destination) {
          return {
            success: false as const,
            needsTarget: true as const,
            error: `Where do you want to pitch it? Choose: ${PITCH_TARGET_OPTIONS_TEXT}.`,
            targetOptions: PITCH_TARGETS,
          };
        }

        const pitchInput = await buildPitchInput(resolvedProfileId, release.id);

        const result = await generatePitchDraft({
          input: pitchInput,
          destination,
          instructions,
          identity: {
            userId: identity.clerkUserId,
            sessionId: identity.conversationId,
          },
          artistRules,
        });

        const updated = await updateOwnedReleaseGeneratedPitches({
          releaseId: release.id,
          creatorProfileId: resolvedProfileId,
          generatedPitches: result.pitch,
        });

        if (!updated) {
          return {
            success: false as const,
            error: 'Release not found or unauthorized',
          };
        }

        return {
          success: true as const,
          releaseTitle: release.title,
          destinationLabel: destination.label,
          target: destination.target,
          pitch: result.pitch,
          copyText: result.pitch.subjectLine
            ? `Subject: ${result.pitch.subjectLine}\n\n${result.pitch.body}`
            : result.pitch.body,
        };
      } catch (error) {
        Sentry.captureException(error, {
          tags: { feature: 'chat-pitch-generation' },
          extra: { releaseTitle, releaseId, profileId: resolvedProfileId },
        });

        return {
          success: false as const,
          error: isArtistRuleViolation(error)
            ? 'That pitch broke one of your artist rules, so I held it back.'
            : 'Failed to generate pitches. Please try again.',
        };
      }
    },
  });
}
