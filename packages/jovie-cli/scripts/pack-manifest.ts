export function createReleaseManifest(
  manifestText: string,
  releaseVersion: string
): string {
  const version = releaseVersion.trim();
  if (!version) {
    throw new Error('A release version is required for npm pack.');
  }

  const parsed: unknown = JSON.parse(manifestText);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The package manifest must be a JSON object.');
  }

  return `${JSON.stringify(
    { ...(parsed as Record<string, unknown>), version },
    null,
    2
  )}\n`;
}
