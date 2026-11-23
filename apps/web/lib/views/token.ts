import { randomBytes } from 'node:crypto';

const VIEW_SHARE_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

/** 32-hex opaque token for public /v/[token] view links. */
export function generateViewShareToken(): string {
  return randomBytes(16).toString('hex');
}

export function isViewShareToken(value: string): boolean {
  return VIEW_SHARE_TOKEN_PATTERN.test(value);
}
