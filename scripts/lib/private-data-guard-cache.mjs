import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const digest = value => createHash('sha256').update(value).digest('hex');
const hasCode = (error, code) =>
  error instanceof Error && 'code' in error && error.code === code;

/**
 * Verify against freshly authenticated pinned source, never a self-trusted receipt.
 * @param {{ cacheDir: string, commit: string, workflowPath: string, script: string }} input
 */
export function cachePinnedGuard({ cacheDir, commit, workflowPath, script }) {
  const identity = { repository: 'JovieInc/ci', workflowPath, commit };
  const sha256 = digest(script);
  const record = Buffer.from(
    JSON.stringify({
      schema: 'jovie.preflight-private-data-guard/v1',
      ...identity,
      script,
      sha256,
    })
  );
  const file = path.join(
    cacheDir,
    `private-data-${digest(JSON.stringify(identity))}.json`
  );
  const verify = () => {
    const fd = openSync(
      file,
      constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW
    );
    try {
      if (!fstatSync(fd).isFile())
        throw new Error('Pinned guard cache is not a regular file');
      // Bound reads by the authenticated record, including one extra byte to
      // detect trailing data. Byte equality verifies every identity/receipt field.
      const bytes = Buffer.alloc(record.length + 1);
      let length = 0;
      while (length < bytes.length) {
        const count = readSync(fd, bytes, length, bytes.length - length, null);
        if (!count) break;
        length += count;
      }
      if (!bytes.subarray(0, length).equals(record))
        throw new Error(
          'Pinned guard cache does not match authenticated source and receipt'
        );
      return { script, file, sha256 };
    } finally {
      closeSync(fd);
    }
  };
  mkdirSync(cacheDir, { recursive: true });
  try {
    return verify();
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) throw error;
  }
  const staging = mkdtempSync(path.join(cacheDir, '.private-data-'));
  const temporary = path.join(staging, 'record.json');
  try {
    const fd = openSync(temporary, 'wx', 0o600);
    try {
      writeFileSync(fd, record);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    try {
      // A complete record appears at once; an existing winner is never replaced.
      linkSync(temporary, file);
    } catch (error) {
      if (!hasCode(error, 'EEXIST')) throw error;
    }
    return verify();
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
