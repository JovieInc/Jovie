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

// Published pages serve /proof/* from apps/docs/public/proof. That path is a
// real directory after the screenshot move. If it is a symlink whose target
// is also in the upload, Vercel copies the link onto itself and exits with
// "Cannot copy ... to a subdirectory of itself". Replace a symlink with a
// real directory before `next build` on Vercel only. A real directory is a
// no-op.
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
