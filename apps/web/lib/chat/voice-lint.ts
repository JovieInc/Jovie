/**
 * Jovie persona voice lint (JOV-3806).
 *
 * Thin adapter over @jovie/copy, the one executable copy rule set (policy:
 * canon/VOICE.md). Kept so existing callers and the response-bank promotion
 * gate keep their `lintVoice` contract; do not add rules here.
 */
import { lintCopy } from '@jovie/copy';

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
