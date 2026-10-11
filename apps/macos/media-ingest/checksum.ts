import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { Checksum } from './types';

export async function checksumFile(path: string): Promise<Checksum> {
  const { size } = await stat(path);
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path, { highWaterMark: 1024 * 1024 });
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  return { sizeBytes: size, sha256: hash.digest('hex') };
}

export function checksumKey(checksum: Checksum): string {
  return `${checksum.sizeBytes}:${checksum.sha256}`;
}

export function sameChecksum(a: Checksum, b: Checksum): boolean {
  return checksumKey(a) === checksumKey(b);
}
