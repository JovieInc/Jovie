import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { nodeMatchesNvmrc } from './runtime';

describe('nodeMatchesNvmrc', () => {
  it('rejects a Node 22 runtime against the repo pin', () => {
    const required = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../.nvmrc'),
      'utf8'
    );
    expect(required.trim()).toBe('24.21.0');
    expect(nodeMatchesNvmrc('v22.23.2', required)).toBe(false);
    expect(nodeMatchesNvmrc('24.21.0', required)).toBe(true);
  });
});
