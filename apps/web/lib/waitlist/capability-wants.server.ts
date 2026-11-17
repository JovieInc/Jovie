import 'server-only';

import type { DbOrTransaction } from '@/lib/db';
import { capabilityWants } from '@/lib/db/schema/waitlist';

/**
 * Persist what a person said they want / objected to / already uses, in their
 * words (JOV-6655). Extracted from access-request so the intake flow stays
 * under its company size baseline; call inside the intake transaction.
 */
export async function insertChatCapabilityWants(
  tx: DbOrTransaction,
  entryId: string,
  interviewResponses:
    | {
        readonly currentWorkflow?: string | null;
        readonly biggestBlocker?: string | null;
        readonly launchGoal?: string | null;
      }
    | null
    | undefined
): Promise<void> {
  const answers = [
    { kind: 'current_tool', text: interviewResponses?.currentWorkflow },
    { kind: 'objection', text: interviewResponses?.biggestBlocker },
    { kind: 'want', text: interviewResponses?.launchGoal },
  ]
    .map(answer => ({ ...answer, text: (answer.text ?? '').trim() }))
    .filter(answer => answer.text.length > 0);
  if (answers.length === 0) return;
  await tx.insert(capabilityWants).values(
    answers.map(answer => ({
      waitlistEntryId: entryId,
      kind: answer.kind,
      text: answer.text,
      capabilityKey: null,
      source: 'onboarding_chat',
    }))
  );
}
