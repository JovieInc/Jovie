import { randomBytes } from 'node:crypto';

const TOKEN_BYTES = 18;
type RandomBytesSource = (size: number) => Buffer;

/** URL-safe opaque token for public /drop/[token] links. */
export function generateLibraryShareDropToken(
  randomBytesSource: RandomBytesSource = randomBytes
): string {
  return randomBytesSource(TOKEN_BYTES).toString('base64url');
}
