import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const MAX_PROSE_FILE_BYTES = 128 * 1024;
export const MAX_PROSE_TOTAL_BYTES = 1024 * 1024;
export const MAX_PROSE_FILES = 12;
const SHA = /^[a-f0-9]{40}$/u;
const blobHash = bytes =>
  createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');

/** A narrow content constraint on the existing docs lane, not a path classifier. */
export function assertInertSourceProse(paths, entries) {
  if (
    !Array.isArray(paths) ||
    paths.length === 0 ||
    paths.length > MAX_PROSE_FILES ||
    !Array.isArray(entries) ||
    entries.length !== paths.length ||
    new Set(entries.map(entry => entry.path)).size !== paths.length
  )
    throw new Error('Incomplete source prose objects');
  let total = 0;
  for (const path of paths) {
    const entry = entries.find(item => item.path === path);
    if (
      !entry ||
      entry.mode !== '100644' ||
      entry.type !== 'blob' ||
      !Buffer.isBuffer(entry.bytes) ||
      !SHA.test(entry.sha) ||
      blobHash(entry.bytes) !== entry.sha
    )
      throw new Error(`Source prose is not an exact regular blob: ${path}`);
    total += entry.bytes.length;
    if (
      entry.bytes.length > MAX_PROSE_FILE_BYTES ||
      total > MAX_PROSE_TOTAL_BYTES
    )
      throw new Error(`Source prose exceeds its byte bound: ${path}`);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(entry.bytes);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text))
      throw new Error(`Source prose contains binary/control bytes: ${path}`);
    // Conservative exclusions retain full checks for executable instructions,
    // raw HTML, active URI schemes, and ambiguous encoded markup.
    if (
      /(?:^|\n)\s*#!/u.test(text) ||
      /<|`{3}|~{3}| {4}|\t/u.test(text) ||
      /`[^`\r\n]*[\s$;&|{}<>][^`\r\n]*`/u.test(text) ||
      /(?:javascript|vbscript|data)\s*:|&(?:#x?[\da-f]+|lt|gt|colon|Tab|NewLine);/iu.test(
        text
      )
    )
      throw new Error(
        `Source prose contains executable or ambiguous markup: ${path}`
      );
  }
}

/** Read exact immutable Git objects; neither checkout bytes nor replace refs qualify. */
export function readSourceProseEntries({ root, headSha, paths }) {
  if (
    !SHA.test(headSha) ||
    !Array.isArray(paths) ||
    !paths.length ||
    paths.length > MAX_PROSE_FILES
  )
    throw new Error('Exact source prose identity required');
  const prefix = [
    '--no-replace-objects',
    '--literal-pathspecs',
    '--no-lazy-fetch',
  ];
  /** @type {import('node:child_process').ExecFileSyncOptions & { env: NodeJS.ProcessEnv }} */
  const options = {
    cwd: root,
    timeout: 30000,
    maxBuffer: 2 * MAX_PROSE_TOTAL_BYTES,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
  };
  // Hooks may export repository routing. The requested root owns these reads.
  for (const key of execFileSync('git', ['rev-parse', '--local-env-vars'], {
    ...options,
    encoding: 'utf8',
  })
    .trim()
    .split('\n'))
    if (key) delete options.env[key];
  if (
    execFileSync(
      'git',
      [...prefix, 'rev-parse', '--verify', `${headSha}^{commit}`],
      { ...options, encoding: 'utf8' }
    ).trim() !== headSha
  )
    throw new Error('Exact source prose commit unavailable');
  const listing = execFileSync(
    'git',
    [...prefix, 'ls-tree', '-r', '-z', '--full-tree', headSha, '--', ...paths],
    { ...options, encoding: 'utf8' }
  );
  if (!listing.endsWith('\0')) throw new Error('Incomplete source prose tree');
  const entries = listing
    .slice(0, -1)
    .split('\0')
    .map(row => {
      const match = row.match(/^(\d+) (\w+) ([a-f0-9]{40})\t(.+)$/u);
      if (!match) throw new Error('Malformed source prose tree');
      return {
        mode: match[1],
        type: match[2],
        sha: match[3],
        path: match[4],
        bytes: Buffer.alloc(0),
      };
    });
  if (
    entries.length !== paths.length ||
    entries.some(entry => !paths.includes(entry.path) || entry.type !== 'blob')
  )
    throw new Error('Incomplete source prose blobs');
  const input = `${entries.map(entry => entry.sha).join('\n')}\n`;
  const sizes = execFileSync('git', [...prefix, 'cat-file', '--batch-check'], {
    ...options,
    input,
    encoding: 'utf8',
  })
    .trimEnd()
    .split('\n');
  let total = 0;
  for (let i = 0; i < entries.length; i++) {
    const match = sizes[i]?.match(/^([a-f0-9]{40}) blob (\d+)$/u);
    const size = Number(match?.[2]);
    total += size;
    if (
      !match ||
      match[1] !== entries[i].sha ||
      size > MAX_PROSE_FILE_BYTES ||
      total > MAX_PROSE_TOTAL_BYTES
    )
      throw new Error('Source prose objects exceed their byte bound');
  }
  if (sizes.length !== entries.length)
    throw new Error('Unexpected prose sizes');
  /** @type {import('node:child_process').ExecFileSyncOptionsWithBufferEncoding} */
  const binaryOptions = {
    ...options,
    input,
    encoding: null,
  };
  const batch = execFileSync(
    'git',
    [...prefix, 'cat-file', '--batch'],
    binaryOptions
  );
  let cursor = 0;
  for (const entry of entries) {
    const end = batch.indexOf(10, cursor);
    const header = batch.subarray(cursor, end).toString('ascii');
    const match = header.match(/^([a-f0-9]{40}) blob (\d+)$/u);
    if (end < cursor || !match || match[1] !== entry.sha)
      throw new Error('Malformed source prose blob');
    const size = Number(match[2]);
    cursor = end + 1;
    if (size > MAX_PROSE_FILE_BYTES || batch[cursor + size] !== 10)
      throw new Error('Truncated source prose blob');
    entry.bytes = batch.subarray(cursor, cursor + size);
    cursor += size + 1;
  }
  if (cursor !== batch.length) throw new Error('Unexpected source prose bytes');
  return entries;
}
