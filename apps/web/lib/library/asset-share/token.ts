import { randomBytes } from 'node:crypto';

const TOKEN_HEX_BYTES = 16;
const TOKEN_LENGTH = 24;

/** URL-safe opaque token for private /p/[token] asset links. */
export function generateLibraryAssetShareToken(): string {
  return randomBytes(TOKEN_HEX_BYTES).toString('hex').slice(0, TOKEN_LENGTH);
}
