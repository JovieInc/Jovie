#!/usr/bin/env node
/**
 * Rebuild and re-upload the Pen golden-path workspace archive when its source
 * files change, so CI (scripts/invariants/pen-golden-path.mjs) always fetches
 * the current design. Runs as a launchd agent (install-pen-golden-path-sync.sh).
 *
 *   node pen-golden-path-sync.mjs [--force] [--dry-run]
 *
 * Archive = the named .pen files plus the asset folders they resolve against
 * (fonts, images, assets), never the 3 GB workspace. Upload goes to a private
 * R2 bucket under an unguessable key kept only in the state dir; the
 * jovie-pen-files Worker serves that one key. Receipt with a timestamp per
 * stage and the archive sha256: <state>/receipt.json (+ ledger.jsonl).
 * Kill switch: touch <state>/disabled.
 *
 * Env overrides: PEN_SYNC_WORKSPACE, PEN_SYNC_STATE, PEN_SYNC_BUCKET.
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// The manifest's penFile.name. The homepage frame UfvR8 is in no saved .pen
// file yet; add its file here once it is saved (then locatePen needs a per-frame file).
export const PEN_FILES = ['Jovie Design Studio — canonical.lib.pen'];
export const ASSET_DIRS = ['fonts', 'images', 'assets'];
export const BUCKET = 'jovie-pen-golden-path';

const sha256 = data => createHash('sha256').update(data).digest('hex');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

/** Sorted relative paths that go into the archive; missing pen files throw. */
export function archiveFiles(
  workspace,
  penFiles = PEN_FILES,
  assetDirs = ASSET_DIRS
) {
  for (const name of penFiles) {
    if (!existsSync(join(workspace, name)))
      throw new Error(`missing pen file: ${name}`);
  }
  const files = [...penFiles];
  for (const dir of assetDirs) {
    const abs = join(workspace, dir);
    if (existsSync(abs))
      files.push(...walk(abs).map(p => relative(workspace, p)));
  }
  return files.sort();
}

/** Cheap change detector: pen content hashes plus asset size and mtime. */
export function fingerprint(workspace, files) {
  const h = createHash('sha256');
  for (const rel of files) {
    const abs = join(workspace, rel);
    if (rel.endsWith('.pen'))
      h.update(`${rel}\0${sha256(readFileSync(abs))}\n`);
    else {
      const st = statSync(abs);
      h.update(`${rel}\0${st.size}\0${Math.floor(st.mtimeMs)}\n`);
    }
  }
  return h.digest('hex');
}

const defaultRun = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'], ...opts });

/**
 * @param {{ workspace: string, state: string, bucket?: string, force?: boolean, dryRun?: boolean, run?: typeof defaultRun, now?: () => Date }} o
 */
export function sync({
  workspace,
  state,
  bucket = BUCKET,
  force = false,
  dryRun = false,
  run = defaultRun,
  now = () => new Date(),
}) {
  mkdirSync(state, { recursive: true });
  const stages = {};
  const stamp = name => {
    stages[name] = now().toISOString();
  };
  const receipt = {
    schema: 'pen-golden-path-sync/v1',
    stages,
    result: 'started',
  };
  const finish = result => {
    receipt.result = result;
    writeFileSync(
      join(state, 'receipt.json'),
      `${JSON.stringify(receipt, null, 2)}\n`
    );
    appendFileSync(join(state, 'ledger.jsonl'), `${JSON.stringify(receipt)}\n`);
    return receipt;
  };
  stamp('start');
  if (existsSync(join(state, 'disabled'))) return finish('disabled');

  const files = archiveFiles(workspace);
  const print = fingerprint(workspace, files);
  receipt.fingerprint = print;
  receipt.fileCount = files.length;
  receipt.penFiles = Object.fromEntries(
    PEN_FILES.map(name => [name, sha256(readFileSync(join(workspace, name)))])
  );
  stamp('detected');
  const prior = existsSync(join(state, 'fingerprint'))
    ? readFileSync(join(state, 'fingerprint'), 'utf8').trim()
    : null;
  if (!force && prior === print) return finish('unchanged');

  const list = join(state, 'files.txt');
  writeFileSync(list, `${files.join('\n')}\n`);
  const archive = join(state, 'workspace.tar.gz');
  run('tar', ['-czf', archive, '-C', workspace, '-T', list]);
  const bytes = readFileSync(archive);
  receipt.archiveSha256 = sha256(bytes);
  receipt.archiveBytes = bytes.length;
  stamp('archived');
  if (dryRun) return finish('dry-run');

  const keyFile = join(state, 'object-key');
  if (!existsSync(keyFile)) {
    writeFileSync(
      keyFile,
      `${randomBytes(16).toString('hex')}/workspace.tar.gz\n`,
      { mode: 0o600 }
    );
  }
  const key = readFileSync(keyFile, 'utf8').trim();
  run('npx', [
    '-y',
    'wrangler@4',
    'r2',
    'object',
    'put',
    `${bucket}/${key}`,
    '--file',
    archive,
    '--content-type',
    'application/gzip',
    '--remote',
  ]);
  stamp('uploaded');
  writeFileSync(join(state, 'fingerprint'), `${print}\n`);
  return finish('uploaded');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const workspace =
    process.env.PEN_SYNC_WORKSPACE ??
    join(homedir(), 'Documents/Jovie/Jovie Marketing Workspace');
  const state =
    process.env.PEN_SYNC_STATE ??
    join(homedir(), '.local/state/pen-golden-path-sync');
  try {
    const r = sync({
      workspace,
      state,
      bucket: process.env.PEN_SYNC_BUCKET ?? BUCKET,
      force: argv.includes('--force'),
      dryRun: argv.includes('--dry-run'),
    });
    process.stdout.write(
      `pen-golden-path-sync: ${r.result} ${r.archiveSha256 ?? ''}\n`
    );
  } catch (error) {
    process.stderr.write(
      `pen-golden-path-sync failed: ${error?.message ?? error}\n`
    );
    process.exit(1);
  }
}
