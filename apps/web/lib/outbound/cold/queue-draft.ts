import { lintCopy } from '@jovie/copy';
import type { OutboundTarget } from '../approval';
import type { OutboundCopy } from '../types';
import { type ColdComplianceContext, checkColdCompliance } from './compliance';
import { type ColdArtifactFacts, composeColdSequence } from './draft';

/** Read-only inputs, bound to the exact profile and recipient being reviewed. */
export interface ColdQueueDraftContext {
  readonly profileId: string;
  readonly recipientEmail: string;
  readonly artifact: ColdArtifactFacts;
  readonly fromName: string;
  readonly fromAddress: string;
  readonly compliance: ColdComplianceContext;
}

/** Email-only: the cold sequence/compliance contract does not cover DMs. */
export function coldQueueDraft(
  target: OutboundTarget,
  context: ColdQueueDraftContext | null | undefined,
  saved: (OutboundCopy & { readonly revision: string }) | null,
  now: Date
): (OutboundCopy & { readonly revision: string | null }) | null {
  if (
    !context ||
    context.profileId !== target.creatorProfileId ||
    context.recipientEmail !== target.contactEmail?.trim().toLowerCase()
  )
    return null;
  const facts = context.artifact;
  if (
    !facts.artistName.trim() ||
    !Number.isSafeInteger(facts.releaseCount) ||
    facts.releaseCount < 0 ||
    !Number.isSafeInteger(facts.platformCount) ||
    facts.platformCount < 0
  )
    return null;
  if (saved && saved.channel !== 'email') return null;
  const draft = saved ? null : composeColdSequence(facts, now);
  if (draft?.lint.length) return null;
  const step = draft?.steps[0];
  const copy =
    saved ??
    (step
      ? {
          channel: 'email' as const,
          subject: step.subject,
          body: step.body,
          revision: null,
        }
      : null);
  if (
    !copy ||
    lintCopy(`${copy.subject ?? ''}\n\n${copy.body}`, {
      register: 'founder-tim',
    }).blocking.length
  )
    return null;
  return checkColdCompliance(
    {
      fromName: context.fromName,
      fromAddress: context.fromAddress,
      subject: copy.subject ?? '',
      body: copy.body,
    },
    context.compliance
  ).ok
    ? copy
    : null;
}
