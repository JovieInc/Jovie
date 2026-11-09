/**
 * Copy-floor gate for AI-generated text written on a customer's behalf
 * (JOV-6616, canon/VOICE.md): pitches, bios, fan emails, DSP bio sync. Volume
 * tier — deterministic lintCopy, no tokens, microseconds. Runtime callers on
 * a send or persist boundary must not ship text with a blocking finding.
 */

import { lintCopy } from '@jovie/copy';
import {
  type EnforcedArtistRule,
  findArtistRuleViolations,
} from '@/lib/artist-rules/gate';

export class CopyFloorViolationError extends Error {
  readonly surface: string;
  readonly rules: readonly string[];

  constructor(surface: string, rules: readonly string[]) {
    super(
      `Outbound copy failed the copy floor on ${surface}: ${rules.join(', ')}`
    );
    this.name = 'CopyFloorViolationError';
    this.surface = surface;
    this.rules = rules;
  }
}

/** Blocking copy-floor rules for customer-voice text, or [] when clean. */
export function customerVoiceFloorViolations(
  text: string,
  options?: { readonly headline?: boolean }
): readonly string[] {
  if (!text.trim()) return [];
  const { blocking } = lintCopy(text, {
    register: 'customer-voice',
    ...(options?.headline ? { headline: true } : {}),
  });
  return [...new Set(blocking.map(finding => finding.rule))];
}

/**
 * Throw `CopyFloorViolationError` when customer-voice text hits a blocking
 * floor rule. `surface` names the send/persist boundary for error logs.
 */
export function assertCustomerVoiceFloor(
  text: string,
  surface: string,
  options?: { readonly headline?: boolean }
): void {
  const rules = customerVoiceFloorViolations(text, options);
  if (rules.length > 0) {
    throw new CopyFloorViolationError(surface, rules);
  }
}

/**
 * Throw `CopyFloorViolationError` when outbound text breaks one of the
 * artist's hard rules (someone they don't want featured). Rules are reported
 * by category, never by the protected name.
 */
export function assertArtistRulesFloor(
  text: string,
  rules: readonly EnforcedArtistRule[] | undefined,
  surface: string
): void {
  const violations = findArtistRuleViolations(text, rules);
  if (violations.length > 0) {
    throw new CopyFloorViolationError(surface, [
      ...new Set(violations.map(v => `artist-rule:${v.category}`)),
    ]);
  }
}

/** True when the error came from an artist rule, not the copy floor. */
export function isArtistRuleViolation(error: unknown): boolean {
  return (
    error instanceof CopyFloorViolationError &&
    error.rules.some(rule => rule.startsWith('artist-rule:'))
  );
}
