import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildCatalog, materializeCatalog } from './catalog';
import {
  CHARTMETRIC_CONTRACTS,
  CHARTMETRIC_ENDPOINT_COUNT,
  CHARTMETRIC_ENDPOINTS,
  CHARTMETRIC_REFERENCE,
} from './chartmetric-endpoints';
import { rowIsPass } from './score';

describe('Chartmetric official reference inventory', () => {
  it('includes the refresh operations omitted by the public text index', () => {
    const keys = CHARTMETRIC_ENDPOINTS.map(
      ([method, path]) => `${method} ${path}`
    );
    expect(keys).toContain('POST /api/artist/{id}/tiktok/refresh');
    expect(keys).toContain('POST /api/playlist/{platform}/{id}/refresh');
    expect(keys).toHaveLength(157);
    expect(CHARTMETRIC_ENDPOINT_COUNT).toBe(157);
    expect(new Set(keys).size).toBe(157);
    expect(keys).toEqual([...keys].sort());
  });

  it('retains every operation and query name from the independent OpenAPI snapshot', () => {
    // Extracted from the official schema, not the candidate's rows. The digest
    // freezes all 157 operations and their sorted query names, including arrays.
    const witness = CHARTMETRIC_CONTRACTS.map(
      ({ method, path, contract }) =>
        `${method} ${path}|${contract.queryParameters.join(',')}`
    ).join('\n');
    expect(createHash('sha256').update(witness).digest('hex')).toBe(
      '97f0f754f63b3bb9045f5512d5deb50f082f9cbcd3206847edc590f7754ecb3d'
    );
    expect(CHARTMETRIC_REFERENCE.version).toBe('1.0.1575');
  });

  it('allocates the full denominator without turning documentation into runtime evidence', () => {
    const rows = materializeCatalog(buildCatalog(), []).filter(
      row => row.vendor === 'chartmetric'
    );
    const families: Record<string, number> = {};
    for (const row of rows) {
      const contract = row.contract;
      expect(contract).toBeDefined();
      if (!contract) throw new Error(`unallocated row: ${row.id}`);
      families[contract.family] = (families[contract.family] ?? 0) + 1;
      expect(contract.ownerIssue).toBe(
        contract.family === 'catalog-performance' ? 'JOV-7827' : 'JOV-7828'
      );
      expect(contract.implementationIssue).toMatch(/^JOV-\d+$/);
      expect(contract.source).toEqual(CHARTMETRIC_REFERENCE);
      expect(row.docUrl).toBe(contract.source.url);
      expect(rowIsPass(row)).toBe(false);
      expect(row.evidence).toBeUndefined();
      expect(row.blocker?.reviewTrigger).not.toContain('refresh token exists');
    }
    expect(rows).toHaveLength(157);
    expect(families).toEqual({
      'audience-geography': 9,
      brands: 8,
      'catalog-performance': 95,
      'curator-discovery': 11,
      events: 7,
      'search-discovery': 12,
      'social-audience': 5,
      'social-relationships': 10,
    });
  });

  it('preserves historical, sensitive and opaque semantics as unresolved targets', () => {
    const contracts = new Map(
      CHARTMETRIC_CONTRACTS.map(row => [row.path, row.contract])
    );
    expect(
      contracts.get('/api/artist/{id}/where-people-listen')?.queryParameters
    ).toEqual([
      'date',
      'includeEstimates',
      'latest',
      'limit',
      'offset',
      'since',
      'until',
    ]);
    expect(
      contracts.get('/api/artist/{id}/where-people-listen')?.caveat
    ).toContain('2024-08-12');
    expect(
      contracts.get('/api/artist/{id}/instagram-audience-stats')?.caveat
    ).toContain('2026-10-01');
    expect(contracts.get('/api/brand/v2/{brandId}')?.caveat).toContain(
      'different universes'
    );
    expect(
      contracts.get('/api/artist/{id}/similar-artists/by-configurations')
        ?.caveat
    ).toContain('absent from declared parameters');
    expect(
      contracts.get('/api/track/{id}/tiktok-top-influencers')?.queryParameters
    ).toContain('ethnicity[]');
    expect(contracts.get('/api/track/list/filter')?.queryParameters).toContain(
      'range_period'
    );
  });
});
