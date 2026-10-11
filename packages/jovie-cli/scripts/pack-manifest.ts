/** Select a stable YY.M.PATCH CLI release without changing the desktop stamp. */
export function resolveReleaseVersion(
  canonicalVersion: string,
  explicitVersion?: string
): string {
  const version =
    explicitVersion === undefined || explicitVersion === ''
      ? canonicalVersion.trim()
      : explicitVersion;
  if (
    !/^[1-9]\d\.(1[0-2]|[1-9])\.(0|[1-9]\d*)$/.test(version) ||
    !Number.isSafeInteger(Number(version.split('.')[2]))
  ) {
    throw new Error('The CLI release version must be stable YY.M.PATCH.');
  }
  return version;
}

export function createReleaseManifest(
  manifestText: string,
  releaseVersion: string
): string {
  if (!releaseVersion.trim()) {
    throw new Error('A release version is required for npm pack.');
  }

  const version = resolveReleaseVersion(releaseVersion);
  const parsed: unknown = JSON.parse(manifestText);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The package manifest must be a JSON object.');
  }

  const manifest = parsed as Record<string, unknown>;
  if (Object.hasOwn(manifest, 'version') && manifest.version !== version) {
    throw new Error(
      `Package version ${String(manifest.version)} does not match CLI release ${version}.`
    );
  }

  return `${JSON.stringify({ ...manifest, version }, null, 2)}\n`;
}
