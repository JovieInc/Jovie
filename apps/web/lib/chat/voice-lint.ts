/**
 * Jovie persona voice lint (JOV-3806).
 *
 * Thin adapter over @jovie/copy, the one executable copy rule set (policy:
 * canon/VOICE.md). Kept so existing callers and the response-bank promotion
 * gate keep their `lintVoice` contract; do not add rules here.
 */
import { lintCopy } from '@jovie/copy';
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

export interface GatedAssistantReply {
  readonly text: string;
  readonly violations: readonly VoiceLintViolation[];
}

/**
 * Gate a completed assistant reply against the copy floor. Mechanical
 * violations (dashes) are rewritten first, as the floor requires; only a reply
 * that still fails is replaced with the safe fallback. Returns the violations
 * so the caller can log which rules fired.
 */
export function gateAssistantReply(text: string): GatedAssistantReply {
  const repaired = repairCopyFloorText(text);
  const { ok, violations } = lintVoice(repaired);
  return { text: ok ? repaired : ASSISTANT_REPLY_FALLBACK, violations };
}
