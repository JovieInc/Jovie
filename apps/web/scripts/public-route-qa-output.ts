import path from 'node:path';
import { resetOwnedOutputDirectory } from './owned-output-path';

export async function resetPublicRouteQaOutput(
  outputBase: string,
  outputRoot: string
): Promise<void> {
  const resolvedBase = path.resolve(outputBase);
  const resolvedRoot = path.resolve(outputRoot);
  const relativePath = path.relative(resolvedBase, resolvedRoot);

  if (
    relativePath === '' ||
    path.dirname(relativePath) !== '.' ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(
      'PUBLIC_ROUTE_QA_OUTPUT_DIR must stay within test-results/public-route-qa'
    );
  }

  await resetOwnedOutputDirectory(
    resolvedBase,
    relativePath,
    'PUBLIC_ROUTE_QA_OUTPUT_DIR'
  );
}
