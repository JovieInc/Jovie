import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertVersionProgression,
  buildPublicBrandManifest,
  OUTPUT_PATH,
  type PublicBrandManifest,
  serializePublicBrandManifest,
  validatePublicBrandManifest,
} from '@/scripts/build-public-brand-system';

function cloneManifest(manifest: PublicBrandManifest): PublicBrandManifest {
  return structuredClone(manifest);
}

describe('public Brand System drift gate', () => {
  it('keeps the generated public manifest semantically canonical', () => {
    const expected = buildPublicBrandManifest();
    const actual = JSON.parse(
      readFileSync(OUTPUT_PATH, 'utf8')
    ) as PublicBrandManifest;

    expect(validatePublicBrandManifest(actual, expected)).toEqual([]);
    expect(JSON.parse(serializePublicBrandManifest(expected))).toEqual(
      expected
    );
  });

  it.each([
    {
      label: 'source digest',
      mutate: (manifest: PublicBrandManifest) => {
        Object.assign(manifest, { source_digest: 'stale' });
      },
      error: 'Canonical source digest',
    },
    {
      label: 'source provenance',
      mutate: (manifest: PublicBrandManifest) => {
        Object.assign(manifest, { sources: [] });
      },
      error: 'source provenance',
    },
    {
      label: 'token export',
      mutate: (manifest: PublicBrandManifest) => {
        Object.assign(manifest, { tokens: manifest.tokens.slice(1) });
      },
      error: 'token export',
    },
    {
      label: 'component registry',
      mutate: (manifest: PublicBrandManifest) => {
        Object.assign(manifest.components, { catalog: [] });
      },
      error: 'component registry',
    },
    {
      label: 'approved archetypes',
      mutate: (manifest: PublicBrandManifest) => {
        Object.assign(manifest, { approved_examples: [] });
      },
      error: 'Approved composition examples',
    },
    {
      label: 'asset checksum',
      mutate: (manifest: PublicBrandManifest) => {
        const [first, ...rest] = manifest.assets;
        Object.assign(manifest, {
          assets: first ? [{ ...first, sha256: 'stale' }, ...rest] : [],
        });
      },
      error: 'asset checksums',
    },
    {
      label: 'required section',
      mutate: (manifest: PublicBrandManifest) => {
        Object.assign(manifest, { sections: manifest.sections.slice(1) });
      },
      error: 'Missing required sections',
    },
  ])('rejects $label drift with an actionable reason', ({ mutate, error }) => {
    const expected = buildPublicBrandManifest();
    const actual = cloneManifest(expected);
    mutate(actual);

    expect(validatePublicBrandManifest(actual, expected).join('\n')).toContain(
      error
    );
  });

  it('requires a version bump when a canonical digest changes', () => {
    const previous = buildPublicBrandManifest();
    const next = cloneManifest(previous);
    Object.assign(next, { source_digest: 'changed' });

    expect(() => assertVersionProgression(previous, next)).toThrow(
      /version bump and matching newest changelog entry/
    );
  });

  it('exports every typography token referenced by the vendor contract', () => {
    const manifest = buildPublicBrandManifest();
    const tokenNames = new Set(manifest.tokens.map(token => token.name));
    const referencedTokens = [
      manifest.typography.fontBody,
      manifest.typography.fontDisplay,
      ...Object.values(manifest.typography.leading),
      ...Object.values(manifest.typography.tracking),
    ];

    for (const reference of referencedTokens) {
      const name = String(reference).match(/^var\((--[^)]+)\)$/)?.[1];
      expect(name, `${reference} is a direct token reference`).toBeTruthy();
      expect(tokenNames, `${name} is exported`).toContain(name);
    }
  });

  it('publishes no media by default and no local source paths', () => {
    const manifest = buildPublicBrandManifest();
    const serialized = serializePublicBrandManifest(manifest);

    expect(manifest.media.published).toEqual([]);
    expect(serialized).not.toContain('/Users/');
    expect(serialized).not.toMatch(/\bJOV-\d+\b/);
    for (const source of manifest.sources) {
      expect(Object.keys(source)).toEqual(['id', 'sha256']);
    }
  });
});
