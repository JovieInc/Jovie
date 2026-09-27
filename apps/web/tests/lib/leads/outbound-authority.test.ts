import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROOT = resolve(__dirname, '../../..');

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'tests',
  'e2e',
  '__tests__',
  '__mocks__',
]);

// The Instantly provider adapter is only reachable through the guarded
// outreach batch boundary (suppression, caps, dedupe, locking, kill switch).
const ALLOWED_PROVIDER_CALLERS = new Set([
  'apps/web/lib/leads/instantly.ts',
  'apps/web/lib/leads/outreach-batch.ts',
]);

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('single outbound authority (JOV-6427)', () => {
  it('only the guarded outreach batch may call pushLeadToInstantly', () => {
    const violations: string[] = [];

    for (const file of collectSourceFiles(APP_ROOT)) {
      const rel = file.slice(file.indexOf('apps/')).replaceAll('\\', '/');
      if (ALLOWED_PROVIDER_CALLERS.has(rel)) continue;
      const source = readFileSync(file, 'utf8');
      if (
        /pushLeadToInstantly|lib\/leads\/instantly|['"]\.\/instantly['"]/.test(
          source
        )
      ) {
        violations.push(rel);
      }
    }

    expect(violations).toEqual([]);
  });

  it('approve-lead does not import the Instantly provider adapter', () => {
    const source = readFileSync(
      resolve(APP_ROOT, 'lib/leads/approve-lead.ts'),
      'utf8'
    );
    expect(source).not.toMatch(/instantly/i);
  });
});
