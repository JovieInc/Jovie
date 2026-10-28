/**
 * Jovie marketing motion and shader presets (2026-10-26 motion language).
 *
 * One typed source for the four effects. Durations and easings are never
 * restated here as CSS: components read the tokens from design-system.css
 * (--ds-motion-cinematic-*, --motion-*). The numbers below are what the
 * script-driven effects (WebGL field, scroll-linked hero) need at runtime, and
 * presets.test.ts pins each one to its CSS token so the two cannot drift.
 *
 * Guide: .claude/skills/design-system/guides/motion.md
 */

/** x1, y1, x2, y2 of a cubic-bezier. Mirrors --ds-motion-cinematic-easing. */
export type BezierCurve = readonly [number, number, number, number];

export const CINEMATIC_CURVE: BezierCurve = [0.22, 1, 0.36, 1];
/** Mirrors --ds-motion-cinematic-duration, in ms. */
export const CINEMATIC_DURATION_MS = 420;

export const motionPresets = {
  /** WebGL2 section background. Matte, monochrome, near-black. */
  matteField: {
    base: [0.012, 0.016, 0.024],
    accent: [0.067, 0.686, 1],
    /** Allowed range is 0 to accentMax: one small focal, never a wash. */
    accentAmt: 0,
    accentMax: 0.06,
    /** --motion-field-grain */
    grain: 0.03,
    drift: 0.9,
    /** uv per second, upper bound of the noise scroll speed. */
    driftMaxUvPerSecond: 0.012,
    focal: [0.5, 0.5],
    /** --motion-field-fps */
    fpsCap: 30,
    resolutionScale: 0.5,
  },
  /** Scroll-linked hero: the product shell zooms out to its rest frame. */
  heroShellZoom: {
    /** --motion-hero-zoom-from */
    scaleFrom: 1.94,
    shellWidth: 1348,
    shellHeight: 960,
    restFrameWidth: 1248,
    /** Rest frame origin in page coordinates. */
    restFrameX: 96,
    restFrameY: 384,
    /** The claim form, in shell coordinates: the point that stays under the eye. */
    anchor: { x: 602, y: 470 },
    anchorFrom: { x: 720, y: 620 },
    headlineYFrom: 132,
    headlineYTo: 144,
    headlineLift: 40,
    headlineDim: 0.5,
    /** Zoom runs between these scroll progress values. */
    zoomRange: [0.05, 0.75],
    /** Logo row fades in from this progress. */
    logoRowFrom: 0.85,
    logoRowOffsetPx: 8,
    /** --motion-scroll-hero-range, as viewport heights of scroll. */
    scrollRangeSvh: 1,
  },
  /** CSS 3D depth on the product shell. */
  shellParallax: {
    /** --motion-parallax-tilt */
    tiltDeg: 6,
    enterTranslateY: 80,
    /** Enter takes two cinematic durations. */
    enterDurationFactor: 2,
    /** translateZ lift per plane, px. */
    planes: { claimForm: 18, rightRail: 30, audioDock: 8 },
    /** --motion-parallax-pointer-max, fine pointers only. */
    pointerMaxDeg: 1.5,
  },
  /** App: profile hands the screen to the conversation on send. */
  chatTakeover: {
    durationMs: CINEMATIC_DURATION_MS,
    /** --motion-takeover-lift */
    profileLiftPx: -32,
    profileScaleTo: 0.98,
    /** Profile fades out over the first 70% of the move. */
    profileFadeEnd: 0.7,
    /** --motion-takeover-settle */
    conversationSettlePx: 24,
    /** Conversation fades in from 30%. */
    conversationFadeStart: 0.3,
    /** Reduced motion: opacity cross-fade only, in ms (the subtle duration). */
    reducedCrossfadeMs: 150,
  },
} as const;

export type MotionPresetId = keyof typeof motionPresets;
