import { createHash } from 'node:crypto';
import { canonical } from './canonical-json.mjs';

// Process-local qualification. A JSON assertion or a comment marker cannot mint
// replay evidence. The evidence owner must rerun compilation before promotion.
const qualified = new WeakMap();
export const compilationDigest = value =>
  createHash('sha256').update(canonical(value)).digest('hex');

export function qualifyCompilation(receipt, expiresAt) {
  qualified.set(receipt, { digest: compilationDigest(receipt), expiresAt });
  return receipt;
}

export function hasCompilationProof(receipt, now = Date.now()) {
  const proof = qualified.get(receipt);
  return Boolean(
    proof &&
      proof.expiresAt > now &&
      proof.digest === compilationDigest(receipt)
  );
}
