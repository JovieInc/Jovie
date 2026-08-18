import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('eve identity instruction packs', () => {
  it('keeps Jovie artist instructions off factory tools', () => {
    const text = readFileSync(
      resolve(root, 'identities/jovie/instructions.md'),
      'utf8'
    );
    expect(text.includes('artist-facing')).toBe(true);
    expect(text.includes('privileged gbrain write')).toBe(false);
    expect(text.includes('Symphony heal')).toBe(false);
  });

  it('lets Ovie ingest/ack and read gbrain', () => {
    const text = readFileSync(
      resolve(root, 'identities/ovie/instructions.md'),
      'utf8'
    );
    expect(text.includes('ingest and ack')).toBe(true);
    expect(text.includes('gbrain')).toBe(true);
    expect(text.includes('read')).toBe(true);
  });
});
