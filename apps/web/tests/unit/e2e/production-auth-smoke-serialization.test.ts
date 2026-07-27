import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PRODUCTION_AUTH_SMOKE_PATH = path.resolve(
  __dirname,
  '../../e2e/smoke-prod-auth.spec.ts'
);

describe('production auth smoke session contract', () => {
  it('uses one rendered sign-in for dashboard and tab assertions', () => {
    const source = fs.readFileSync(PRODUCTION_AUTH_SMOKE_PATH, 'utf8');

    expect(source).toContain("test.describe.configure({ mode: 'serial' });");
    expect(source.match(/await signInViaRenderedFlow\(/gu)).toHaveLength(1);
    expect(source).not.toContain(
      "test('dashboard tab navigation works', async"
    );
    expect(source).toContain(
      'const tabs = [APP_ROUTES.AUDIENCE, APP_ROUTES.RELEASES];'
    );
  });
});
