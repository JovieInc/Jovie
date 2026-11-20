/** Paths the native-design-system fixture must copy before check/write. */
export function nativeDesignFixturePaths(manifest, manifestPath) {
  return [
    manifestPath,
    manifest.palette,
    manifest.semantics,
    manifest.paintDebt,
    manifest.actionButtonContract,
  ];
}
