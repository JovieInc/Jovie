import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checksumBuffer, checksumFile, sameChecksum } from './checksum';

describe('checksum', () => {
  it('hashes a buffer with size', () => {
    const sum = checksumBuffer(Buffer.from('hello'));
    expect(sum.sizeBytes).toBe(5);
    expect(sum.sha256).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });

  it('hashes a file identically to its buffer', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mi-sum-'));
    const path = join(dir, 'a.bin');
    const content = Buffer.from('media bytes');
    await writeFile(path, content);
    const fileSum = await checksumFile(path);
    expect(sameChecksum(fileSum, checksumBuffer(content))).toBe(true);
    await rm(dir, { recursive: true });
  });
});
