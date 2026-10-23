/**
 * Capture only after image preparation succeeds. A thrown preparation leaves
 * the previous catalog file in place.
 */
export async function captureOnlyWhenImagesReady<T>(
  prepare: () => Promise<void>,
  capture: () => Promise<T>
): Promise<T> {
  await prepare();
  return capture();
}
