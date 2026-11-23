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
 * Prefer `buildEmptyAssistantReplyFallback` when the ask is known so the
 * stub names the release/artifact (ASS-103 live 45268223488 grounding).
 */
export const EMPTY_ASSISTANT_REPLY_FALLBACK =
  'I will draft that and hold it for your yes. I do not send, post, or spend until you confirm.';

export interface EmptyReplyFallbackContext {
  readonly ask?: string;
  readonly namedReleases?: readonly string[];
}

export interface AssistantGateContext extends EmptyReplyFallbackContext {
  readonly artistRules?: readonly EnforcedArtistRule[];
}

export interface GatedAssistantReply {
  readonly text: string;
  readonly violations: readonly VoiceLintViolation[];
}

function releaseNamedInAsk(
  ask: string,
  namedReleases: readonly string[]
): string | undefined {
  const lower = ask.toLowerCase();
  return [...namedReleases]
    .sort((a, b) => b.length - a.length)
    .find(title => lower.includes(title.toLowerCase()));
}

/** Title-Case multi-word phrases from the ask (e.g. Ambient Evening). */
function titleCasePhrases(ask: string): readonly string[] {
  return ask.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) ?? [];
}

/**
 * Ask-aware refuse→draft-hold stub (ASS-103). When blank model text would
 * otherwise surface the generic EMPTY_ASSISTANT_REPLY_FALLBACK, name the
 * release/artifact from the ask or Discography so grounding_0 / one-rec
 * needles still pass.
 */
export function buildEmptyAssistantReplyFallback(
  context?: EmptyReplyFallbackContext
): string {
  const ask = context?.ask?.trim() ?? '';
  if (!ask) return EMPTY_ASSISTANT_REPLY_FALLBACK;

  const named = releaseNamedInAsk(ask, context?.namedReleases ?? []);
  const phrases = titleCasePhrases(ask);
  const artifact = named ?? phrases[0];
  const lower = ask.toLowerCase();

  if (
    /\bauto[- ]?dm\b/.test(lower) ||
    (/\bdm\b/.test(lower) && (/\btip/.test(lower) || /\bthank/.test(lower)))
  ) {
    return (
      'I will draft one tip thank-you DM and hold it for your yes. ' +
      'I do not auto-DM until you confirm.'
    );
  }

  if (/\b(boost|spend|budget|ads?\b|reel)\b/.test(lower)) {
    const target = named ?? artifact ?? 'that Reel';
    return (
      `I will not boost ${target} until you confirm a budget. ` +
      `I will draft a hold plan for ${target}.`
    );
  }

  if (/\b(email|pitch|send)\b/.test(lower)) {
    const pitchPhrase = phrases.find(phrase =>
      lower.includes(`${phrase.toLowerCase()} pitch`)
    );
    const labeled =
      pitchPhrase != null
        ? `${pitchPhrase} pitch`
        : artifact != null
          ? /\bpitch\b/i.test(artifact)
            ? artifact
            : `${artifact} pitch`
          : /\bpitch\b/.test(lower)
            ? 'pitch'
            : 'that pitch';
    return (
      `I will draft the ${labeled} and hold it for your yes. ` +
      'Nothing emails until you confirm.'
    );
  }

  if (/\b(post|instagram|caption)\b/.test(lower)) {
    const target = named ?? artifact ?? 'that caption';
    return (
      `I will draft the ${target} caption and hold it for your yes. ` +
      'I do not post until you confirm.'
    );
  }

  if (artifact) {
    return (
      `I will draft that for ${artifact} and hold it for your yes. ` +
      'I do not send, post, or spend until you confirm.'
    );
  }

  return EMPTY_ASSISTANT_REPLY_FALLBACK;
}

/**
 * Gate a completed assistant reply against the copy floor and the artist's
 * own rules. Mechanical violations (dashes) are rewritten first, as the floor
 * requires; only a reply that still fails is replaced with the safe fallback.
 * A reply that names someone the artist asked never to feature is held back.
 * Blank text (including tool-only turns) is replaced with a draft-hold
 * fallback so the artist never sees an empty bubble (ASS-95). When `ask` /
 * Discography titles are provided, the empty stub names that artifact
 * (ASS-103). Returns the violations (artist rules by id, never by name) so
 * the caller can log which rules fired.
 */
export function gateAssistantReply(
  text: string,
  context?: AssistantGateContext
): GatedAssistantReply {
  const repaired = repairCopyFloorText(text);
  if (!repaired.trim()) {
    return {
      text: buildEmptyAssistantReplyFallback(context),
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
 * Surface the completed assistant reply the artist / live helpfulness eval
 * should score (ASS-95). Blank model text becomes the draft-hold fallback so
 * tool-only and silent-refuse turns are never scored as `reply.text: ''`.
 * Copy-floor violations keep the raw text + `persistedAsFallback` so scoring
 * still fail-closes on floor breaks (JOV-6616).
 */
export function surfaceCompletedAssistantReply(
  text: string,
  context?: AssistantGateContext
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
