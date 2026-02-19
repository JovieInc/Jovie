/**
 * Shared overlay styles for modal components.
 * Used by Dialog, AlertDialog, Sheet, and similar overlay components.
 */

/**
 * Base overlay styles with fade animations.
 * Provides consistent backdrop styling across all overlay components.
 */
export const overlayStyles = {
  base: 'fixed inset-0 z-50 bg-black/80',
  animation:
    'data-[state=open]:animate-in data-[state=closed]:animate-out ' +
    'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
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
  layout: 'grid w-full max-w-lg gap-4',
  surface: 'border border-subtle bg-surface-2 p-6 text-primary-token shadow-xl',
  // fade + zoom only; slide animations conflict with the translate centering
  // because tw-animate-css slide uses transform: translate3d() in keyframes
  animation:
    'duration-200 ' +
    'data-[state=open]:animate-in data-[state=closed]:animate-out ' +
    'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ' +
    'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
  rounded: 'rounded-xl sm:rounded-2xl',
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
  base: 'flex flex-col space-y-1.5 text-center sm:text-left',
} as const;

/**
 * Footer styles for modal components.
 */
export const footerStyles = {
  base: 'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
} as const;

/**
 * Title styles for modal components.
 */
export const titleStyles = {
  base: 'text-lg font-semibold leading-none tracking-tight',
} as const;

/**
 * Description styles for modal components.
 */
export const descriptionStyles = {
  base: 'text-sm text-secondary-token',
} as const;
