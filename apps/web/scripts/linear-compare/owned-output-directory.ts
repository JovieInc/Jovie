import { resetOwnedOutputDirectorySync } from '../owned-output-path';

const OWNED_DIRECTORY_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Replaces one producer's generated artifacts without touching sibling outputs.
 */
export function resetOwnedOutputDirectory(
  outputRoot: string,
  producer: string
): string {
  if (!OWNED_DIRECTORY_NAME.test(producer)) {
    throw new Error(`Invalid output producer name: ${producer}`);
  }

  return resetOwnedOutputDirectorySync(
    outputRoot,
    producer,
    'LINEAR_COMPARE_OUTPUT_DIR'
  );
}
