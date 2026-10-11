import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('retains registered migrations under pipe pressure and rejects an unknown SQL file', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'migration-membership-'));
  const migrations = resolve(root, 'drizzle/migrations');
  const script = resolve(__dirname, '../../../scripts/validate-migrations.sh');
  try {
    mkdirSync(resolve(migrations, 'meta'), { recursive: true });
    const entries = Array.from({ length: 6000 }, (_, idx) => ({
      idx,
      tag:
        idx === 0
          ? '0000_registered'
          : `${String(idx).padStart(4, '0')}_journal_only_fixture`,
      when: idx + 1,
    }));
    writeFileSync(
      resolve(migrations, 'meta/_journal.json'),
      JSON.stringify({ entries })
    );
    writeFileSync(resolve(migrations, '0000_registered.sql'), '');
    const run = () =>
      spawnSync('/bin/bash', [script], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
      });
    const registered = run();
    // The other fixture rows intentionally have no SQL file. That distinct
    // ledger error must not turn the registered file into an unknown file.
    expect(registered.status).toBe(1);
    expect(registered.stdout).toContain('orphaned journal entry(ies)');
    expect(registered.stdout).not.toContain('unregistered migration file(s)');
    writeFileSync(resolve(migrations, '9999_unregistered.sql'), '');
    const unknown = run();
    expect(unknown.status).toBe(1);
    expect(unknown.stdout).toContain('1 unregistered migration file(s)');
    expect(unknown.stdout).toContain('9999_unregistered.sql');
    expect(unknown.stdout).not.toContain('0000_registered.sql');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
