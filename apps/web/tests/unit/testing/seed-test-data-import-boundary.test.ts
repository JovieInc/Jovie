import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(import.meta.dirname, '../../..');
const seedSource = readFileSync(
  resolve(webRoot, 'tests/seed-test-data.ts'),
  'utf8'
);
const confirmationStatusSource = readFileSync(
  resolve(webRoot, 'lib/events/confirmation-status.ts'),
  'utf8'
);

describe('seed test data import boundary', () => {
  it('uses the server-neutral confirmation status helper', () => {
    expect(seedSource).toContain("from '@/lib/events/confirmation-status'");
    expect(seedSource).not.toContain("from '@/lib/events/insert'");
  });

  it('keeps the confirmation helper transitively free of server-only imports', () => {
    expect(confirmationStatusSource).not.toMatch(
      /\b(?:import|export)\b.+\bfrom\b/
    );
    expect(confirmationStatusSource).not.toContain("import 'server-only'");
    expect(confirmationStatusSource).not.toContain('@/lib/db');
    expect(confirmationStatusSource).not.toContain('@/lib/env');
  });
});
