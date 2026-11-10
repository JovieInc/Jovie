import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard (security triage 2026-10-25): every HTTP entry point that applies a
 * claim-verification decision (identity link, or Stripe refund + cancel) must
 * use a privileged admin gate. The Summer card route once accepted read-scoped
 * tokens and MFA-less admin sessions for the same action the admin endpoint
 * gated behind a passkey step-up.
 */
const APP_DIR = join(process.cwd(), 'app');

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === 'route.ts' ? [path] : [];
  });
}

/** Gates that include the admin passkey step-up (MFA) for cookie sessions. */
const PRIVILEGED_GATES = [
  // Default (non-read) entitlements carry MFA-backed isAdmin.
  /getOvieOperatorEntitlements\(\s*\)/,
  /requireOvieApiAccess\(\{\s*privileged:\s*true\s*\}\)/,
];

describe('claim decision entry points', () => {
  const callers = routeFiles(APP_DIR).filter(file =>
    readFileSync(file, 'utf8').includes('decideClaimVerification(')
  );

  it('are inventoried', () => {
    expect(callers.map(file => relative(APP_DIR, file)).sort()).toEqual([
      'api/admin/claim-verifications/[profileId]/decision/route.ts',
      'api/ovie/summer-cards/[id]/decision/route.ts',
    ]);
  });

  it.each(callers.map(file => [relative(APP_DIR, file), file]))(
    '%s uses a privileged admin gate',
    (_name, file) => {
      const source = readFileSync(file, 'utf8');
      expect(PRIVILEGED_GATES.some(gate => gate.test(source))).toBe(true);
      // Read-purpose entitlements skip the passkey step-up.
      expect(source).not.toMatch(/purpose:\s*'read'/);
    }
  );

  it('require the write scope when a bearer token can reach them', () => {
    for (const file of callers) {
      const source = readFileSync(file, 'utf8');
      if (!source.includes('resolveOviePrincipal(')) continue;
      expect(source).toMatch(/scopes\.includes\('ovie:write'\)/);
    }
  });
});
