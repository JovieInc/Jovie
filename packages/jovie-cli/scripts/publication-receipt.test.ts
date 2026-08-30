import { describe, expect, it, vi } from 'vitest';

import {
  buildPublicationReceipt,
  NPM_REGISTRY_URL,
  PACKAGE_NAME,
  PUBLICATION_WORKFLOW,
  probeNpmRegistry,
} from './publication-receipt';

const FEATURE_BRANCH_INPUT = {
  homepage: 'https://jov.ie/cli',
  localVersion: '26.8.1',
  sourceSha: 'a'.repeat(40),
  gitRef: 'refs/heads/fallback/JOV-5472-fix',
  originMainSha: 'b'.repeat(40),
  npmTokenPresent: false,
  registryStatus: 404,
} as const;

describe('publication receipt', () => {
  it('records identity, version, registry, SHA, hosted CI, and blocked gates separately', () => {
    const receipt = buildPublicationReceipt(FEATURE_BRANCH_INPUT);

    expect(receipt.identity).toEqual({
      name: PACKAGE_NAME,
      access: 'public',
      provenanceRequired: true,
      registry: NPM_REGISTRY_URL,
      homepage: 'https://jov.ie/cli',
      sourceDirectory: 'packages/jovie-cli',
    });
    expect(receipt.localVersion).toBe('26.8.1');
    expect(receipt.sourceSha).toBe('a'.repeat(40));
    expect(receipt.hostedCi).toBe(PUBLICATION_WORKFLOW);
    expect(receipt.registry).toEqual({
      status: 404,
      published: false,
    });
    expect(receipt.publicationPermitted).toBe(false);
    expect(receipt.blockedBy).toEqual([
      'main-ref',
      'main-sha',
      'npm-token',
      'ownership',
    ]);
    expect(receipt.gates.find(gate => gate.id === 'provenance')).toMatchObject({
      passed: true,
    });
    expect(
      receipt.gates.find(gate => gate.id === 'unpublished-version')
    ).toMatchObject({ passed: true });
    expect(
      receipt.gates.find(gate => gate.id === 'ownership')?.reason
    ).toContain('cannot be proven from this checkout');
  });

  it('refuses a duplicate published version even on main with a token', () => {
    const receipt = buildPublicationReceipt({
      ...FEATURE_BRANCH_INPUT,
      gitRef: 'refs/heads/main',
      originMainSha: FEATURE_BRANCH_INPUT.sourceSha,
      npmTokenPresent: true,
      scopeWriteAccessProven: true,
      registryStatus: 200,
      registryVersion: '26.8.1',
      maintainers: ['jovie'],
      registryProvenance: true,
    });

    expect(receipt.publicationPermitted).toBe(false);
    expect(receipt.blockedBy).toEqual(['unpublished-version']);
    expect(receipt.registry).toEqual({
      status: 200,
      published: true,
      version: '26.8.1',
      maintainers: ['jovie'],
      provenance: true,
    });
  });

  it('permits publication only when main, unpublished version, token, provenance, and ownership all pass', () => {
    const receipt = buildPublicationReceipt({
      ...FEATURE_BRANCH_INPUT,
      gitRef: 'refs/heads/main',
      originMainSha: FEATURE_BRANCH_INPUT.sourceSha,
      npmTokenPresent: true,
      scopeWriteAccessProven: true,
      registryStatus: 404,
    });

    expect(receipt.publicationPermitted).toBe(true);
    expect(receipt.blockedBy).toEqual([]);
  });

  it('probes the public registry without sending credentials', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        `${NPM_REGISTRY_URL}/${encodeURIComponent(PACKAGE_NAME)}`
      );
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await expect(probeNpmRegistry(fetchImpl)).resolves.toEqual({
      status: 404,
      body: { error: 'Not found' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toEqual({ Accept: 'application/json' });
    expect(JSON.stringify(init)).not.toMatch(/authorization/i);
  });
});
