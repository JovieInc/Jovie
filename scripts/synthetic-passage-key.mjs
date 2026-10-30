#!/usr/bin/env node
/**
 * Derive the /start canary passage key for one CI job (JOV-9822).
 *
 *   CRON_SECRET=... node scripts/synthetic-passage-key.mjs
 *
 * Must match derivePassageKey in apps/web/lib/synthetic/passage-token.ts
 * (HKDF-SHA256, salt jovie-synthetic-passage, info jovie.synthetic-passage/v1,
 * 32 bytes). The key can only mint passage tokens; it is masked, written to
 * GITHUB_ENV as SYNTHETIC_PASSAGE_KEY (base64url) and never printed.
 */
import { hkdfSync } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function derivePassageKeyBase64Url(rootSecret) {
  if (!rootSecret || rootSecret.length < 16) {
    throw new Error('CRON_SECRET is missing or too short.');
  }
  return Buffer.from(
    hkdfSync(
      'sha256',
      rootSecret,
      'jovie-synthetic-passage',
      'jovie.synthetic-passage/v1',
      32
    )
  ).toString('base64url');
}

function main() {
  const envFile = process.env.GITHUB_ENV;
  if (!envFile)
    throw new Error('GITHUB_ENV is not set; refusing to print the key.');
  const key = derivePassageKeyBase64Url(process.env.CRON_SECRET ?? '');
  process.stdout.write(`::add-mask::${key}\n`);
  appendFileSync(envFile, `SYNTHETIC_PASSAGE_KEY=${key}\n`);
  process.stdout.write('Derived SYNTHETIC_PASSAGE_KEY for this job.\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}
