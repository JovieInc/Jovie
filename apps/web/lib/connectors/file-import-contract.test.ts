import { describe, expect, it } from 'vitest';
import { getGrantedConnectorCapabilities } from './capabilities';
import { DISTRIBUTOR_IMPORT_DECISION } from './file-import-contract';
import {
  CONNECTOR_MANIFEST_IDS,
  CONNECTOR_PROVIDER_IDS,
  CONNECTOR_REGISTRY,
  DISTRIBUTOR_IDS,
  getConnectorDefinition,
  getConnectorDefinitions,
  getConnectorManifests,
  getFileImportDefinitions,
  getOAuthScopesForBundle,
} from './registry';
import {
  connectorDefinitionSchema,
  connectorRegistrySchema,
} from './registry-validation';

const definition = CONNECTOR_REGISTRY.tunecore;
describe('file import manifests', () => {
  it('registers every explicitly identified distributor in sorted position', () => {
    expect(DISTRIBUTOR_IDS).toEqual([
      'awal',
      'cdbaby',
      'distrokid',
      'routenote',
      'symphonic',
      'tunecore',
      'unitedmasters',
    ]);
    expect(Object.keys(CONNECTOR_REGISTRY)).toEqual([
      ...CONNECTOR_MANIFEST_IDS,
    ]);
    expect(getConnectorManifests().map(item => item.id)).toEqual([
      ...CONNECTOR_MANIFEST_IDS,
    ]);
    expect(getFileImportDefinitions().map(item => item.id)).toEqual([
      ...DISTRIBUTOR_IDS,
    ]);
    expect(connectorRegistrySchema.safeParse(CONNECTOR_REGISTRY).success).toBe(
      true
    );
    expect(getConnectorDefinition('tunecore')).toBe(definition);
  });
  it('records file-only approval, official evidence, report detail, and explicit unknown versions', () => {
    for (const manifest of getFileImportDefinitions()) {
      expect(manifest.approval).toMatchObject({
        status: 'approved',
        scope: 'account_holder_supplied_files',
        requiresPerImportReceipt: true,
      });
      expect(manifest.approval.evidenceRef).toContain('JOV-8430');
      expect(manifest.reports[0].documentationUrl).toMatch(/^https:\/\//);
      expect(manifest.reports[0].formatVersion.status).toBe('unknown');
      expect(
        manifest.capabilities.every(
          capability => capability.availability === 'unavailable'
        )
      ).toBe(true);
      expect(manifest.automatedAccess.availability).toBe('unavailable');
      expect(manifest).not.toHaveProperty('oauthScopes');
      expect(manifest).not.toHaveProperty('tokenHandler');
    }
    expect(CONNECTOR_REGISTRY.awal.reports[0].documentationStatus).toBe(
      'unverified'
    );
    expect(CONNECTOR_REGISTRY.unitedmasters.reports[0]).toMatchObject({
      format: 'pdf',
      granularity: 'statement_summary',
    });
  });
  it.each(['oauth', 'api', 'sftp', 'browser_automation', 'password'])(
    'rejects unsupported transport %s',
    transport => {
      expect(
        connectorDefinitionSchema.safeParse({ ...definition, transport })
          .success
      ).toBe(false);
    }
  );
  it('rejects invented OAuth metadata, approval, automation, parsers, and report support', () => {
    for (const patch of [
      { oauthScopes: [] },
      { tokenHandler: 'shared_token_vault' },
      { oauthBundle: 'tunecore' },
      { approval: { ...definition.approval, status: 'unknown' } },
      {
        automatedAccess: { availability: 'available', reason: 'undocumented' },
      },
      {
        capabilities: definition.capabilities.map(item => ({
          ...item,
          availability: 'available',
        })),
      },
      {
        capabilities: [
          definition.capabilities[0],
          definition.capabilities[0],
          definition.capabilities[0],
        ],
      },
      {
        reports: [
          { ...definition.reports[0], documentationStatus: 'unverified' },
        ],
      },
      {
        reports: [
          { ...definition.reports[0], formatVersion: { status: 'identified' } },
        ],
      },
    ])
      expect(
        connectorDefinitionSchema.safeParse({ ...definition, ...patch }).success
      ).toBe(false);
  });
  it('keeps file manifests out of OAuth settings, permission grants, and persistence ids', () => {
    expect(getConnectorDefinitions().map(item => item.id)).toEqual([
      ...CONNECTOR_PROVIDER_IDS,
    ]);
    for (const manifest of getFileImportDefinitions()) {
      expect(
        getGrantedConnectorCapabilities(manifest, 'connected', [])
      ).toEqual([]);
      expect(CONNECTOR_PROVIDER_IDS).not.toContain(manifest.id);
    }
    expect(getOAuthScopesForBundle('google')).not.toEqual([]);
  });
  it('rejects registry key mismatches and missing manifests', () => {
    expect(
      connectorRegistrySchema.safeParse({
        ...CONNECTOR_REGISTRY,
        awal: { ...CONNECTOR_REGISTRY.awal, id: 'tunecore' },
      }).success
    ).toBe(false);
    expect(
      connectorRegistrySchema.safeParse({
        ...CONNECTOR_REGISTRY,
        awal: undefined,
      }).success
    ).toBe(false);
  });
  it('records the evidence threshold for reevaluating automated access', () => {
    expect(DISTRIBUTOR_IMPORT_DECISION.shipNow).toContain(
      'account-holder-authorized'
    );
    for (const requirement of [
      'Official documentation',
      'approved scopes',
      'credentials',
      'successful read receipt',
    ]) {
      expect(DISTRIBUTOR_IMPORT_DECISION.reevaluateWhen).toContain(requirement);
    }
    expect(DISTRIBUTOR_IMPORT_DECISION.then).toContain(
      'unsupported capabilities remain unavailable'
    );
  });
});
