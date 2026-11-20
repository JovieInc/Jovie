import 'server-only';

import { submitChatFeedback } from '@/lib/chat/submit-feedback';
import { coordinateLinearWork } from '@/lib/ovie/linear-coordination';
import { createLiveLinearCoordinationDeps } from '@/lib/ovie/linear-coordination-live';
import { OVIE_LINEAR_TEAM_ID } from '@/lib/ovie/mcp/founder-work';

/**
 * Capability requests: what Jovie chat does when it can't do something yet.
 *
 * The founder's requests become a Linear issue on the JOV team, labelled as
 * founder priority, which Summer's triage picks up. Everyone else's go into
 * the feedback closed loop, like submitFeedback.
 */

export type CapabilityRequestKind = 'capability' | 'skill';

export interface CapabilityRequestInput {
  readonly clerkUserId: string;
  readonly founder: boolean;
  readonly conversationId: string | null;
  readonly kind: CapabilityRequestKind;
  readonly request: string;
  readonly skillDraft?: string;
}

export type CapabilityRequestResult =
  | {
      readonly success: true;
      readonly routedTo: 'summer' | 'feedback';
      readonly priority: 'founder' | 'standard';
      readonly identifier?: string;
    }
  | { readonly success: false; readonly error: string };

export const FOUNDER_PRIORITY_LABEL = 'Founder priority';
/** Linear's structured priority (1 = urgent) so triage ranks it, not just the text. */
export const FOUNDER_LINEAR_PRIORITY = 1;

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Linear issue title and body for a founder capability request. */
export function buildFounderCapabilityIssue(
  input: Pick<CapabilityRequestInput, 'kind' | 'request' | 'skillDraft'>
): { readonly title: string; readonly body: string } {
  const what = input.kind === 'skill' ? 'Skill' : 'Capability';
  const title = `${what} request (${FOUNDER_PRIORITY_LABEL}): ${oneLine(input.request, 90)}`;
  const parts = [
    `${FOUNDER_PRIORITY_LABEL}. Tim asked for this inside Jovie chat while using Jovie as an artist. It outranks machine-filed work; Summer still decides when and how it ships.`,
    '',
    '## What he asked for',
    input.request.trim(),
  ];
  if (input.kind === 'skill' && input.skillDraft?.trim()) {
    parts.push(
      '',
      '## Skill draft',
      'Add it as a new folder under apps/web/lib/chat/skills/library with this as its SKILL.md once it reads right, then run node apps/web/scripts/generate-chat-skill-index.mjs.',
      '',
      input.skillDraft.trim()
    );
  }
  parts.push('', '_Filed by Jovie chat (requestCapability)._');
  return { title, body: parts.join('\n') };
}

export async function submitCapabilityRequest(
  input: CapabilityRequestInput
): Promise<CapabilityRequestResult> {
  if (input.founder) {
    const issue = buildFounderCapabilityIssue(input);
    const ref = `jovie-chat:${input.conversationId ?? 'unknown'}`;
    try {
      const result = await coordinateLinearWork(
        {
          action: 'create',
          title: issue.title,
          body: issue.body,
          teamId: OVIE_LINEAR_TEAM_ID,
          founderIntentRef: ref,
          sourceRefs: [ref],
          author: 'jovie-chat',
          priority: FOUNDER_LINEAR_PRIORITY,
        },
        createLiveLinearCoordinationDeps()
      );
      if (result.status === 'ok') {
        return {
          success: true,
          routedTo: 'summer',
          priority: 'founder',
          identifier: result.receipt.identifier,
        };
      }
      // Created but not read back: the issue exists, so never file it twice.
      if (result.status === 'failed' && result.mutated) {
        console.error(
          '[chat] founder capability request unverified:',
          result.code
        );
        return {
          success: true,
          routedTo: 'summer',
          priority: 'founder',
          identifier: result.mutated.identifier,
        };
      }
      console.error('[chat] founder capability request denied:', result.code);
    } catch (error) {
      console.error('[chat] founder capability request failed:', error);
    }
    // Fall through: the request still lands in the feedback loop.
  }

  const label = input.kind === 'skill' ? 'Skill request' : 'Capability request';
  const draft =
    input.kind === 'skill' && input.skillDraft?.trim()
      ? `\n\nSkill draft:\n${input.skillDraft.trim()}`
      : '';
  const prefix = input.founder ? `${label} (${FOUNDER_PRIORITY_LABEL})` : label;
  const saved = await submitChatFeedback({
    clerkUserId: input.clerkUserId,
    message: `${prefix}: ${input.request.trim()}${draft}`.slice(0, 8000),
  });
  if (!saved.success) return saved;
  return {
    success: true,
    routedTo: 'feedback',
    priority: input.founder ? 'founder' : 'standard',
  };
}
