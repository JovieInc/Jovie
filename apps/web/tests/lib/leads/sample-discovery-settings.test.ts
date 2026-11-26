import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEARCH_QUERY_COST_USD } from '@/lib/leads/constants';
import {
  hasEnabledMusicArtistQuery,
  SAMPLE_LEAD_DISCOVERY_COLUMNS,
  SAMPLE_LEAD_DISCOVERY_PATCH,
  sampleLeadDiscoveryDailyCeilingUsd,
  shouldSeedDiscoveryKeywords,
} from '@/lib/leads/sample-discovery-settings';

describe('sample lead discovery settings', () => {
  it('turns discovery on for 100 searches and leaves sends and auto-ingest off', () => {
    expect(SAMPLE_LEAD_DISCOVERY_PATCH).toEqual({
      enabled: true,
      discoveryEnabled: true,
      dailyQueryBudget: 100,
      autoIngestEnabled: false,
    });
    expect(SAMPLE_LEAD_DISCOVERY_COLUMNS).toEqual([
      'enabled',
      'discovery_enabled',
      'daily_query_budget',
      'auto_ingest_enabled',
    ]);
    expect(sampleLeadDiscoveryDailyCeilingUsd()).toBe(1.5);
    expect(
      SAMPLE_LEAD_DISCOVERY_PATCH.dailyQueryBudget *
        SEARCH_QUERY_COST_USD.serpapi
    ).toBe(1.5);
    expect('dailySendCap' in SAMPLE_LEAD_DISCOVERY_PATCH).toBe(false);
    expect('dmTemplate' in SAMPLE_LEAD_DISCOVERY_PATCH).toBe(false);
  });

  it('seeds keywords only when none are enabled', () => {
    expect(shouldSeedDiscoveryKeywords(0)).toBe(true);
    expect(shouldSeedDiscoveryKeywords(25)).toBe(false);
    expect(
      hasEnabledMusicArtistQuery([
        { query: 'site:linktr.ee "rapper" "spotify"', enabled: true },
      ])
    ).toBe(true);
    expect(
      hasEnabledMusicArtistQuery([
        { query: 'site:linktr.ee "rapper" "spotify"', enabled: false },
      ])
    ).toBe(false);
  });

  it('writes only the approved columns', () => {
    const script = readFileSync(
      resolve(__dirname, '../../../scripts/enable-sample-lead-discovery.ts'),
      'utf8'
    );
    const start = script.indexOf('UPDATE lead_pipeline_settings');
    const update = script.slice(start, script.indexOf('WHERE id', start));
    expect(script).toContain('SAMPLE_LEAD_DISCOVERY_PATCH');
    expect(update).toContain('enabled = ${patch.enabled}');
    expect(update).toContain('discovery_enabled = ${patch.discoveryEnabled}');
    expect(update).toContain('daily_query_budget = ${patch.dailyQueryBudget}');
    expect(update).toContain(
      'auto_ingest_enabled = ${patch.autoIngestEnabled}'
    );
    expect(update).not.toContain('daily_send_cap');
    expect(update).not.toContain('dm_template');
    expect(script).toContain('FEATURE_INSTANTLY_OUTBOUND');
  });
});
