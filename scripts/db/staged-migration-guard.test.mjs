import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const guard = path.resolve('apps/web/scripts/check-migrations.sh');
test('migration guard validates staged repairs and still rejects staged conflicts', () => {
  const dir = mkdtempSync(path.resolve('artifacts/migration-guard-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  const write = name =>
    writeFileSync(path.join(dir, 'drizzle/migrations', name), 'SELECT 1;');
  try {
    mkdirSync(path.join(dir, 'drizzle/migrations'), { recursive: true });
    git('init', '-b', 'main');
    git('config', 'user.name', 'Synthetic Test');
    git('config', 'user.email', 'synthetic@example.invalid');
    write('0161_existing.sql');
    git('add', '.');
    git('commit', '-m', 'fixture base');
    git('branch', 'baseline');
    write('0153_pending.sql');
    git('add', '.');
    git('commit', '-m', 'fixture conflict');
    git(
      'mv',
      'drizzle/migrations/0153_pending.sql',
      'drizzle/migrations/0162_pending.sql'
    );
    assert.doesNotThrow(() =>
      execFileSync('bash', [guard, 'baseline'], { cwd: dir, stdio: 'pipe' })
    );
    git(
      'mv',
      'drizzle/migrations/0162_pending.sql',
      'drizzle/migrations/0153_pending.sql'
    );
    assert.throws(() =>
      execFileSync('bash', [guard, 'baseline'], { cwd: dir, stdio: 'pipe' })
    );
    git(
      'mv',
      'drizzle/migrations/0153_pending.sql',
      'drizzle/migrations/0162_pending.sql'
    );
    writeFileSync(
      path.join(dir, 'drizzle/migrations/0161_existing.sql'),
      'SELECT 2;'
    );
    git('add', '.');
    assert.throws(() =>
      execFileSync('bash', [guard, 'baseline'], { cwd: dir, stdio: 'pipe' })
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
