import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOMAIN_FUNCTIONS } from '@/lib/domain';

const ROOT = join(__dirname, '..', '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

/** Chat owns its own tables (conversations, messages, audit, usage): any table named chat*. */
const ALLOWED_TABLES = { has: (table: string) => table.startsWith('chat') };

/**
 * Raw writes that predate the domain layer, per file and table. This list may
 * only shrink: a new raw write fails the guard, and an entry whose write has
 * moved onto a domain function must be deleted (the stale check below fails
 * until it is). Releases and profile edits already left it.
 */
const BASELINE: ReadonlyArray<readonly [file: string, table: string]> = [
  ['app/api/chat/confirm-link/route.ts', 'socialLinks'],
  ['app/api/chat/confirm-remove-link/route.ts', 'socialLinks'],
];

const WRITE = /\.(insert|update|delete)\(\s*(\w+)\s*\)/g;
const RAW_UPSERT = /\bupsert(?!Chat)[A-Z]\w*\(/g;

/** Raw writes in one source: `[table]` for each insert/update/delete, `upsertX` for upsert helpers. */
export function rawWrites(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const found = new Set<string>();
  for (const match of code.matchAll(WRITE)) found.add(match[2]!);
  for (const match of code.matchAll(RAW_UPSERT))
    found.add(match[0].slice(0, -1));
  return [...found].sort();
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(?:ts|tsx)$/.test(name) && !/\.(?:test|stories)\./.test(name))
      out.push(path);
  }
  return out;
}

/** Every chat entry point: the chat route, its confirm-* routes, and the tools it mounts. */
function chatEntryPoints(): string[] {
  return [
    'app/api/chat/route.ts',
    ...walk(join(ROOT, 'app/api/chat')).map(path => relative(ROOT, path)),
    ...walk(join(ROOT, 'lib/ai/tools')).map(path => relative(ROOT, path)),
  ].filter((file, index, all) => all.indexOf(file) === index);
}

describe('chat tools call registered domain functions, never raw writes', () => {
  const entries = chatEntryPoints();

  it('finds the chat entry points', () => {
    expect(entries).toContain('app/api/chat/route.ts');
    expect(entries).toContain('app/api/chat/confirm-edit/route.ts');
    expect(entries).toContain('lib/ai/tools/create-release.ts');
  });

  it('no chat entry point writes a product table or upserts directly, beyond the shrinking baseline', () => {
    const violations: string[] = [];
    for (const file of entries) {
      for (const write of rawWrites(read(file))) {
        if (ALLOWED_TABLES.has(write)) continue;
        if (BASELINE.some(([f, t]) => f === file && t === write)) continue;
        violations.push(
          `${file}: raw write to ${write}; add or use a domain function in lib/domain`
        );
      }
    }
    expect(violations).toEqual([]);
  });

  it('the baseline only holds writes that still exist (shrink it when a write moves)', () => {
    for (const [file, table] of BASELINE)
      expect(
        rawWrites(read(file)),
        `${file} no longer writes ${table}: remove it from BASELINE`
      ).toContain(table);
  });

  it('release and profile edits go through their registered domain functions', () => {
    expect(read('lib/ai/tools/create-release.ts')).toContain(
      'createReleaseForProfile'
    );
    expect(read('app/api/chat/confirm-edit/route.ts')).toContain(
      'applyProfileUpdate'
    );
    // ...which the forms use too.
    expect(read('app/api/dashboard/profile/route.ts')).toContain(
      'applyProfileUpdate'
    );
    expect(read('app/app/(shell)/dashboard/releases/actions.ts')).toContain(
      'createReleaseForProfile'
    );
  });

  it('every registered domain function exists where the registry says', () => {
    for (const [name, module] of Object.entries(DOMAIN_FUNCTIONS)) {
      const source = read(`${module.replace('@/', '')}.ts`);
      expect(source, name).toMatch(
        new RegExp(`export (?:async )?function ${name}\\b`)
      );
    }
  });
});

describe('raw write detector (deliberate red)', () => {
  it('catches inserts, updates, deletes and upsert helpers, tx or db', () => {
    expect(rawWrites('await db.update(creatorProfiles).set({});')).toEqual([
      'creatorProfiles',
    ]);
    expect(rawWrites('await tx.insert(discogReleases).values(x);')).toEqual([
      'discogReleases',
    ]);
    expect(rawWrites('await db.delete(socialLinks).where(x)')).toEqual([
      'socialLinks',
    ]);
    expect(rawWrites('const r = await upsertRelease({});')).toEqual([
      'upsertRelease',
    ]);
  });
  it('allows the audit table and ignores comments', () => {
    expect(rawWrites('await db.insert(chatAuditLog).values(x);')).toEqual([
      'chatAuditLog',
    ]);
    expect(
      rawWrites('// db.update(creatorProfiles)\n/* upsertRelease(x) */')
    ).toEqual([]);
  });
  it('a chat route that wrote creator_profiles again would be reported', () => {
    const violations = rawWrites(
      'await db.update(creatorProfiles).set({});'
    ).filter(table => !ALLOWED_TABLES.has(table));
    expect(violations).toEqual(['creatorProfiles']);
  });
});
