import type { MemorySourceType } from '@/lib/db/schema/memory';
import { normalizeMemoryName } from '@/lib/memory/evidence';
import type {
  RecordFileContractState,
  RecordFileRegistrationTarget,
  RecordFileTagKind,
} from './taxonomy';

/**
 * Deterministic record-file classifier.
 *
 * Tags a source thread from metadata only: subject, sender name and domain,
 * date and participants. It never reads a message body. A thread no rule
 * matches stays untagged; the classifier does not guess.
 */

/** A sender or participant. The address local part is never kept. */
export interface RecordFileSender {
  readonly name: string | null;
  readonly domain: string | null;
}

export interface RecordFileThreadMetadata {
  readonly sourceRecordId: string;
  readonly sourceType: MemorySourceType;
  readonly externalId: string | null;
  readonly subject: string | null;
  readonly sender: RecordFileSender;
  /** ISO-8601 timestamp of the thread's latest known message. */
  readonly date: string | null;
  readonly participants: readonly RecordFileSender[];
}

export interface RecordFileTag {
  readonly kind: RecordFileTagKind;
  /** 0..1, from the strongest rule that matched. */
  readonly confidence: number;
  readonly reason: string;
  /** Stable id of the rule that produced the tag. */
  readonly rule: string;
  readonly registrationTarget?: RecordFileRegistrationTarget;
  readonly contractState?: RecordFileContractState;
}

/** Signals that feed gap detection without being tags of their own. */
export type RecordFileThreadHint = 'vocal' | 'credit_dispute' | 'credit_fixed';

export interface RecordFileThreadClassification {
  readonly tags: readonly RecordFileTag[];
  readonly hints: readonly RecordFileThreadHint[];
  /** Subject with reply/forward prefixes removed, lowercased. */
  readonly subjectKey: string | null;
  /** Subject with signature-status words removed; links sent and signed copies. */
  readonly contractKey: string | null;
}

export interface RecordFileClassifierContext {
  /** People already on the record; their threads are collaborator threads. */
  readonly collaborators?: readonly RecordFileSender[];
}

interface RuleResult {
  readonly kind: RecordFileTagKind;
  readonly confidence: number;
  readonly reason: string;
  readonly registrationTarget?: RecordFileRegistrationTarget;
}

interface SubjectRule extends RuleResult {
  readonly id: string;
  readonly pattern: RegExp;
}

interface SenderDomainRule extends RuleResult {
  readonly id: string;
  readonly domains: readonly string[];
  /** When set, the subject must also match (for senders with mixed mail). */
  readonly requireSubject?: RegExp;
}

interface SenderNameRule extends RuleResult {
  readonly id: string;
  readonly pattern: RegExp;
}

export const RECORD_FILE_SUBJECT_RULES: readonly SubjectRule[] = [
  {
    id: 'subject.split_sheet',
    pattern: /\bsplit[\s-]?sheets?\b/i,
    kind: 'split_sheet',
    confidence: 0.9,
    reason: 'subject names a split sheet',
  },
  {
    id: 'subject.split_change',
    pattern:
      /\bsplits?\b.*\b(change|changes|changed|update|updated|amend\w*|revis\w*|correct\w*)\b|\b(change|update|amend\w*|revis\w*)\b.*\bsplits?\b/i,
    kind: 'split_change',
    confidence: 0.85,
    reason: 'subject describes a change to splits',
  },
  {
    id: 'subject.contract',
    pattern:
      /\b(agreement|contract|licen[cs]e|deal memo|side letter|term sheet)\b/i,
    kind: 'contract',
    confidence: 0.85,
    reason: 'subject names an agreement',
  },
  {
    id: 'subject.esign',
    pattern:
      /\b(please (docu)?sign|for (your )?signature|signature requested|review and sign)\b/i,
    kind: 'contract',
    confidence: 0.8,
    reason: 'subject is a signature request',
  },
  {
    id: 'subject.remix',
    pattern: /\bremix(es|ed|er|ers)?\b/i,
    kind: 'remix',
    confidence: 0.8,
    reason: 'subject mentions a remix',
  },
  {
    id: 'subject.mastering',
    pattern: /\bmaster(s|ed|ing)?\b(?!\s+(use|recording|rights|owner))/i,
    kind: 'mastering',
    confidence: 0.75,
    reason: 'subject mentions a master or mastering pass',
  },
  {
    id: 'subject.mix',
    pattern: /\b(mix|mixes|mixdown|mixing|mix notes)\b/i,
    kind: 'mix',
    confidence: 0.7,
    reason: 'subject mentions a mix pass',
  },
  {
    id: 'subject.distribution',
    pattern:
      /\b(distribution|distributor|delivered to (stores|dsps)|(is|now|went) live|in stores|takedown|release (approved|delivered|rejected))\b/i,
    kind: 'distribution',
    confidence: 0.7,
    reason: 'subject reports a distribution delivery',
  },
  {
    id: 'subject.metadata_delivery',
    pattern: /\b(metadata|isrcs?|upcs?|label copy|credits sheet)\b/i,
    kind: 'metadata_delivery',
    confidence: 0.75,
    reason: 'subject is about release metadata',
  },
  {
    id: 'subject.registration.pro',
    pattern: /\b(ascap|bmi|sesac|gmr|prs|socan|apra)\b/i,
    kind: 'registration',
    registrationTarget: 'pro',
    confidence: 0.85,
    reason: 'subject names a performing rights organisation',
  },
  {
    id: 'subject.registration.soundexchange',
    pattern: /\bsound\s?exchange\b/i,
    kind: 'registration',
    registrationTarget: 'soundexchange',
    confidence: 0.9,
    reason: 'subject names SoundExchange',
  },
  {
    id: 'subject.registration.youtube',
    pattern: /\b(content ?id|youtube claims?|copyright claims?)\b/i,
    kind: 'registration',
    registrationTarget: 'youtube_content_id',
    confidence: 0.85,
    reason: 'subject is about YouTube claims',
  },
  {
    id: 'subject.registration.publishing_admin',
    pattern:
      /\b(publishing admin\w*|admin(istration)? agreement|sub-?publish\w*|work registration|song registration)\b/i,
    kind: 'registration',
    registrationTarget: 'publishing_admin',
    confidence: 0.8,
    reason: 'subject is about publishing administration',
  },
  {
    id: 'subject.artwork',
    pattern: /\b(artwork|cover art|album art|single art|art files?)\b/i,
    kind: 'artwork',
    confidence: 0.85,
    reason: 'subject is about artwork',
  },
  {
    id: 'subject.pitch',
    pattern: /\b(pitch|pitching|playlist submission|editorial submission)\b/i,
    kind: 'pitch',
    confidence: 0.75,
    reason: 'subject is a pitch',
  },
  {
    id: 'subject.sync',
    pattern: /\b(sync|synchroni[sz]ation|music supervisor|sync brief)\b/i,
    kind: 'sync',
    confidence: 0.75,
    reason: 'subject is about sync',
  },
  {
    id: 'subject.stats',
    pattern:
      /\b(royalty statement|statement|streams? report|monthly report|analytics|stats)\b/i,
    kind: 'stats',
    confidence: 0.7,
    reason: 'subject is a statement or stats report',
  },
];

export const RECORD_FILE_SENDER_DOMAIN_RULES: readonly SenderDomainRule[] = [
  {
    id: 'sender.registration.pro',
    domains: [
      'ascap.com',
      'bmi.com',
      'sesac.com',
      'globalmusicrights.com',
      'prsformusic.com',
      'socan.com',
    ],
    kind: 'registration',
    registrationTarget: 'pro',
    confidence: 0.9,
    reason: 'sender is a performing rights organisation',
  },
  {
    id: 'sender.registration.soundexchange',
    domains: ['soundexchange.com'],
    kind: 'registration',
    registrationTarget: 'soundexchange',
    confidence: 0.95,
    reason: 'sender is SoundExchange',
  },
  {
    id: 'sender.registration.publishing_admin',
    domains: ['songtrust.com', 'kobaltmusic.com', 'sentricmusic.com'],
    kind: 'registration',
    registrationTarget: 'publishing_admin',
    confidence: 0.85,
    reason: 'sender is a publishing administrator',
  },
  {
    id: 'sender.registration.youtube',
    domains: ['youtube.com'],
    requireSubject: /\b(claims?|content ?id|copyright)\b/i,
    kind: 'registration',
    registrationTarget: 'youtube_content_id',
    confidence: 0.85,
    reason: 'sender is YouTube and the subject is about claims',
  },
  {
    id: 'sender.distribution',
    domains: [
      'distrokid.com',
      'tunecore.com',
      'cdbaby.com',
      'amuse.io',
      'unitedmasters.com',
      'awal.com',
      'ditto.fm',
      'symphonicdistribution.com',
    ],
    kind: 'distribution',
    confidence: 0.85,
    reason: 'sender is a distributor',
  },
  {
    id: 'sender.esign',
    domains: [
      'docusign.net',
      'docusign.com',
      'hellosign.com',
      'dropboxsign.com',
      'echosign.com',
      'adobesign.com',
      'pandadoc.net',
    ],
    kind: 'contract',
    confidence: 0.8,
    reason: 'sender is an e-signature service',
  },
];

export const RECORD_FILE_SENDER_NAME_RULES: readonly SenderNameRule[] = [
  {
    id: 'sender_name.mastering',
    pattern: /\bmastering\b/i,
    kind: 'mastering',
    confidence: 0.85,
    reason: 'sender is a mastering house',
  },
  {
    id: 'sender_name.distribution',
    pattern: /\b(distribution|distro)\b/i,
    kind: 'distribution',
    confidence: 0.75,
    reason: 'sender is a distribution company',
  },
  {
    id: 'sender_name.publishing_admin',
    pattern: /\b(publishing|songs admin|music admin)\b/i,
    kind: 'registration',
    registrationTarget: 'publishing_admin',
    confidence: 0.7,
    reason: 'sender is a publishing company',
  },
];

const SIGNED_PATTERN =
  /\b(completed|signed|fully executed|executed|countersigned)\b/i;
const SENT_PATTERN =
  /\b(please (docu)?sign|for (your )?signature|signature requested|review and sign|sent you a document)\b/i;
const VOCAL_PATTERN = /\b(vocals?|vocalist|topline|singer|vox)\b/i;
const CREDIT_DISPUTE_PATTERN =
  /\b(wrong artist|wrong credit|incorrect(ly)? credit\w*|misattribut\w*|credit (error|issue|correction))\b/i;
const CREDIT_FIX_PATTERN = /\b(fixed|corrected|resolved|updated)\b/i;
/** A fix word that is negated or still pending reads as an open dispute. */
const CREDIT_FIX_NEGATED_PATTERN =
  /\b(not|never|cannot|no longer|\w+n['’]t|yet to be|needs? to be|to be)\s+(?:\w+\s+){0,2}(fixed|corrected|resolved|updated)\b/i;

const REPLY_PREFIX_PATTERN =
  /^\s*(re|fw|fwd|aw|completed|please docusign|signature requested|reminder)\s*:\s*/i;
const SIGNATURE_STATUS_PATTERN =
  /\b(fully executed|countersigned|signed copy|signed|executed|for (your )?signature|please (docu)?sign|signature requested|review and sign|returned)\b/gi;

export function stripReplyPrefixes(subject: string): string {
  let current = subject;
  let previous = '';
  while (current !== previous) {
    previous = current;
    current = current.replace(REPLY_PREFIX_PATTERN, '');
  }
  return current.trim();
}

function toKey(value: string): string | null {
  const key = normalizeMemoryName(value.replaceAll(/[^\p{L}\p{N}]+/gu, ' '));
  return key.length > 0 ? key : null;
}

export function subjectKey(subject: string | null): string | null {
  if (!subject) return null;
  return toKey(stripReplyPrefixes(subject));
}

export function contractKey(subject: string | null): string | null {
  if (!subject) return null;
  return toKey(
    stripReplyPrefixes(subject).replaceAll(SIGNATURE_STATUS_PATTERN, ' ')
  );
}

/**
 * Reads a `From:`-style header into a display name and domain. The local
 * part of the address is dropped so it never reaches the record file.
 */
export function parseSenderHeader(
  header: string | null | undefined
): RecordFileSender {
  const value = header?.trim() ?? '';
  if (!value) return { name: null, domain: null };
  const angle = /^(.*)<([^>]*)>\s*$/.exec(value);
  const rawName = angle ? angle[1] : value.includes('@') ? '' : value;
  const address = angle ? angle[2] : value.includes('@') ? value : '';
  const at = address.lastIndexOf('@');
  const domain =
    at >= 0
      ? address
          .slice(at + 1)
          .trim()
          .toLowerCase() || null
      : null;
  const name = rawName?.replaceAll(/^["'\s]+|["'\s]+$/g, '') || null;
  return { name, domain };
}

function domainMatches(domain: string | null, candidates: readonly string[]) {
  if (!domain) return false;
  return candidates.some(
    candidate => domain === candidate || domain.endsWith(`.${candidate}`)
  );
}

function sameSender(a: RecordFileSender, b: RecordFileSender): boolean {
  if (a.name && b.name) {
    return normalizeMemoryName(a.name) === normalizeMemoryName(b.name);
  }
  return false;
}

function contractStateFor(
  subject: string
): RecordFileContractState | undefined {
  if (SIGNED_PATTERN.test(subject)) return 'signed';
  if (SENT_PATTERN.test(subject)) return 'sent';
  return undefined;
}

function tagIdentity(tag: {
  kind: RecordFileTagKind;
  registrationTarget?: RecordFileRegistrationTarget;
}): string {
  return `${tag.kind}:${tag.registrationTarget ?? ''}`;
}

export function classifyRecordFileThread(
  thread: RecordFileThreadMetadata,
  context: RecordFileClassifierContext = {}
): RecordFileThreadClassification {
  const subject = thread.subject?.trim() ?? '';
  const senderName = thread.sender.name ?? '';
  const matches = new Map<string, RecordFileTag>();

  const add = (rule: string, result: RuleResult) => {
    const identity = tagIdentity(result);
    const existing = matches.get(identity);
    if (existing && existing.confidence >= result.confidence) return;
    matches.set(identity, {
      kind: result.kind,
      confidence: result.confidence,
      reason: result.reason,
      rule,
      ...(result.registrationTarget
        ? { registrationTarget: result.registrationTarget }
        : {}),
    });
  };

  if (subject) {
    for (const rule of RECORD_FILE_SUBJECT_RULES) {
      if (rule.pattern.test(subject)) add(rule.id, rule);
    }
  }
  for (const rule of RECORD_FILE_SENDER_DOMAIN_RULES) {
    if (!domainMatches(thread.sender.domain, rule.domains)) continue;
    if (rule.requireSubject && !rule.requireSubject.test(subject)) continue;
    add(rule.id, rule);
  }
  if (senderName) {
    for (const rule of RECORD_FILE_SENDER_NAME_RULES) {
      if (rule.pattern.test(senderName)) add(rule.id, rule);
    }
  }

  const collaborator = context.collaborators?.find(person =>
    [thread.sender, ...thread.participants].some(other =>
      sameSender(person, other)
    )
  );
  if (collaborator) {
    add('participant.collaborator', {
      kind: 'collaborator_thread',
      confidence: 0.8,
      reason: `${collaborator.name} is on the record and on this thread`,
    });
  }

  const hints: RecordFileThreadHint[] = [];
  if (VOCAL_PATTERN.test(subject)) hints.push('vocal');
  if (CREDIT_DISPUTE_PATTERN.test(subject)) {
    const fixed =
      CREDIT_FIX_PATTERN.test(subject) &&
      !CREDIT_FIX_NEGATED_PATTERN.test(subject);
    hints.push(fixed ? 'credit_fixed' : 'credit_dispute');
    add(fixed ? 'subject.credit_fixed' : 'subject.credit_dispute', {
      kind: 'metadata_delivery',
      confidence: 0.6,
      reason: fixed
        ? 'subject reports a credit correction'
        : 'subject reports a wrong credit',
    });
  }

  const contractState = contractStateFor(subject);
  const tags = [...matches.values()].map(tag =>
    tag.kind === 'contract' && contractState ? { ...tag, contractState } : tag
  );
  tags.sort(
    (a, b) => b.confidence - a.confidence || a.kind.localeCompare(b.kind)
  );

  const hasContract = tags.some(tag => tag.kind === 'contract');
  return {
    tags,
    hints,
    subjectKey: subjectKey(thread.subject),
    contractKey: hasContract ? contractKey(thread.subject) : null,
  };
}
