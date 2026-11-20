import type { OvieInboxCase } from './inbox';

/**
 * `?discuss=<case id>` on Ovie chat starts a Summer conversation about one
 * inbox decision. The prompt is built from the id and the live inbox, never
 * from free text in the URL, so a link cannot put words in the founder's mouth.
 */
export const DISCUSS_DECISION_PARAM = 'discuss';

const CASE_ID = /^[a-z][a-z-]{1,31}:[\w.:-]{1,200}$/u;

export function parseDiscussCaseId(value: string | null): string | null {
  return value && CASE_ID.test(value) ? value : null;
}

export function discussDecisionPrompt(
  caseId: string,
  item: Pick<OvieInboxCase, 'title' | 'decisionDefault'> | undefined
): string {
  if (!item) return `Discuss inbox decision ${caseId} with me.`;
  const fallback = item.decisionDefault
    ? ` If I stay silent it ${item.decisionDefault.decision === 'approve' ? 'approves' : 'rejects'} at ${item.decisionDefault.deadline}.`
    : '';
  return `Discuss this decision with me: "${item.title}" (${caseId}).${fallback} What would change your recommendation?`;
}
