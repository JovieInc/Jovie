import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { OVIE_THROUGHPUT_TARGETS } from './shipping-home';

// One source of truth: the SLO ratchet baseline owns the shipping targets.
const baseline = JSON.parse(
  readFileSync(
    path.resolve(
      import.meta.dirname,
      '../../../../../docs/metrics/shipping-slo-baseline.json'
    ),
    'utf8'
  )
) as { metrics: Record<string, { value: number }> };

describe('Ovie Home throughput targets', () => {
  it('match the shipping SLO baseline', () => {
    expect(OVIE_THROUGHPUT_TARGETS.queueEjectionRate).toBe(
      baseline.metrics['merge_queue.ejection_rate']?.value
    );
    expect(OVIE_THROUGHPUT_TARGETS.mergesPerDay).toBe(
      baseline.metrics['throughput.merges_per_day']?.value
    );
  });
});
