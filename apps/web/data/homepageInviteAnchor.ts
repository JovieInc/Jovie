/**
 * In-page anchor for the closing waitlist form. Its own tiny module so the
 * shared client header can import it without pulling the whole homepage copy
 * object into every route's first-load JS (route-js-budgets).
 */
export const HOMEPAGE_INVITE_ANCHOR = 'request-invite';

/**
 * In-page anchor for the closing claim section, which replaces the waitlist
 * form while public signup is open. Whichever closing section renders also
 * carries the other id as an empty alias, so `/#request-invite` and
 * `/#claim-profile` both scroll to the page's one conversion.
 */
export const HOMEPAGE_CLAIM_ANCHOR = 'claim-profile';
