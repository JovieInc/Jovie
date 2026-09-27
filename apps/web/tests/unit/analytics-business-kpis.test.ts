import { describe, expect, it } from 'vitest';
import {
  assertQualifiedForOptimization,
  CANONICAL_BUSINESS_KPIS,
  DURABLE_REQUIRED_FAMILIES,
  evaluateKpiQualification,
  hasValidAuthority,
  isDurableAuthority,
} from '@/lib/analytics/business-kpis';

// ---------------------------------------------------------------------------
// Registry integrity — explicit, versioned, owned definitions
// ---------------------------------------------------------------------------

describe('CANONICAL_BUSINESS_KPIS', () => {
  it('every KPI has a label, definition, source, dedupe key, owner, version, and freshness SLA', () => {
    for (const [key, def] of Object.entries(CANONICAL_BUSINESS_KPIS)) {
      expect(def.label, `${key}.label`).toBeTruthy();
      expect(def.definition, `${key}.definition`).toBeTruthy();
      expect(def.source, `${key}.source`).toBeTruthy();
      expect(def.dedupeKey, `${key}.dedupeKey`).toBeTruthy();
      expect(def.owner, `${key}.owner`).toBeTruthy();
      expect(def.version, `${key}.version`).toBeTruthy();
      expect(def.freshnessSlaHours, `${key}.freshnessSlaHours`).toBeGreaterThan(
        0
      );
    }
  });

  it('every KPI declares a durable authority — no business KPI may be client-only', () => {
    for (const [key, def] of Object.entries(CANONICAL_BUSINESS_KPIS)) {
      expect(
        def.authority,
        `${key} must not be sourced from client events`
      ).not.toBe('client_event');
      expect(
        isDurableAuthority(def.authority),
        `${key} must have a durable authority`
      ).toBe(true);
    }
  });

  it('revenue KPIs are anchored to billing-provider receipts', () => {
    for (const [key, def] of Object.entries(CANONICAL_BUSINESS_KPIS)) {
      if (def.family === 'revenue') {
        expect(def.authority, `${key}`).toBe('billing_provider');
        expect(def.source, `${key}`).toContain('stripe');
      }
    }
  });

  it('money-or-activation families satisfy the durability rule', () => {
    for (const [key, def] of Object.entries(CANONICAL_BUSINESS_KPIS)) {
      if (DURABLE_REQUIRED_FAMILIES.includes(def.family)) {
        expect(hasValidAuthority(def), `${key}`).toBe(true);
      }
    }
  });
});

describe('hasValidAuthority', () => {
  it('rejects non-provider authority for revenue', () => {
    expect(
      hasValidAuthority({
        ...CANONICAL_BUSINESS_KPIS.mrr,
        authority: 'database',
      })
    ).toBe(false);
  });

  it('rejects client_event for activation-family KPIs', () => {
    expect(
      hasValidAuthority({
        ...CANONICAL_BUSINESS_KPIS.signups,
        authority: 'client_event',
      })
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Qualification gate — provenance + freshness required
// ---------------------------------------------------------------------------

describe('evaluateKpiQualification', () => {
  const now = new Date('2026-09-26T12:00:00Z');
  const fresh = { asOf: new Date('2026-09-26T10:00:00Z') };

  it('qualifies evidence with matching provenance and fresh as-of', () => {
    const result = evaluateKpiQualification(
      'signups',
      {
        definitionVersion: CANONICAL_BUSINESS_KPIS.signups.version,
        authority: 'database',
        ...fresh,
      },
      now
    );
    expect(result).toEqual({ qualified: true, failures: [] });
  });

  it('fails closed when provenance is missing entirely', () => {
    expect(evaluateKpiQualification('mrr', null, now)).toEqual({
      qualified: false,
      failures: ['missing_provenance'],
    });
    expect(
      evaluateKpiQualification(
        'mrr',
        { definitionVersion: CANONICAL_BUSINESS_KPIS.mrr.version },
        now
      )
    ).toEqual({ qualified: false, failures: ['missing_provenance'] });
  });

  it('rejects a definition-version mismatch', () => {
    const result = evaluateKpiQualification(
      'signups',
      {
        definitionVersion: 'analytics.business-kpis/v0',
        authority: 'database',
        ...fresh,
      },
      now
    );
    expect(result.failures).toContain('definition_version_mismatch');
    expect(result.qualified).toBe(false);
  });

  it('rejects an authority mismatch (e.g. client-derived value for a DB KPI)', () => {
    const result = evaluateKpiQualification(
      'profile_claims',
      {
        definitionVersion: CANONICAL_BUSINESS_KPIS.profile_claims.version,
        authority: 'client_event',
        ...fresh,
      },
      now
    );
    expect(result.failures).toContain('authority_mismatch');
  });

  it('rejects evidence stale beyond the freshness SLA', () => {
    const result = evaluateKpiQualification(
      'signups',
      {
        definitionVersion: CANONICAL_BUSINESS_KPIS.signups.version,
        authority: 'database',
        asOf: new Date('2026-09-20T12:00:00Z'),
      },
      now
    );
    expect(result.failures).toContain('stale_evidence');
  });

  it('rejects malformed as-of timestamps', () => {
    const result = evaluateKpiQualification(
      'signups',
      {
        definitionVersion: CANONICAL_BUSINESS_KPIS.signups.version,
        authority: 'database',
        asOf: 'not-a-date',
      },
      now
    );
    expect(result.failures).toContain('stale_evidence');
  });

  it('requires user + session/version attribution for experiment exposures', () => {
    const base = {
      definitionVersion: CANONICAL_BUSINESS_KPIS.experiment_exposures.version,
      authority: 'database' as const,
      ...fresh,
    };
    expect(
      evaluateKpiQualification('experiment_exposures', base, now).failures
    ).toContain('missing_attribution');
    expect(
      evaluateKpiQualification(
        'experiment_exposures',
        { ...base, attribution: { userId: 'u1' } },
        now
      ).failures
    ).toContain('missing_attribution');
    expect(
      evaluateKpiQualification(
        'experiment_exposures',
        {
          ...base,
          attribution: { userId: 'u1', sessionId: 's1', version: 'v2' },
        },
        now
      )
    ).toEqual({ qualified: true, failures: [] });
  });
});

describe('assertQualifiedForOptimization', () => {
  const now = new Date('2026-09-26T12:00:00Z');

  it('throws on unqualified evidence', () => {
    expect(() => assertQualifiedForOptimization('mrr', null, now)).toThrow(
      /not qualified/
    );
  });

  it('passes on qualified evidence', () => {
    expect(() =>
      assertQualifiedForOptimization(
        'active_subscriptions',
        {
          definitionVersion:
            CANONICAL_BUSINESS_KPIS.active_subscriptions.version,
          authority: 'billing_provider',
          asOf: new Date('2026-09-26T11:00:00Z'),
        },
        now
      )
    ).not.toThrow();
  });
});
