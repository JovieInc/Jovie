// Repo-hygiene rule for screenshot binaries that live in the private R2 store,
// not git. Images the live site serves (symlinked from apps/web/public) stay in
// git and are allowed.
import { isMovedBinary, servedCatalogImages } from './screenshot-store.mjs';

export { isMovedBinary, servedCatalogImages };

/** Error text for a binary addition that the allowlist or the moved rule rejects. */
export function binaryAdditionError(path, policyDoc, allowlisted, served) {
  if (allowlisted && isMovedBinary(path, served))
    return (
      `${path}: screenshot binaries live in the private R2 store, not git. Add a pointer instead: ` +
      'node scripts/screenshot-store.mjs pointers, commit the *.pointer.json, and have someone ' +
      'with the R2 write key run node scripts/screenshot-store.mjs upload. Images the live site ' +
      `serves (symlinked from apps/web/public) are the exception and stay in git; see ${policyDoc}`
    );
  return `${path}: binary addition is outside the allowlisted asset paths`;
}

/** Rule bound to a checkout: which paths are moved, and the error for one. */
export function screenshotBinaryRule(root) {
  const served = servedCatalogImages(root);
  return {
    isMoved: path => isMovedBinary(path, served),
    error: (path, policyDoc, allowlisted) =>
      binaryAdditionError(path, policyDoc, allowlisted, served),
  };
}
