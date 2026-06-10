import { randomBytes } from 'node:crypto';

const TOKEN_BYTES = 18;

/** URL-safe opaque token for public /drop/[token] links. */
export function generateLibraryShareDropToken(): string {
  return randomBytes(TOKEN_BYTES)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 24);
}
