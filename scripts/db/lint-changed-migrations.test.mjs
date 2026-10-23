import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertSha256,
  installSquawk,
  isChangedMigrationSql,
  lintChangedMigrations,
  parseChangedMigrationSql,
  readMigrationDiff,
  SQUAWK_CONFIG,
  SQUAWK_SHA256,
  SQUAWK_VERSION,
} from './lint-changed-migrations.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = file => readFileSync(join(REPO_ROOT, file), 'utf8');

test('parses only added or changed migration SQL', () => {
  const files = parseChangedMigrationSql(
    [
      'A\tapps/web/drizzle/migrations/0200_new.sql',
      'M\tapps/web/drizzle/migrations/0146_melted_speedball.sql',
      'D\tapps/web/drizzle/migrations/0145_powerful_old_lace.sql',
      'R100\tapps/web/drizzle/migrations/old.sql\tapps/web/drizzle/migrations/0201_renamed.sql',
      'A\tapps/web/drizzle/migrations/meta/0200_snapshot.json',
      'A\tapps/web/drizzle/migrations/meta/_journal.json',
      'A\tapps/web/drizzle/online-indexes/20261023_idx.json',
      'A\tapps/web/lib/db/schema.ts',
      '',
    ].join('\n')
  );
  assert.deepEqual(files, [
    'apps/web/drizzle/migrations/0200_new.sql',
    'apps/web/drizzle/migrations/0146_melted_speedball.sql',
    'apps/web/drizzle/migrations/0201_renamed.sql',
  ]);
  assert.equal(
    isChangedMigrationSql('apps/web/drizzle/migrations/meta/note.sql'),
    false
  );
  assert.equal(
    isChangedMigrationSql('apps/web/drizzle/migrations/../schema.sql'),
    false
  );
});

test('rejects an unrecognized diff status', () => {
  assert.throws(
    () =>
      parseChangedMigrationSql('U\tapps/web/drizzle/migrations/0200_new.sql'),
    /Unrecognized migration diff status/
  );
});

test('reads UTF-8 migration diffs from the command runner', () => {
  const diff = 'A\tapps/web/drizzle/migrations/0200_new.sql\n';
  for (const stdout of [diff, Buffer.from(diff)]) {
    assert.equal(
      readMigrationDiff(REPO_ROOT, 'main', 'HEAD', (bin, args, options) => {
        assert.equal(bin, 'git');
        assert.ok(args.includes('main...HEAD'));
        assert.equal(options.encoding, 'utf8');
        return { status: 0, stdout };
      }),
      diff
    );
  }
});

test('fails closed when the migration diff command fails', () => {
  for (const stderr of ['broken revision', Buffer.from('broken revision')]) {
    assert.throws(
      () =>
        readMigrationDiff(REPO_ROOT, 'bad', 'HEAD', () => ({
          status: 128,
          stderr,
        })),
      /broken revision/
    );
  }
});

test('does not invoke squawk when the diff has no migration SQL', async () => {
  let invoked = false;
  const result = await lintChangedMigrations({
    repoRoot: REPO_ROOT,
    base: 'ignored',
    nameStatus: 'M\tapps/web/drizzle/migrations/meta/_journal.json\n',
    squawkBin: '/does-not-exist',
    run: () => {
      invoked = true;
      return { status: 0, stdout: '', stderr: '' };
    },
  });
  assert.equal(result.invoked, false);
  assert.equal(result.status, 0);
  assert.equal(invoked, false);
});

test('fails closed when squawk reports an unsafe changed migration', async () => {
  const result = await lintChangedMigrations({
    repoRoot: REPO_ROOT,
    base: 'ignored',
    nameStatus: 'A\tapps/web/drizzle/migrations/0200_bad.sql\n',
    squawkBin: 'squawk',
    stdio: 'pipe',
    run: (bin, args) => {
      assert.equal(bin, 'squawk');
      assert.deepEqual(args.slice(0, 2), [
        '--config',
        join(REPO_ROOT, 'scripts/db/squawk.toml'),
      ]);
      assert.deepEqual(args.slice(2), [
        'apps/web/drizzle/migrations/0200_bad.sql',
      ]);
      return { status: 1 };
    },
  });
  assert.equal(result.invoked, true);
  assert.equal(result.status, 1);
});

test('a git diff lints the new file and leaves the base migration alone', async () => {
  const root = mkdtempSync(join(tmpdir(), 'squawk-diff-'));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
  );
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  const write = (path, body) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  const existing = 'apps/web/drizzle/migrations/0001_existing.sql';
  write(existing, 'ALTER TABLE "users" ADD COLUMN "handle" text NOT NULL;\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  git('switch', '-q', '-c', 'pr');
  write(
    'apps/web/drizzle/migrations/0002_added.sql',
    'ALTER TABLE "users" ADD COLUMN "nickname" text;\n'
  );
  write(existing, 'ALTER TABLE "users" ADD COLUMN "handle" text NOT NULL;\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'pr');
  const seen = [];
  const result = await lintChangedMigrations({
    repoRoot: root,
    base: 'main',
    squawkBin: 'squawk-test',
    stdio: 'pipe',
    run: (bin, args) => {
      if (bin === 'git') {
        return spawnSync('git', args, { cwd: root, env, encoding: 'utf8' });
      }
      seen.push(args);
      return { status: 0 };
    },
  });
  assert.equal(result.invoked, true);
  assert.deepEqual(result.files, [
    'apps/web/drizzle/migrations/0002_added.sql',
  ]);
  assert.equal(
    seen.some(args => args.includes(existing)),
    false
  );
});

test('rejects a squawk download that does not match the pinned sha256', async () => {
  await assert.rejects(
    () =>
      installSquawk({
        platform: 'linux',
        arch: 'x64',
        fetchImpl: async () => new Response('not-the-release'),
      }),
    /Squawk checksum mismatch/
  );
  assert.throws(
    () => assertSha256(Buffer.from('x'), SQUAWK_SHA256.x64),
    /mismatch/
  );
  assert.match(SQUAWK_VERSION, /^2\.70\.0$/);
});

test('source validation blocks dependency and migration diffs', () => {
  const workflow = read('.github/workflows/source-validation.yml');
  const config = read('.github/dependency-review-config.yml');
  const squawk = read('scripts/db/squawk.toml');
  assert.match(workflow, /^on:\n {2}pull_request:/m);
  assert.match(
    workflow,
    /needs: \[deterministic, security, migration, coverage, unit, a11y\]/
  );
  assert.match(
    workflow,
    /uses: actions\/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294 # v5\.0\.0/
  );
  assert.match(
    workflow,
    /config-file: \.\/\.github\/dependency-review-config\.yml/
  );
  assert.match(
    workflow,
    /node scripts\/db\/lint-changed-migrations\.mjs --base "\$base_sha"/
  );
  assert.doesNotMatch(workflow, /squawk[^\n]*drizzle\/migrations\/\*/);
  assert.match(config, /^fail-on-severity: high$/m);
  assert.match(config, /^warn-only: false$/m);
  assert.match(config, /^comment-summary-in-pr: never$/m);
  assert.match(config, /^vulnerability-check: true$/m);
  assert.match(config, /^license-check: true$/m);
  for (const id of [
    'GPL-2.0-only',
    'GPL-3.0-only',
    'GPL-3.0-or-later',
    'AGPL-3.0-only',
    'AGPL-3.0-or-later',
  ]) {
    assert.match(config, new RegExp(`^  - ${id}$`, 'm'));
  }
  assert.doesNotMatch(config, /LGPL-/);
  assert.match(squawk, /^assume_in_transaction = true$/m);
  assert.match(squawk, /^pg_version = "16\.0"$/m);
  const excluded = [...squawk.matchAll(/^ {2}"([a-z0-9-]+)",$/gm)].map(
    match => match[1]
  );
  assert.deepEqual(excluded, [
    'require-lock-timeout',
    'require-statement-timeout',
    'prefer-text-field',
    'prefer-bigint-over-int',
    'prefer-timestamp-tz',
  ]);
  for (const rule of excluded) {
    assert.match(squawk, new RegExp(`^  # ${rule}: .+$`, 'm'));
  }
  for (const kept of [
    'require-concurrent-index-creation',
    'adding-required-field',
    'adding-not-nullable-field',
    'changing-column-type',
  ]) {
    assert.equal(excluded.includes(kept), false);
  }
});

test('migration runner loads its config beside the script in a separate checkout', {
  skip: process.env.SQUAWK_BIN ? false : 'SQUAWK_BIN is not set',
}, async t => {
  const root = mkdtempSync(join(tmpdir(), 'squawk-config-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts/db'), { recursive: true });
  writeFileSync(join(root, 'scripts/db/squawk.toml'), read(SQUAWK_CONFIG));
  const file = 'apps/web/drizzle/migrations/0200_changed.sql';
  mkdirSync(dirname(join(root, file)), { recursive: true });
  for (const { sql, status, diagnostic } of [
    {
      sql: 'ALTER TABLE "users" ADD COLUMN "handle" text NOT NULL;',
      status: 1,
      diagnostic: /adding-required-field/,
    },
    {
      sql: 'ALTER TABLE "users" ADD COLUMN "nickname" text;',
      status: 0,
      diagnostic: /Found 0 issues/,
    },
  ]) {
    writeFileSync(join(root, file), `${sql}\n`);
    let output = '';
    const result = await lintChangedMigrations({
      repoRoot: root,
      base: 'unused',
      nameStatus: `A\t${file}\n`,
      squawkBin: process.env.SQUAWK_BIN,
      stdio: 'pipe',
      run: (bin, args, options) => {
        const child = spawnSync(bin, args, { ...options, encoding: 'utf8' });
        output = child.stdout + child.stderr;
        return child;
      },
    });
    assert.equal(result.invoked, true);
    assert.equal(result.status, status, output);
    assert.match(output, diagnostic);
  }
});

test('pinned squawk fails the unsafe operations and accepts a new table', {
  skip: process.env.SQUAWK_BIN ? false : 'SQUAWK_BIN is not set',
}, () => {
  const squawk = process.env.SQUAWK_BIN ?? '';
  const root = mkdtempSync(join(tmpdir(), 'squawk-rules-'));
  const config = join(REPO_ROOT, 'scripts/db/squawk.toml');
  const run = sql => {
    const file = join(root, 'migration.sql');
    writeFileSync(file, sql);
    return spawnSync(squawk, ['--config', config, file], { encoding: 'utf8' });
  };
  const badIndex = run(
    'CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email");\n'
  );
  assert.equal(badIndex.status, 1);
  assert.match(
    badIndex.stderr + badIndex.stdout,
    /require-concurrent-index-creation/
  );
  const notNull = run(
    'ALTER TABLE "users" ADD COLUMN "handle" text NOT NULL;\n'
  );
  assert.equal(notNull.status, 1);
  assert.match(notNull.stderr + notNull.stdout, /adding-required-field/);
  const typed = run('ALTER TABLE "users" ALTER COLUMN "age" TYPE bigint;\n');
  assert.equal(typed.status, 1);
  assert.match(typed.stderr + typed.stdout, /changing-column-type/);
  const created = run(
    [
      'CREATE TABLE IF NOT EXISTS "widgets" (',
      '  "id" uuid PRIMARY KEY NOT NULL,',
      '  "name" text NOT NULL',
      ');',
      'CREATE INDEX IF NOT EXISTS "widgets_name_idx" ON "widgets" ("name");',
      '',
    ].join('\n')
  );
  assert.equal(created.status, 0, created.stderr + created.stdout);
});
