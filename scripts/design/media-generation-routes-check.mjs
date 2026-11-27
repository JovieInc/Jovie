#!/usr/bin/env node
/**
 * JOV-13852 — fail if media-generation inventory paths are missing.
 * Usage: node scripts/design/media-generation-routes-check.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const INVENTORY = path.join(
  REPO_ROOT,
  'docs/design-system/media-generation-routes.json'
);

export function collectMissingPaths(
  repoRoot = REPO_ROOT,
  inventoryPath = INVENTORY
) {
  const raw = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  /** @type {string[]} */
  const missing = [];
  /** @type {string[]} */
  const checked = [];
  for (const lane of raw.lanes ?? []) {
    for (const rel of [lane.entry, ...(lane.surfaces ?? [])].filter(Boolean)) {
      checked.push(rel);
      if (!existsSync(path.join(repoRoot, rel))) missing.push(rel);
    }
  }
  return { schema: raw.schema, checked, missing };
}

function main() {
  const result = collectMissingPaths();
  if (result.missing.length > 0) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          schema: result.schema,
          missing: result.missing,
          message: 'Media-generation inventory paths missing on disk',
        },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        schema: result.schema,
        checked: result.checked.length,
        message: 'Media-generation inventory paths present',
      },
      null,
      2
    )
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
