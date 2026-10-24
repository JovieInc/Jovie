import {
  type EnrichedFact,
  projectPublicEnrichedFacts,
} from '@/lib/profile-facts/enrichment';

/** Only successful assistant tool receipts supply evidence; user prose never does. */
export function sourceFactsByMessage(
  messages: readonly {
    readonly id: string;
    readonly role: string;
    readonly parts?: readonly unknown[];
  }[]
): ReadonlyMap<string, readonly EnrichedFact[]> {
  const result = new Map<string, readonly EnrichedFact[]>();
  let current: readonly EnrichedFact[] = [];
  for (const message of messages) {
    if (message.role === 'assistant') {
      for (const part of message.parts ?? []) {
        if (!part || typeof part !== 'object') continue;
        const receipt = part as Record<string, unknown>;
        if (
          typeof receipt.type !== 'string' ||
          !(
            receipt.type.startsWith('tool-') || receipt.type === 'dynamic-tool'
          ) ||
          receipt.state !== 'output-available' ||
          !receipt.output ||
          typeof receipt.output !== 'object'
        )
          continue;
        const output = receipt.output as Record<string, unknown>;
        if (output.success === false || output.error) continue;
        if (!Array.isArray(output.enrichedFacts)) continue;
        // A new subject/empty receipt revokes the previous evidence scope.
        const subject = output.enrichedFacts[0]?.subject?.id;
        current =
          typeof subject === 'string'
            ? projectPublicEnrichedFacts(output.enrichedFacts, subject)
            : [];
      }
    }
    result.set(message.id, current);
  }
  return result;
}

export function sourceFactLabel(fact: EnrichedFact): string | null {
  if (!fact.value || fact.status === 'inaccessible') return null;
  const value = fact.value;
  if (value.type === 'number') {
    const count = new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value.value);
    return fact.unit ? `${count} ${fact.unit}` : count;
  }
  return value.type === 'text' ? value.value : null;
}

/** Finite formatter aliases only; never attach evidence by fuzzy text matching. */
export function sourceMetricLabels(fact: EnrichedFact): readonly string[] {
  const compact = sourceFactLabel(fact);
  if (!compact || fact.value?.type !== 'number' || !fact.unit) return [];
  const full = `${new Intl.NumberFormat('en-US').format(fact.value.value)} ${fact.unit}`;
  return [
    ...new Set([
      compact,
      full,
      ...(fact.predicate === 'spotify.followers'
        ? [
            compact.replace(' followers', ' Spotify followers'),
            full.replace(' followers', ' Spotify followers'),
          ]
        : []),
    ]),
  ];
}
