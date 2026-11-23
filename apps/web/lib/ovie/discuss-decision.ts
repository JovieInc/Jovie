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

/** "2:32 AM PT": the founder reads Pacific time, never a raw ISO stamp. */
function pacificTime(iso: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
  }).format(at);
  return `${time} PT`;
}

export function discussDecisionPrompt(
  caseId: string,
  item:
    | (Pick<OvieInboxCase, 'title' | 'decisionDefault'> &
        Partial<Pick<OvieInboxCase, 'recommendation'>>)
    | undefined
): string {
  if (!item) return `Discuss inbox decision ${caseId} with me.`;
  const approve = item.recommendation?.trim();
  const does = approve
    ? ` Approving would: ${approve}.`.replace(/\.\.$/u, '.')
    : '';
  const when = item.decisionDefault
    ? pacificTime(item.decisionDefault.deadline)
    : null;
  const fallback = item.decisionDefault
    ? ` If I stay silent it ${item.decisionDefault.decision === 'approve' ? 'approves' : 'rejects'}${when ? ` at ${when}` : ''}.`
    : '';
  return `Discuss this decision with me: "${item.title}" (${caseId}).${does}${fallback} If it's safe and reversible, why not just ship it?`;
}
