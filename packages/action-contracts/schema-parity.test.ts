import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildArtifacts } from './generate';

/**
 * Schema-drift guard: committed generated artifacts must match what the
 * manifest regenerates, byte-for-byte. Regenerate with:
 *   pnpm --filter @jovie/action-contracts run generate
 */
describe('generated artifact parity', () => {
  const artifacts = buildArtifacts();

  it('produces a deterministic artifact set', () => {
    const first = buildArtifacts();
    const second = buildArtifacts();
    expect(second).toEqual(first);
    expect(Object.keys(first).length).toBeGreaterThan(0);
  });
  it('preserves work.next routing and resolves every discovery/OpenAPI schema reference', () => {
    const discovery = JSON.parse(artifacts['manifest.json']);
    for (const action of discovery.actions)
      for (const ref of Object.values(action.schemas))
        expect(artifacts[String(ref)], String(ref)).toBeDefined();
    const api = JSON.parse(artifacts['openapi.json']);
    expect(
      api.paths['/api/v1/actions/work.next/invoke'].post.requestBody.content[
        'application/json'
      ].schema.$ref
    ).toBe('./schemas/work-next.invocation.json');
    expect(
      discovery.actions.find(
        (action: { id: string }) => action.id === 'work.next'
      ).schemas.input
    ).toBe('schemas/work-next.input.json');
    expect(Object.keys(artifacts).some(path => path.includes('.next.'))).toBe(
      false
    );
  });

  it('committed artifacts match regeneration exactly', () => {
    const drifted: string[] = [];
    for (const [relativePath, expected] of Object.entries(artifacts)) {
      const absolutePath = join(import.meta.dirname, 'generated', relativePath);
      if (!existsSync(absolutePath)) {
        drifted.push(`${relativePath} (missing)`);
        continue;
      }
      const actual = readFileSync(absolutePath, 'utf8');
      if (actual !== expected) {
        drifted.push(relativePath);
      }
    }
    expect(drifted).toEqual([]);
  });

  it('every artifact is valid JSON', () => {
    for (const [relativePath, contents] of Object.entries(artifacts)) {
      expect(() => JSON.parse(contents), relativePath).not.toThrow();
    }
  });

  it('advertises only implemented internal fleet dispatchers', () => {
    const api = JSON.parse(artifacts['openapi.json']);
    for (const path of Object.values(api.paths)) {
      const operation = (path as { post?: Record<string, unknown> }).post;
      if (operation)
        expect(operation['x-jovie-implemented']).toBe(
          /^invoke_(fleet|work|defect)_/.test(String(operation.operationId))
        );
    }
  });
});
