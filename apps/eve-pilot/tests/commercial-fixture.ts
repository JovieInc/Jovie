import type { CommercialSnapshot } from '../agent/lib/summer-commercial-projection';
export const NOW = new Date('2026-09-04T18:00:00Z');
export const m = (value: number) => ({ value, sourceId: 'record-1' });
export function snapshot(): CommercialSnapshot {
  return {
    schema: 'jovie.summer-commercial.snapshot/v1',
    sources: [
      {
        id: 'record-1',
        reference: 'https://records.example/receipt/1',
        revision: 'revision-1',
        observedAt: NOW.toISOString(),
        basis: 'observed',
      },
    ],
    candidates: [
      {
        id: 'thumbnails',
        product: 'jovie-thumbnails',
        kind: 'commercial',
        safetyCleared: true,
        held: false,
        noAuto: false,
        consentCleared: true,
        readinessCleared: true,
        lybCanaryPassed: false,
        gateSourceId: 'record-1',
        paidValueCompletions: m(1),
        collectedCashCents: m(50000),
        contributionMarginCents: m(30000),
        additionalFounderMinutesPerDay: m(30),
        daysToCash: m(1),
        incrementalSpendCents: m(0),
        repeatedUsefulJobs: null,
        founderMinutesSaved: null,
        usefulJobsPerWeekGain: null,
        reliabilityBasisPointsGain: null,
        reusedProductCount: null,
        implementationCostCents: null,
        ongoingCostCents: null,
        daysToBenefit: null,
      },
    ],
    activeCommercialId: null,
    recurringMrrCents: null,
    collectedCashCents: m(500000),
    committedOperatingCostCents: m(120000),
    employerCompensationCostCents: null,
    availableCashAfterObligationsCents: null,
    recordedFounderMinutesPerDay: m(60),
  };
}
