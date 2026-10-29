#!/usr/bin/env node
// Evidence store CLI.
//   put <file> [--viewport WxH] [--keep]   upload, write <file>.evidence.json, remove the binary
//   migrate [--dry-run]                    move every in-repo evidence binary to the store
//   verify [--remote]                      validate every pointer; --remote also re-hashes stored bytes
// Needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (or a wrangler login) for uploads and --remote.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import {
  buildPointer,
  downloadObject,
  EVIDENCE_POINTER_SUFFIX,
  isBannedEvidenceBinary,
  pointerPathFor,
  uploadObject,
  validatePointer,
  verifyBytes,
} from './lib/evidence-store.mjs';

const args = process.argv.slice(2);
const [command, ...rest] = args;
const flag = name => rest.includes(name);
const value = name => rest[rest.indexOf(name) + 1];
const tracked = () =>
  execFileSync('git', ['ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  })
    .split('\0')
    .filter(Boolean);

function pngSize(bytes) {
  const png = bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  return png ? `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}` : null;
}

/**
 * @param {string} file
 * @param {{ viewport?: string, keep?: boolean, capturedAt: string, dryRun?: boolean }} options
 */
function putFile(file, { viewport, keep, capturedAt, dryRun }) {
  const bytes = readFileSync(file);
  const pointer = buildPointer({
    bytes,
    extension: extname(file),
    viewport: viewport ?? pngSize(bytes),
    capturedAt,
    label: file,
  });
  if (!dryRun) {
    uploadObject(pointer, file);
    writeFileSync(
      pointerPathFor(file),
      `${JSON.stringify(pointer, null, 2)}\n`
    );
    if (!keep) rmSync(file);
  }
  return pointer;
}

if (command === 'put') {
  const file = rest.find(
    arg => !arg.startsWith('--') && arg !== value('--viewport')
  );
  const pointer = putFile(file, {
    viewport: value('--viewport'),
    keep: flag('--keep'),
    capturedAt: new Date().toISOString(),
  });
  console.log(JSON.stringify(pointer, null, 2));
} else if (command === 'migrate') {
  const dryRun = flag('--dry-run');
  const files = tracked().filter(isBannedEvidenceBinary);
  let bytes = 0;
  for (const file of files) {
    // Preserve provenance: the commit time of the last change, not the migration time.
    const capturedAt = execFileSync(
      'git',
      ['log', '-1', '--format=%cI', '--', file],
      { encoding: 'utf8' }
    ).trim();
    const pointer = putFile(file, { capturedAt, dryRun });
    bytes += pointer.bytes;
    console.log(
      `${dryRun ? 'would move' : 'moved'} ${file} (${pointer.bytes} B)`
    );
  }
  console.log(JSON.stringify({ moved: files.length, bytes, dryRun }));
} else if (command === 'verify') {
  const pointers = tracked().filter(file =>
    file.endsWith(EVIDENCE_POINTER_SUFFIX)
  );
  let failures = 0;
  const scratch = flag('--remote')
    ? mkdtempSync(join(tmpdir(), 'evidence-'))
    : null;
  for (const file of pointers) {
    const pointer = JSON.parse(readFileSync(file, 'utf8'));
    const problems = validatePointer(pointer);
    if (scratch && problems.length === 0) {
      problems.push(
        ...verifyBytes(
          pointer,
          downloadObject(pointer, join(scratch, pointer.sha256))
        )
      );
    }
    if (problems.length > 0) {
      failures += 1;
      console.error(`${file}: ${problems.join('; ')}`);
    }
  }
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  console.log(`${pointers.length} pointers checked, ${failures} invalid`);
  process.exitCode = failures > 0 ? 1 : 0;
} else {
  console.error('Usage: put <file> | migrate [--dry-run] | verify [--remote]');
  process.exitCode = 2;
}
