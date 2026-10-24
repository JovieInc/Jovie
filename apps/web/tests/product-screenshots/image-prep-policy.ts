/**
 * Capture only after image preparation and image-readiness verification
 * succeed. A thrown preparation or verification leaves the previous catalog
 * file in place.
 *
 * Readiness is verified both before and after the capture so a lazy image
 * that goes incomplete in the timing window around the screenshot (e.g. a
 * Next/Image srcset swap during a full-page capture) rejects the candidate
 * instead of shipping a half-loaded frame (JOV-8804).
 */
export async function captureOnlyWhenImagesReady<T>(
  prepare: () => Promise<void>,
  verifyImagesReady: () => Promise<void>,
  capture: () => Promise<T>
): Promise<T> {
  await prepare();
  await verifyImagesReady();
  const result = await capture();
  await verifyImagesReady();
  return result;
}
