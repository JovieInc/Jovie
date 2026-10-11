/**
 * Copy-floor gate for AI-generated text written on a customer's behalf
 * (JOV-6616, canon/VOICE.md): pitches, bios, fan emails, DSP bio sync. Volume
 * tier — deterministic lintCopy, no tokens, microseconds. Runtime callers on
 * a send or persist boundary must not ship text with a blocking finding.
 */

import { lintCopy } from '@jovie/copy';

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
