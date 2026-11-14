/**
 * Fill for the account button's loading placeholders (JOV-12383).
 *
 * The previous fills (`bg-sidebar-accent`, `bg-surface-2`, `bg-on-media/10`)
 * resolve to within 1.06:1 of the light sidebar, header and menu surfaces, so
 * the loading state was invisible in light mode. Tertiary text at 75% clears
 * the 3:1 non-text floor on every surface the account button renders on, in
 * light and dark (asserted in account-loading-fill.test.ts).
 */
export const ACCOUNT_LOADING_FILL = 'bg-tertiary-token/75';

/** Token and alpha behind ACCOUNT_LOADING_FILL, for the contrast test. */
export const ACCOUNT_LOADING_FILL_TOKEN = '--color-text-tertiary-token';
export const ACCOUNT_LOADING_FILL_ALPHA = 0.75;
