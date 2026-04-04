export function assertSessionCanApplyToRelease(params: {
  readonly sessionReleaseId: string | null;
  readonly targetReleaseId: string;
}) {
  if (
    params.sessionReleaseId !== null &&
    params.sessionReleaseId !== params.targetReleaseId
  ) {
    throw new Error('Album art session does not belong to this release');
  }
}
