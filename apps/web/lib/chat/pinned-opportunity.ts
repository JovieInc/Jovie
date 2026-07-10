/**
 * Server-side pinned-opportunity context for card-opened chat (JOV-3933 / GH #13174).
 *
 * UI-only pinning is insufficient — the model must receive card facts in the
 * system prompt (same fix-class as JOV-3537 entity hydration).
 */

export interface PinnedOpportunityContext {
  readonly id: string;
  readonly title: string;
  readonly why: string;
  readonly typeLabel: string;
  readonly primaryActionLabel?: string;
  readonly signalType?: string;
}

/**
 * Build the "Pinned opportunity" system-prompt block.
 * Returns `undefined` when no pin is active so the prompt stays stable.
 */
export function buildPinnedOpportunityBlock(
  pin: PinnedOpportunityContext | null | undefined
): string | undefined {
  if (!pin?.id || !pin.title) {
    return undefined;
  }

  const lines = [
    '## Pinned opportunity',
    'The artist opened this chat from an opportunity card. Treat the following as ground truth for this turn — answer using these facts without requiring the user to restate them.',
    `- suggested_actions id: ${pin.id}`,
    `- title: ${pin.title}`,
  ];

  if (pin.typeLabel) {
    lines.push(`- type: ${pin.typeLabel}`);
  }
  if (pin.signalType) {
    lines.push(`- signal: ${pin.signalType}`);
  }
  if (pin.why) {
    lines.push(`- evidence / why: ${pin.why}`);
  }
  if (pin.primaryActionLabel) {
    lines.push(`- proposed action: ${pin.primaryActionLabel}`);
  }

  lines.push(
    'If the user starts a clearly unrelated topic, drop the pin and answer normally.'
  );

  return lines.join('\n');
}
