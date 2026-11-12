/**
 * Layout classes shared by the live inline notifications flow and its loading
 * skeleton, so the skeleton reserves the email step's exact footprint and the
 * swap moves nothing below it.
 */
export const INLINE_FLOW = {
  root: 'relative flex h-full min-h-full flex-1 flex-col dark:text-white',
  body: 'relative mx-auto flex w-full max-w-108 flex-col px-5',
  inset: 'h-full pb-8 pt-6',
  topBar: 'flex items-center justify-between pb-5',
  step: 'flex min-h-0 flex-1 flex-col',
} as const;
