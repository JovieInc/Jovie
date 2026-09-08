/**
 * Curator-first no-draft / no-invent gate for generateReleasePitch.
 * Encodes generate-release-pitch.md refusals as a deterministic floor:
 * do not draft until the checklist is resolved (or UNKNOWN-marked);
 * never invent a listen URL, @handle, or private email.
 */

import {
  getPitchChecklistStatus,
  PITCH_GRILL_PROCEDURE,
  type PitchChecklistInput,
  type PitchChecklistItem,
} from './curator-checklist';

export const RELEASE_PITCH_RULES = `Do not draft until the curator checklist is resolved, or the artist explicitly marks a field UNKNOWN. Never invent a listen URL, @handle, or private email. Include the listen link only when supplied.`;

export const RELEASE_PITCH_RULE_CASE_IDS = [
  'unresolved-checklist-holds-draft',
  'invented-contact-refused',
] as const;

export type ReleasePitchRuleCaseId =
  (typeof RELEASE_PITCH_RULE_CASE_IDS)[number];

export type ReleasePitchRuleCaseResult = {
  readonly id: ReleasePitchRuleCaseId;
  readonly passed: boolean;
  readonly reason: string;
};

export type ReleasePitchDisposition = 'ask' | 'draft';

export type ReleasePitchInventedField = 'listenUrl' | 'handle' | 'email';

export interface GateReleasePitchInput {
  readonly checklist: PitchChecklistInput;
  readonly proposedDraft?: {
    readonly subject?: string | null;
    readonly body?: string | null;
  } | null;
}

export interface ReleasePitchGateResult {
  readonly disposition: ReleasePitchDisposition;
  readonly drafted: boolean;
  readonly draftable: boolean;
  readonly firstMissing: PitchChecklistItem | null;
  readonly subject: string | null;
  readonly body: string | null;
  readonly omittedInvented: readonly ReleasePitchInventedField[];
  readonly reason: string;
}

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const HANDLE_PATTERN = /(?<![A-Za-z0-9._%+-])@([A-Za-z0-9._]+)/g;

const SUPPLIED_LISTEN = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';
const INVENTED_LISTEN = 'https://open.spotify.com/track/inventedlisten';
const INVENTED_HANDLE = '@curator_inbox';
const INVENTED_EMAIL = 'private@label-inbox.example';

type ContactFacts = {
  readonly urls: readonly string[];
  readonly handles: readonly string[];
  readonly emails: readonly string[];
};

function uniqueNormalized(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase().replace(/[.,;:)]+$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed.replace(/[.,;:)]+$/, ''));
  }
  return out;
}

function extractContacts(text: string | null | undefined): ContactFacts {
  const source = text ?? '';
  const urls = uniqueNormalized(
    [...source.matchAll(URL_PATTERN)].map(m => m[0])
  );
  const emails = uniqueNormalized(
    [...source.matchAll(EMAIL_PATTERN)].map(m => m[0])
  );
  const emailSet = new Set(emails.map(email => email.toLowerCase()));
  const handles = uniqueNormalized(
    [...source.matchAll(HANDLE_PATTERN)]
      .map(m => `@${m[1] ?? ''}`)
      .filter(handle => {
        const local = handle.slice(1).toLowerCase();
        return ![...emailSet].some(email => email.startsWith(`${local}@`));
      })
  );
  return { urls, handles, emails };
}

function mergeContacts(...groups: readonly ContactFacts[]): ContactFacts {
  return {
    urls: uniqueNormalized(groups.flatMap(group => group.urls)),
    handles: uniqueNormalized(groups.flatMap(group => group.handles)),
    emails: uniqueNormalized(groups.flatMap(group => group.emails)),
  };
}

function hasContact(list: readonly string[], value: string): boolean {
  const needle = value.trim().toLowerCase();
  return list.some(item => item.toLowerCase() === needle);
}

function stripUnsuppliedContacts(
  text: string,
  supplied: ContactFacts,
  omitted: ReleasePitchInventedField[]
): string {
  let next = text;
  const found = extractContacts(text);

  for (const url of found.urls) {
    if (hasContact(supplied.urls, url)) continue;
    omitted.push('listenUrl');
    next = next.replaceAll(url, '');
  }
  for (const handle of found.handles) {
    if (hasContact(supplied.handles, handle)) continue;
    omitted.push('handle');
    next = next.replaceAll(handle, '');
  }
  for (const email of found.emails) {
    if (hasContact(supplied.emails, email)) continue;
    omitted.push('email');
    next = next.replaceAll(email, '');
  }

  return next.replace(/\s{2,}/g, ' ').trim();
}

function suppliedContacts(input: PitchChecklistInput): ContactFacts {
  const status = getPitchChecklistStatus(input);
  const listenLink =
    status.items.find(
      item => item.id === 'listenLink' && item.status === 'known'
    )?.value ?? null;
  return mergeContacts(
    extractContacts(input.instructions),
    extractContacts(input.whyText),
    extractContacts(listenLink)
  );
}

function sampleChecklist(
  overrides: Partial<PitchChecklistInput> = {}
): PitchChecklistInput {
  return {
    artistName: 'Luna Waves',
    title: 'Neon Reef',
    genres: ['dream pop'],
    releaseDate: '2026-06-19',
    targetPlaylists: ['Pollen'],
    whyText: 'I wrote it after a night swim in Miami.',
    instructions: `Private link ${SUPPLIED_LISTEN} belongs on Pollen.`,
    ...overrides,
  };
}

/** Hold drafts when the curator checklist is unresolved; strip invented contacts. */
export function gateReleasePitch(
  input: GateReleasePitchInput
): ReleasePitchGateResult {
  const status = getPitchChecklistStatus(input.checklist);
  const omittedInvented: ReleasePitchInventedField[] = [];

  if (!status.draftable) {
    return {
      disposition: 'ask',
      drafted: false,
      draftable: false,
      firstMissing: status.firstMissing,
      subject: null,
      body: null,
      omittedInvented,
      reason: `Do not draft until the curator checklist is resolved. Ask for: ${status.firstMissing?.label ?? 'the next missing field'}.`,
    };
  }

  const supplied = suppliedContacts(input.checklist);
  const subject = input.proposedDraft?.subject
    ? stripUnsuppliedContacts(
        input.proposedDraft.subject,
        supplied,
        omittedInvented
      ) || null
    : null;
  const body = input.proposedDraft?.body
    ? stripUnsuppliedContacts(
        input.proposedDraft.body,
        supplied,
        omittedInvented
      )
    : null;

  return {
    disposition: 'draft',
    drafted: true,
    draftable: true,
    firstMissing: status.firstMissing,
    subject,
    body,
    omittedInvented: [...new Set(omittedInvented)],
    reason: omittedInvented.length
      ? 'Draft allowed; invented listen URL, @handle, or private email omitted'
      : 'Curator checklist is resolved; draft may proceed',
  };
}

function outputLeaks(
  result: ReleasePitchGateResult,
  needles: readonly string[]
): boolean {
  const haystack =
    `${result.subject ?? ''}\n${result.body ?? ''}\n${result.reason}`.toLowerCase();
  return needles.some(needle => haystack.includes(needle.toLowerCase()));
}

function evaluateUnresolvedChecklistHoldsDraft(): ReleasePitchRuleCaseResult {
  const incomplete = sampleChecklist({
    whyText: null,
    targetPlaylists: null,
    instructions: null,
  });
  const held = gateReleasePitch({
    checklist: incomplete,
    proposedDraft: {
      subject: 'Pitch for you',
      body: `Listen ${INVENTED_LISTEN} and DM ${INVENTED_HANDLE} or ${INVENTED_EMAIL}.`,
    },
  });
  const unknownMarked = gateReleasePitch({
    checklist: sampleChecklist({
      instructions: `UNKNOWN: listenLink. I wrote it after a night swim in Miami.`,
    }),
  });
  const passed =
    held.disposition === 'ask' &&
    held.drafted === false &&
    held.draftable === false &&
    held.body === null &&
    held.subject === null &&
    held.firstMissing !== null &&
    !outputLeaks(held, [INVENTED_LISTEN, INVENTED_HANDLE, INVENTED_EMAIL]) &&
    unknownMarked.disposition === 'draft' &&
    unknownMarked.draftable === true &&
    PITCH_GRILL_PROCEDURE.includes('Do not call generateReleasePitch') &&
    RELEASE_PITCH_RULES.includes('Do not draft until the curator checklist');
  return {
    id: 'unresolved-checklist-holds-draft',
    passed,
    reason: passed
      ? 'Unresolved checklist holds the draft and does not invent contact fields'
      : 'Unresolved checklist drafted, leaked invented contacts, or blocked an UNKNOWN-marked field',
  };
}

function evaluateInventedContactRefused(): ReleasePitchRuleCaseResult {
  const gated = gateReleasePitch({
    checklist: sampleChecklist(),
    proposedDraft: {
      subject: `Add ${INVENTED_HANDLE}`,
      body: `Listen ${INVENTED_LISTEN} and also ${SUPPLIED_LISTEN}. Email ${INVENTED_EMAIL}.`,
    },
  });
  const kept = gateReleasePitch({
    checklist: sampleChecklist(),
    proposedDraft: {
      body: `Here is the listen link ${SUPPLIED_LISTEN}.`,
    },
  });
  const passed =
    gated.disposition === 'draft' &&
    gated.drafted === true &&
    gated.omittedInvented.includes('listenUrl') &&
    gated.omittedInvented.includes('handle') &&
    gated.omittedInvented.includes('email') &&
    !outputLeaks(gated, [INVENTED_LISTEN, INVENTED_HANDLE, INVENTED_EMAIL]) &&
    (gated.body?.includes(SUPPLIED_LISTEN) ?? false) &&
    kept.body?.includes(SUPPLIED_LISTEN) === true &&
    kept.omittedInvented.length === 0 &&
    RELEASE_PITCH_RULES.includes('Never invent a listen URL');
  return {
    id: 'invented-contact-refused',
    passed,
    reason: passed
      ? 'Invented listen URL, @handle, and private email are omitted; supplied listen URL is kept'
      : 'Invented contact fields were written into the draft or a supplied listen URL was dropped',
  };
}

export function evaluateReleasePitchRuleCase(
  id: ReleasePitchRuleCaseId
): ReleasePitchRuleCaseResult {
  switch (id) {
    case 'unresolved-checklist-holds-draft':
      return evaluateUnresolvedChecklistHoldsDraft();
    case 'invented-contact-refused':
      return evaluateInventedContactRefused();
  }
}

export function evaluateAllReleasePitchRuleCases(): ReleasePitchRuleCaseResult[] {
  return RELEASE_PITCH_RULE_CASE_IDS.map(evaluateReleasePitchRuleCase);
}
