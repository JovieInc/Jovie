import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PRODUCTION_AUTH_SMOKE_PATH = path.resolve(
  __dirname,
  '../../e2e/smoke-prod-auth.spec.ts'
);

describe('production auth smoke concurrency contract', () => {
  it('serializes OTP flows that share the dedicated production identity', () => {
    const source = fs.readFileSync(PRODUCTION_AUTH_SMOKE_PATH, 'utf8');

    expect(source).toContain("test.describe.configure({ mode: 'serial' });");
  });
});
