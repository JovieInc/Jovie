import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const coreProvidersSource = readFileSync(
  resolve(webRoot, 'components/providers/CoreProviders.tsx'),
  'utf8'
);

describe('CoreProviders hydration contract (JOV-4505)', () => {
  it('keeps the global feedback tree out of a dynamic hydration boundary', () => {
    expect(coreProvidersSource).toContain(
      "import { LazyProviders } from './LazyProviders';"
    );
    expect(coreProvidersSource).not.toContain("from 'next/dynamic'");
    expect(coreProvidersSource).not.toMatch(
      /const LazyProviders = dynamic[\s\S]*?\{[\s\S]*?ssr:\s*true/
    );
  });
});
