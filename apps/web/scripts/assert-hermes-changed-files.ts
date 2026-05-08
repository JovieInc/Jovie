#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import { assertHermesChangedFilesAllowed } from '../lib/hermes/allowed-paths';
import { parseHermesPayload } from './hermes-cli-worker';

const payloadFile = process.argv[2];
const changedFilesFile = process.argv[3];

if (!payloadFile || !changedFilesFile) {
  console.error(
    'Usage: assert-hermes-changed-files.ts <payload-file> <changed-files-file>'
  );
  process.exit(1);
}

const payload = parseHermesPayload(
  JSON.parse(readFileSync(payloadFile, 'utf8'))
);
const changedFiles = readFileSync(changedFilesFile, 'utf8')
  .split('\n')
  .map(file => file.trim())
  .filter(Boolean);

assertHermesChangedFilesAllowed(changedFiles, payload.allowedPaths);
console.log(
  `Hermes changed-file guard passed for ${changedFiles.length} file(s).`
);
