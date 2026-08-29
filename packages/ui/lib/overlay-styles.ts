/**
 * Shared overlay styles for modal components.
 * Used by Dialog, AlertDialog, Sheet, and similar overlay components.
 */

/**
 * Base overlay styles with fade animations.
 * Provides consistent backdrop styling across all overlay components.
 */
export const overlayStyles = {
  base: 'fixed inset-0 z-50 bg-black/52',
  animation:
    'data-[state=open]:animate-in data-[state=closed]:animate-out ' +
    'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ' +
    'motion-reduce:animate-none',
} as const;

/**
 * Combined overlay class string for convenience.
 */
export const overlayClassName = `${overlayStyles.base} ${overlayStyles.animation}`;

/**
 * Base content positioning and animation styles.
 * Used for centered modal dialogs.
 */
export const centeredContentStyles = {
  // Use CSS translate property directly (not Tailwind's CSS-variable-based
  // translate utilities) to avoid a Chrome bug where translate with CSS vars
  // fails to composite: https://github.com/shadcn-ui/ui/issues/7507
  position: 'fixed left-1/2 top-1/2 z-50 [translate:-50%_-50%]',
  layout:
    'grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg gap-5 overflow-y-auto overscroll-contain',
  surface:
    'border border-default bg-surface-elevated p-5 text-primary-token shadow-popover sm:p-6',
  // fade + zoom only; slide animations conflict with the translate centering
  // because tw-animate-css slide uses transform: translate3d() in keyframes
  animation:
    'duration-200 ' +
    'data-[state=open]:animate-in data-[state=closed]:animate-out ' +
    'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ' +
    'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
  rounded: 'rounded-(--system-b-radius-panel)',
  // Motion-reduced fallback
  reducedMotion: 'motion-reduce:animate-none motion-reduce:transition-opacity',
} as const;

/**
 * Combined centered content class string.
 */
export const centeredContentClassName = [
  centeredContentStyles.position,
  centeredContentStyles.layout,
  centeredContentStyles.surface,
  centeredContentStyles.animation,
  centeredContentStyles.rounded,
  centeredContentStyles.reducedMotion,
].join(' ');

/**
 * Header styles for modal components.
 */
export const headerStyles = {
  base: 'flex min-w-0 flex-col gap-1.5 pr-10 text-left',
} as const;

/**
 * Footer styles for modal components.
 */
export const footerStyles = {
  base: 'flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end',
} as const;

/**
 * Title styles for modal components.
 */
export const titleStyles = {
  base: 'text-base font-medium leading-snug tracking-[-0.015em] text-primary-token',
} as const;

/**
 * Description styles for modal components.
 */
export const descriptionStyles = {
  base: 'text-app leading-relaxed text-secondary-token',
} as const;

/**
 * Shared sheet/drawer surface anatomy. Position and motion remain side-specific.
 */
export const sheetSurfaceStyles =
  'fixed z-[65] grid gap-5 overflow-y-auto overscroll-contain border-default bg-surface-elevated p-5 text-primary-token shadow-popover';
