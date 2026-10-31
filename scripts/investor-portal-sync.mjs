#!/usr/bin/env node
/**
 * Publishes the private investor-portal content to the app database table
 * `investor_portal_content` (read by apps/web/lib/investors/private-content.ts
 * behind the portal gate). The app has no private Blob store, so the existing
 * database is the private store.
 *
 *   DATABASE_URL=... node scripts/investor-portal-sync.mjs [--dry-run]
 *
 * Source of truth: $JOVIE_PRIVATE_DIR/apps/web/{content/investors,assets/investor-deck}
 * (JovieInc/Ops jovie-private/). Each file is upserted under its path below
 * apps/web/. Prints paths, sizes and digests only, never content or the URL.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';

const ROOTS = ['content/investors', 'assets/investor-deck'];
const TYPES = {
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
};

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

export function collectInvestorFiles(privateDir) {
  const base = join(privateDir, 'apps', 'web');
  return ROOTS.flatMap(root => {
    const dir = join(base, root);
    return existsSync(dir) ? walk(dir) : [];
  }).map(full => ({
    full,
    path: relative(base, full).split('\\').join('/'),
    contentType:
      TYPES[full.slice(full.lastIndexOf('.'))] ?? 'application/octet-stream',
  }));
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const privateDir =
    process.env.JOVIE_PRIVATE_DIR || join(homedir(), 'Ops', 'jovie-private');
  const files = collectInvestorFiles(privateDir);
  if (!files.length)
    throw new Error(`no investor files under ${privateDir}/apps/web`);
  let sql;
  if (!dryRun) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    const require = createRequire(
      new URL('../apps/web/package.json', import.meta.url)
    );
    sql = require('@neondatabase/serverless').neon(process.env.DATABASE_URL);
  }
  for (const file of files) {
    const body = readFileSync(file.full);
    const sha256 = createHash('sha256').update(body).digest('hex');
    if (sql) {
      await sql`
        INSERT INTO investor_portal_content
          (path, content_type, body_base64, byte_size, sha256, updated_at)
        VALUES
          (${file.path}, ${file.contentType}, ${body.toString('base64')},
           ${body.length}, ${sha256}, now())
        ON CONFLICT (path) DO UPDATE SET
          content_type = EXCLUDED.content_type,
          body_base64 = EXCLUDED.body_base64,
          byte_size = EXCLUDED.byte_size,
          sha256 = EXCLUDED.sha256,
          updated_at = now()`;
    }
    console.log(
      `${dryRun ? 'would upsert' : 'upserted'} ${file.path} (${body.length} bytes, sha256 ${sha256.slice(0, 12)})`
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
