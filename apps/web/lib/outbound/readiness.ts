/**
 * Onboarding readiness: what is left before Tim starts outbound, computed
 * from live owners (ACQUISITION_ELIGIBLE, the funnel judge receipt, the
 * outbound queue, profile evidence, the send path and blocking Linear work).
 * Tim's words: he is "waiting on the backlog to go down and certifications
 * to clear", so every item reports a count or a state that can shrink.
 */

export type ReadinessStatus = 'green' | 'red' | 'unknown' | 'info';

export interface ReadinessItem {
  readonly id: string;
  readonly label: string;
  readonly status: ReadinessStatus;
  readonly detail: string;
  readonly owner: string;
  readonly href: string | null;
  readonly children?: readonly ReadinessItem[];
}

export interface OutboundReadiness {
  readonly generatedAt: string;
  readonly ready: number;
  readonly total: number;
  readonly items: readonly ReadinessItem[];
}

export interface FunnelJudgeReceipt {
  readonly at: string;
  readonly pass: boolean;
  readonly payers: number;
  readonly worst: { readonly stepId: string; readonly score: number } | null;
}

export interface LinearIssueState {
  readonly identifier: string;
  readonly title: string;
  readonly url: string;
  readonly stateType: string;
  readonly stateName: string;
}

export interface ReadinessInputs {
  readonly now: Date;
  readonly cone: {
    readonly eligible: boolean;
    readonly requirements: readonly {
      readonly id: string;
      readonly label: string;
      readonly status: 'green' | 'red' | 'unknown';
      readonly owner: string;
      readonly nextAction: string;
    }[];
  } | null;
  readonly funnel: FunnelJudgeReceipt | null;
  readonly queue: {
    readonly ready: number;
    readonly certified: number;
    readonly approved: number;
    readonly needsProfile: number;
  } | null;
  readonly evidence: {
    readonly built: number;
    readonly covered: number;
  } | null;
  readonly sendPath: {
    readonly pipelineEnabled: boolean;
    readonly instantlyEnabled: boolean;
    readonly instantlyConfigured: boolean;
    readonly pendingRouted: number;
    readonly dailySendCap: number;
  } | null;
  /** Null when Linear could not be read. */
  readonly issues: ReadonlyMap<string, LinearIssueState> | null;
  readonly openGrowthLoopChildren: number | null;
}

/** Linear work that blocks onboarding artists, in the order it unblocks. */
export const READINESS_BLOCKING_ISSUES = [
  { id: 'JOV-7192', label: 'Golden Path Nightly green', owner: 'billing' },
  { id: 'JOV-7794', label: 'Proof gaps on the $199 path', owner: 'proof' },
  {
    id: 'JOV-7628',
    label: 'Consent, quiet hours, creator-generic copy (#20462)',
    owner: 'lanes',
  },
  {
    id: 'JOV-2332',
    label: 'Dogfood principals: Doppler steps (Tim)',
    owner: 'Tim',
  },
  {
    id: 'JOV-7697',
    label: 'Dogfood: Tim OK on synthetic_principal_passage',
    owner: 'Tim',
  },
  {
    id: 'JOV-6650',
    label: 'Ability and intent bands for ranking',
    owner: 'lanes',
  },
  {
    id: 'JOV-7768',
    label: 'Pre-release profiles as full pages',
    owner: 'profiles',
  },
] as const;

const linearUrl = (id: string) => `https://linear.app/jovie/issue/${id}`;
const DAY_MS = 86_400_000;

function issueItem(
  spec: (typeof READINESS_BLOCKING_ISSUES)[number],
  issues: ReadinessInputs['issues']
): ReadinessItem {
  const issue = issues?.get(spec.id);
  const done = issue?.stateType === 'completed';
  return {
    id: `issue:${spec.id}`,
    label: spec.label,
    status: !issue ? 'unknown' : done ? 'green' : 'red',
    detail: issue ? `${spec.id} · ${issue.stateName}` : `${spec.id} · not read`,
    owner: spec.owner,
    href: issue?.url ?? linearUrl(spec.id),
  };
}

export function buildOutboundReadiness(
  input: ReadinessInputs
): OutboundReadiness {
  const items: ReadinessItem[] = [];

  items.push({
    id: 'cone',
    label: 'Revenue cone (ACQUISITION_ELIGIBLE)',
    status: !input.cone ? 'unknown' : input.cone.eligible ? 'green' : 'red',
    detail: !input.cone
      ? 'Eligibility could not be read; outbound stays held.'
      : input.cone.eligible
        ? 'Every $199 cone receipt is green.'
        : `${input.cone.requirements.filter(r => r.status !== 'green').length} of ${input.cone.requirements.length} receipts not green`,
    owner: 'revenue',
    href: null,
    children: input.cone?.requirements.map(requirement => ({
      id: `cone:${requirement.id}`,
      label: requirement.label,
      status: requirement.status,
      detail: requirement.status === 'green' ? 'Green' : requirement.nextAction,
      owner: requirement.owner,
      href: null,
    })),
  });

  const funnel = input.funnel;
  const funnelAgeDays = funnel
    ? Math.floor((input.now.getTime() - Date.parse(funnel.at)) / DAY_MS)
    : null;
  items.push({
    id: 'funnel',
    label: 'Funnel persona judge passes',
    status: !funnel ? 'unknown' : funnel.pass ? 'green' : 'red',
    detail: !funnel
      ? 'No funnel judge receipt in this build.'
      : `${funnel.pass ? 'Pass' : 'Fail'} · ${funnel.payers}/5 would pay${
          funnel.worst
            ? ` · worst step ${funnel.worst.stepId} ${funnel.worst.score}/10`
            : ''
        } · ${funnelAgeDays === 0 ? 'today' : `${funnelAgeDays}d ago`}`,
    owner: 'funnel',
    href: linearUrl('JOV-7753'),
  });

  const queue = input.queue;
  items.push({
    id: 'certifications',
    label: 'Certifications pending',
    status: !queue
      ? 'unknown'
      : queue.certified + queue.approved > 0
        ? 'green'
        : 'red',
    detail: !queue
      ? 'Outbound queue could not be read.'
      : `${queue.ready - queue.needsProfile} built profiles to review · ${queue.needsProfile} waiting on a profile build · ${queue.certified} certified · ${queue.approved} approved`,
    owner: 'Tim',
    href: '/app/ov/outbound',
  });

  const evidence = input.evidence;
  items.push({
    id: 'evidence',
    label: 'Built profiles carry evidence',
    status: !evidence
      ? 'unknown'
      : evidence.built > 0 && evidence.covered === evidence.built
        ? 'green'
        : 'red',
    detail: !evidence
      ? 'Evidence coverage could not be read.'
      : `${evidence.covered} of ${evidence.built} built profiles have any DSP, surface or release evidence`,
    owner: 'resolver (JOV-6746)',
    href: linearUrl('JOV-6746'),
  });

  const send = input.sendPath;
  const sendOpen =
    send?.pipelineEnabled && send.instantlyEnabled && send.instantlyConfigured;
  items.push({
    id: 'send-path',
    label: 'Outreach send path',
    status: !send ? 'unknown' : sendOpen ? 'green' : 'red',
    detail: !send
      ? 'Pipeline settings could not be read.'
      : `${sendOpen ? 'Open' : 'Closed'} · pipeline ${send.pipelineEnabled ? 'on' : 'off'} · Instantly ${send.instantlyEnabled ? 'on' : 'off'}${send.instantlyConfigured ? '' : ' (not configured)'} · ${send.pendingRouted} routed, none sends without your approval · cap ${send.dailySendCap}/day`,
    owner: 'outbound',
    href: null,
  });

  items.push({
    id: 'backlog',
    label: 'Growth-loop backlog (JOV-7415)',
    status:
      input.openGrowthLoopChildren === null
        ? 'unknown'
        : input.openGrowthLoopChildren === 0
          ? 'green'
          : 'red',
    detail:
      input.openGrowthLoopChildren === null
        ? 'Linear could not be read.'
        : `${input.openGrowthLoopChildren} open child issues`,
    owner: 'lanes',
    href: linearUrl('JOV-7415'),
    children: READINESS_BLOCKING_ISSUES.map(spec =>
      issueItem(spec, input.issues)
    ),
  });

  items.push({
    id: 'boundary',
    label: 'Boundary: what needs your per-message approval',
    status: 'info',
    detail:
      'Cold outreach (email and DM to leads) needs your approval per person and per message revision. The auto-accept approval email to people who signed up themselves is transactional and is not gated.',
    owner: 'outbound',
    href: null,
  });
  items.push({
    id: 'offer-calendar',
    label: 'Offer idea: "fill your calendar with bookings"',
    status: 'info',
    detail:
      'Founder and investor targets would need Calendly and Cal.com integrations. Not built.',
    owner: 'offer',
    href: null,
  });

  const gated = items.filter(item => item.status !== 'info');
  return {
    generatedAt: input.now.toISOString(),
    ready: gated.filter(item => item.status === 'green').length,
    total: gated.length,
    items,
  };
}

/** Last line of scripts/funnel-judge/trend.jsonl, or null. */
export function parseFunnelTrend(text: string): FunnelJudgeReceipt | null {
  const lines = text.split('\n').filter(line => line.trim());
  for (const line of lines.reverse()) {
    try {
      const value = JSON.parse(line) as Partial<FunnelJudgeReceipt>;
      if (typeof value.at === 'string' && typeof value.pass === 'boolean')
        return {
          at: value.at,
          pass: value.pass,
          payers: typeof value.payers === 'number' ? value.payers : 0,
          worst: value.worst ?? null,
        };
    } catch {
      // A torn line is skipped; older lines still count.
    }
  }
  return null;
}
