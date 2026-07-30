import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readConnectorSource = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('native Gmail brand-deal producer contract', () => {
  it('syncs Gmail without requiring Calendar and persists metadata only', () => {
    const source = readConnectorSource('../extract-and-propose.ts');
    expect(source).toContain('buildGmailOpportunityQuery');
    expect(source).toContain('TIM_BRAND_DEAL_SOURCE_ACCOUNT');
    expect(source).toContain('gmailAccounts[0]');
    expect(source).toContain('gmailAccountId');
    expect(source).not.toContain('CONNECTOR_PROVIDERS.google_calendar');
    expect(source).toContain('snippet: m.snippet.slice(0, 200)');
    expect(source).not.toMatch(/\bbody:\s*m\./);
  });

  it('selects one highest-ranked candidate and emits it through the trusted boundary', () => {
    const source = readConnectorSource('../enrichment/pipelines/gmail.ts');
    const emitter = readConnectorSource('../brand-deal-opportunity-emitter.ts');
    expect(source).toContain('selectHighestRankedGmailBrandDealCandidate');
    expect(source).toContain('emitBrandDealOpportunity');
    expect(source).toContain(
      'evidenceObjectId: brandDealCandidate.evidenceObjectId'
    );
    expect(source).not.toContain('candidate: brandDealCandidate.candidate');
    expect(emitter).toContain('payload: externalObjects.payload');
    expect(emitter).not.toMatch(/readonly candidate:/);
    expect(emitter).toContain(':brand-deal-slot:');
  });

  it('keeps Gmail retrieval read-only and metadata-scoped', () => {
    const source = readConnectorSource('./client.ts');
    expect(source).toContain("format: 'metadata'");
    expect(source).not.toContain("format: 'full'");
    expect(source).toContain('"paid creator campaign"');
  });
});
