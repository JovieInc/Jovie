// Repo-hygiene rule for screenshot binaries that live in R2, not git.
import { isMovedBinary } from './screenshot-store.mjs';

export { isMovedBinary };

/** Error text for a binary addition that the allowlist rejects. */
export function binaryAdditionError(path, policyDoc) {
  if (isMovedBinary(path))
    return (
      `${path}: screenshot binaries live in R2, not git. Add a pointer instead: ` +
      'node scripts/screenshot-store.mjs pointers (then commit the *.pointer.json ' +
      `and run the "Screenshots to R2 upload" workflow); see ${policyDoc}`
    );
  return `${path}: binary addition is outside the allowlisted asset paths`;
}
