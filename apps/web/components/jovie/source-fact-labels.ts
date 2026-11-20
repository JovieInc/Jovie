import type { EnrichedFact } from '@/lib/profile-facts/enrichment';

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

export function sourceMetricLabels(fact: EnrichedFact): readonly string[] {
  const compact = sourceFactLabel(fact);
  if (!compact || fact.value?.type !== 'number' || !fact.unit) return [];
  const full = `${new Intl.NumberFormat('en-US').format(fact.value.value)} ${fact.unit}`;
  const values = [compact, full];
  if (fact.predicate === 'spotify.followers') {
    values.push(
      ...values.map(value => value.replace(' followers', ' Spotify followers'))
    );
  }
  return [...new Set(values)];
}
