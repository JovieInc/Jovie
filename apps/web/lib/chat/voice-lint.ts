/**
 * Jovie persona voice lint (JOV-3806).
 *
 * Thin adapter over @jovie/copy, the one executable copy rule set (policy:
 * canon/VOICE.md). Kept so existing callers and the response-bank promotion
 * gate keep their `lintVoice` contract; do not add rules here.
 */
import { lintCopy } from '@jovie/copy';
import {
  ARTIST_RULE_REPLY_FALLBACK,
  type EnforcedArtistRule,
  findArtistRuleViolations,
} from '@/lib/artist-rules/gate';
import { repairCopyFloorText } from '@/lib/chat/copy-floor-repair';

export interface VoiceLintViolation {
  readonly rule: string;
  readonly match: string;
}

export interface VoiceLintResult {
  readonly ok: boolean;
  readonly violations: readonly VoiceLintViolation[];
}

/** Lint a single user-facing Jovie line in the persona register. */
export function lintVoice(text: string): VoiceLintResult {
  const { ok, blocking } = lintCopy(text, { register: 'jovie-persona' });
  return {
    ok,
    violations: blocking.map(finding => ({
      rule: finding.rule,
      match: finding.match,
    })),
  };
}

/**
 * Persisted replacement for a completed streamed reply that fails the copy
 * floor (JOV-6616). The stream itself cannot be blocked mid-flight, so the
 * floor is enforced at the persist boundary; the violation is logged.
 */
export const ASSISTANT_REPLY_FALLBACK =
  'That answer missed the mark. Ask again and I will take another pass.';

/**
 * Persisted replacement when the model finishes with blank artist-facing text
 * (ASS-95). Covers tool-only turns and silent safety refuses so the artist
 * always sees a usable draft-hold next step, never an empty bubble.
 */
export const EMPTY_ASSISTANT_REPLY_FALLBACK =
  'I will draft that and hold it for your yes. I do not send, post, or spend until you confirm.';

export interface GatedAssistantReply {
  readonly text: string;
  readonly violations: readonly VoiceLintViolation[];
}

/**
 * Gate a completed assistant reply against the copy floor and the artist's
 * own rules. Mechanical violations (dashes) are rewritten first, as the floor
 * requires; only a reply that still fails is replaced with the safe fallback.
 * A reply that names someone the artist asked never to feature is held back.
 * Blank text (including tool-only turns) is replaced with a draft-hold
 * fallback so the artist never sees an empty bubble (ASS-95).
 * Returns the violations (artist rules by id, never by name) so the caller
 * can log which rules fired.
 */
export function gateAssistantReply(
  text: string,
  context?: { readonly artistRules?: readonly EnforcedArtistRule[] }
): GatedAssistantReply {
  const repaired = repairCopyFloorText(text);
  if (!repaired.trim()) {
    return {
      text: EMPTY_ASSISTANT_REPLY_FALLBACK,
      violations: [{ rule: 'empty-reply', match: '' }],
    };
  }
  const ruleViolations = findArtistRuleViolations(
    repaired,
    context?.artistRules
  ).map(violation => ({
    rule: `artist-rule:${violation.category}`,
    match: violation.ruleId,
  }));
  if (ruleViolations.length > 0) {
    return { text: ARTIST_RULE_REPLY_FALLBACK, violations: ruleViolations };
  }
  const { ok, violations } = lintVoice(repaired);
  return { text: ok ? repaired : ASSISTANT_REPLY_FALLBACK, violations };
}

/**
 * Text the completed assistant reply the artist / live helpfulness eval
 * should score (ASS-95). Blank model text becomes the draft-hold fallback so
 * tool-only and silent-refuse turns are never scored as `reply.text: ''`.
 * Copy-floor violations keep the raw text + `persistedAsFallback` so scoring
 * still fail-closes on floor breaks (JOV-6616).
 */
export function surfaceCompletedAssistantReply(
  text: string,
  context?: { readonly artistRules?: readonly EnforcedArtistRule[] }
): {
  readonly text: string;
  readonly persistedAsFallback?: true;
  readonly violations: readonly VoiceLintViolation[];
} {
  const gated = gateAssistantReply(text, context);
  const copyFloorSwapped =
    text.trim().length > 0 && gated.text === ASSISTANT_REPLY_FALLBACK;
  if (copyFloorSwapped) {
    return {
      text,
      persistedAsFallback: true,
      violations: gated.violations,
    };
  }
  return { text: gated.text, violations: gated.violations };
}
