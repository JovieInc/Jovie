import { describe, expect, it } from 'vitest';
import {
  buildShippingOpsCard,
  isSummerOpsCard,
  NOT_MEASURED_LABEL,
  opsCardFromToolOutput,
  renderOpsCardText,
  SUMMER_OPS_CARD_SCHEMA,
} from '@/lib/ovie/ops-card';
import {
  measuredCount,
  type ShippingStateProjection,
  unknownProjection,
} from '@/lib/ovie/shipping-state';

function projectionFixture(): ShippingStateProjection {
  const projection = unknownProjection({
    sequence: 7,
    observationTimestamp: '2026-09-27T09:00:00.000Z',
    emissionTimestamp: '2026-09-27T09:00:01.000Z',
    latencyMs: 1200,
    publishing: true,
    lastError: null,
  });
  return {
    ...projection,
    state: 'fresh',
    sources: {
      ...projection.sources,
      'github-native-merge-queue': {
        ...projection.sources['github-native-merge-queue'],
        counts: {
          ...projection.sources['github-native-merge-queue'].counts,
          queued: measuredCount(3),
          openPullRequests: measuredCount(5),
        },
      },
      'symphony-runtime': {
        ...projection.sources['symphony-runtime'],
        counts: {
          ...projection.sources['symphony-runtime'].counts,
          running: measuredCount(2),
          blocked: measuredCount(0),
        },
      },
    },
  };
}

describe('summer ops card contract', () => {
  it('builds a shipping card with only measured values', () => {
    const card = buildShippingOpsCard(projectionFixture());
    expect(card.schema).toBe(SUMMER_OPS_CARD_SCHEMA);
    expect(card.kind).toBe('shipping');
    expect(card.state).toBe('fresh');
    const facts = Object.fromEntries(
      card.facts.map(fact => [fact.label, fact.value])
    );
    expect(facts['Merge queue']).toBe('3');
    expect(facts['Open pull requests']).toBe('5');
    expect(facts['Running tasks']).toBe('2');
    expect(facts['Blocked']).toBe('0');
    expect(facts['Retrying']).toBe(NOT_MEASURED_LABEL);
    expect(facts['CI green']).toBe(NOT_MEASURED_LABEL);
    expect(isSummerOpsCard(card)).toBe(true);
  });

  it('emits a series only from measured counts', () => {
    const card = buildShippingOpsCard(projectionFixture());
    expect(card.series?.points).toEqual([
      { label: 'Queued', value: 3 },
      { label: 'Open PRs', value: 5 },
      { label: 'Running', value: 2 },
      { label: 'Blocked', value: 0 },
    ]);
  });

  it('omits the series when nothing is measured', () => {
    const card = buildShippingOpsCard(
      unknownProjection({
        sequence: 1,
        observationTimestamp: '2026-09-27T09:00:00.000Z',
        emissionTimestamp: '2026-09-27T09:00:01.000Z',
        latencyMs: 0,
        publishing: false,
        lastError: null,
      })
    );
    expect(card.series).toBeNull();
    expect(card.facts.every(fact => fact.value === NOT_MEASURED_LABEL)).toBe(
      true
    );
  });

  it('extracts a valid card from tool output and rejects malformed payloads', () => {
    const card = buildShippingOpsCard(projectionFixture());
    expect(opsCardFromToolOutput({ success: true, card })).toEqual(card);
    expect(opsCardFromToolOutput({ card: { schema: 'other' } })).toBeNull();
    expect(opsCardFromToolOutput(undefined)).toBeNull();
    expect(opsCardFromToolOutput({ card: 'not-an-object' })).toBeNull();
  });

  it('renders flat text containing every fact and series point', () => {
    const card = buildShippingOpsCard(projectionFixture());
    const text = renderOpsCardText(card);
    for (const fact of card.facts) {
      expect(text).toContain(`${fact.label}: ${fact.value}`);
    }
    for (const point of card.series?.points ?? []) {
      expect(text).toContain(`${point.label} ${point.value}`);
    }
  });
});
