#!/usr/bin/env node

import {
  cpSync,
  lstatSync,
  readlinkSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const proofLink = join(import.meta.dirname, '..', 'public', 'proof');

// Vercel follows `public/proof` -> `docs/screenshots/help-center` while
// copying build output. Once that directory is in the upload, the copy
// source and destination are the same path and the build exits with
// "Cannot copy ... to a subdirectory of itself". Replace the symlink
// with a real directory before `next build` on Vercel only.
export function materializeProofDirectory(proofPath, env = process.env) {
  if (!env.VERCEL) return { materialized: false, reason: 'not-vercel' };
  const stat = lstatSync(proofPath, { throwIfNoEntry: false });
  if (!stat) return { materialized: false, reason: 'missing' };
  if (!stat.isSymbolicLink()) {
    return { materialized: false, reason: 'already-directory' };
  }
  const target = resolve(dirname(proofPath), readlinkSync(proofPath));
  const staging = `${proofPath}.materialized`;
  rmSync(staging, { recursive: true, force: true });
  cpSync(target, staging, { recursive: true, dereference: true });
  rmSync(proofPath);
  renameSync(staging, proofPath);
  return { materialized: true, target };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const result = materializeProofDirectory(proofLink);
    if (result.materialized) {
      writeSync(1, `materialize-proof: copied ${result.target}\n`);
    }
  } catch (error) {
    writeSync(
      2,
      `materialize-proof: ${error instanceof Error ? error.message : error}\n`
    );
    process.exit(1);
  }
}
