import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * RLS session-variable <-> policy-column contract guard (JOV-4194).
 *
 * Production RLS was silently inert once because the app-side session
 * variable semantics changed (Clerk id -> app users.id UUID at the Better
 * Auth cutover) while the policy predicates kept comparing users.clerk_id.
 * The predicate could never match and nobody noticed.
 *
 * This test pins the three sides of the contract to the SAME session
 * variable and identity column so the next auth-identity migration fails
 * loudly in the fast merge gate:
 *
 *   1. lib/auth/session.ts + lib/db/client/session.ts write
 *      `app.clerk_user_id` (value: the app users.id UUID).
 *   2. The newest migration defining the RLS helper reads the same
 *      variable and casts it to uuid (current_app_user_id()).
 *   3. The newest users_select_self policy compares users."id" — not
 *      clerk_id — to that helper.
 *
 * If you intentionally change the session variable name or the identity
 * column, update ALL of: lib/auth/session.ts, lib/db/client/session.ts,
 * a NEW migration replacing the helper + policies, and this test.
 */

const SESSION_VAR = 'app.clerk_user_id';
const webRoot = path.resolve(__dirname, '../../..');
const migrationsDir = path.join(webRoot, 'drizzle', 'migrations');

function read(relPath: string): string {
  return fs.readFileSync(path.join(webRoot, relPath), 'utf8');
}

function migrationFilesDescending(): string[] {
  return fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .reverse();
}

function newestMigrationContaining(needle: string): {
  file: string;
  content: string;
} {
  for (const file of migrationFilesDescending()) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    if (content.includes(needle)) {
      return { file, content };
    }
  }
  throw new Error(`No migration contains: ${needle}`);
}

describe('RLS session contract', () => {
  it('app session setup writes the pinned session variable', () => {
    const authSession = read('lib/auth/session.ts');
    expect(authSession).toContain(`set_config('${SESSION_VAR}'`);

    const dbSession = read('lib/db/client/session.ts');
    expect(dbSession).toContain(`set_config('${SESSION_VAR}'`);
  });

  it('the newest RLS helper reads the same variable and casts to uuid', () => {
    const { content } = newestMigrationContaining(
      'CREATE OR REPLACE FUNCTION current_app_user_id()'
    );
    const fnBody = content.slice(
      content.indexOf('CREATE OR REPLACE FUNCTION current_app_user_id()')
    );
    expect(fnBody).toContain(`current_setting('${SESSION_VAR}', true)`);
    expect(fnBody).toContain('RETURNS uuid');
  });

  it('the newest users_select_self policy compares users.id (not clerk_id) to the helper', () => {
    const { content } = newestMigrationContaining(
      'CREATE POLICY "users_select_self"'
    );
    const policy = content.slice(
      content.indexOf('CREATE POLICY "users_select_self"')
    );
    const usingClause = policy.slice(0, policy.indexOf(';'));
    expect(usingClause).toContain('"id" = current_app_user_id()');
    expect(usingClause).not.toContain('clerk_id');
  });

  it('no migration newer than the helper reintroduces clerk_id-based self policies', () => {
    const helper = newestMigrationContaining(
      'CREATE OR REPLACE FUNCTION current_app_user_id()'
    );
    const newer = migrationFilesDescending().filter(f => f > helper.file);
    for (const file of newer) {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      if (content.includes('CREATE POLICY "users_select_self"')) {
        expect(content).not.toContain('clerk_id" = current_clerk_user_id()');
      }
    }
  });
});
