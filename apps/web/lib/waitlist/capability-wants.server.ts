import 'server-only';

import { capabilityWants } from '@/lib/db/schema/waitlist';

/**
 * Persist what a person said they want / objected to / already uses, in their
 * words (JOV-6655). Extracted from access-request so the intake flow stays
 * under its company size baseline; call inside the intake transaction.
 */
export async function insertChatCapabilityWants(
  tx: { insert: (table: unknown) => { values: (rows: unknown) => unknown } },
  entryId: string,
  interviewResponses: {
    readonly currentWorkflow?: string | null;
    readonly biggestBlocker?: string | null;
    readonly launchGoal?: string | null;
  } | null
): Promise<void> {
  const answers = [
    interviewResponses?.currentWorkflow,
    interviewResponses?.biggestBlocker,
    interviewResponses?.launchGoal,
  ]
    .map(answer => (answer ?? '').trim())
    .filter(answer => answer.length > 0);
  if (answers.length === 0) return;
  await tx.insert(capabilityWants).values(
    answers.map(answer => ({
      waitlistEntryId: entryId,
      kind:
        answer === interviewResponses?.biggestBlocker ? 'objection' : 'want',
      text: answer,
      capabilityKey: null,
      source: 'onboarding_chat',
    }))
  );
}
