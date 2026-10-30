// Hard geometry and readability rules for product shots, in plain ESM so the
// renderer (scripts/product-shots/render.ts), the unit tests and the CI
// invariant (scripts/invariants/art-direction/product-shots.mjs) all read ONE
// definition. Rendered facts come from the manifest entry the renderer wrote.

/**
 * Device frames with a defined screen. The screen aspect is the single
 * source for the CSS (`--product-shot-screen-ratio`, set by <ProductShot>)
 * and for the checks. `phone` is the iPhone 18 Pro screen opening
 * (components/marketing/device/deviceBezels.ts; kept equal by
 * ProductShot.test.tsx). Frames absent here have no defined screen.
 */
export const FRAME_SCREENS = {
  phone: { width: 1206, height: 2622 },
};

/** Largest allowed relative gap between a shot's aspect and its screen. */
export const SCREEN_ASPECT_TOLERANCE = 0.01;
/** Smallest text, in CSS px as the visitor sees it. */
export const MIN_EFFECTIVE_TEXT_PX = 11;
/** A non-full-screen crop may cover at most this share of its viewport. */
export const MAX_CROP_VIEWPORT_SHARE = 0.6;
/** Non-device shots may be shrunk to at most this share of their capture. */
export const MIN_DISPLAY_SCALE = 0.6;

/** width / height of a frame's screen, or null when it has none. */
export function frameScreenAspect(frame) {
  const screen = FRAME_SCREENS[frame];
  return screen ? screen.width / screen.height : null;
}

/**
 * Failures for one rendered shot. `shot` carries the facts:
 * frame, fullScreen, displayWidth (CSS px), width/height (rendered px),
 * capture {cssWidth, cssHeight, viewportWidth, viewportHeight}, minTextPx
 * (smallest visible text font-size in the crop, null when it has no text).
 */
export function checkShotGeometry(id, shot) {
  /** @type {string[]} */
  const failures = [];
  const aspect = frameScreenAspect(shot.frame);
  const capture = shot.capture;
  if (!capture || typeof shot.minTextPx === 'undefined') {
    return [
      `${id}: manifest lacks capture geometry or minTextPx; re-render with pnpm --filter @jovie/web shots:render --only ${id}`,
    ];
  }
  if (aspect !== null) {
    const actual = shot.width / shot.height;
    const gap = Math.abs(actual - aspect) / aspect;
    if (gap > SCREEN_ASPECT_TOLERANCE) {
      failures.push(
        `${id}: ${shot.frame} frame screen aspect is ${aspect.toFixed(4)} but the shot is ${actual.toFixed(4)} (${(gap * 100).toFixed(1)}% off, max ${SCREEN_ASPECT_TOLERANCE * 100}%). A device shot fills its screen exactly: crop the real screen, never letterbox or shrink it`
      );
    }
  }
  if (shot.minTextPx !== null) {
    const effective = (shot.minTextPx * shot.displayWidth) / capture.cssWidth;
    if (effective < MIN_EFFECTIVE_TEXT_PX) {
      failures.push(
        `${id}: smallest text is ${effective.toFixed(1)}px on the page (${shot.minTextPx}px x ${shot.displayWidth}/${capture.cssWidth}); minimum ${MIN_EFFECTIVE_TEXT_PX}px. Crop tighter or raise displayWidth`
      );
    }
  }
  if (shot.fullScreen && aspect === null) {
    failures.push(
      `${id}: fullScreen is only for device frames with a defined screen (frame ${shot.frame})`
    );
  }
  const share =
    (capture.cssWidth * capture.cssHeight) /
    (capture.viewportWidth * capture.viewportHeight);
  if (!shot.fullScreen && share > MAX_CROP_VIEWPORT_SHARE) {
    failures.push(
      `${id}: crop covers ${(share * 100).toFixed(0)}% of the capture viewport (max ${MAX_CROP_VIEWPORT_SHARE * 100}%). Crop to the moment that matters, or declare fullScreen: true for a single device screen`
    );
  }
  if (aspect === null) {
    const scale = shot.displayWidth / capture.cssWidth;
    if (scale < MIN_DISPLAY_SCALE) {
      failures.push(
        `${id}: shown at ${scale.toFixed(2)}x of its capture (min ${MIN_DISPLAY_SCALE}); the whole page is shrunk. Crop tighter`
      );
    }
  }
  return failures;
}
