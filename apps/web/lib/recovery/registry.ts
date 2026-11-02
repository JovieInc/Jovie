/**
 * Known-bad flow registry. A recovery email may only mention a flow that is
 * listed here, linked to the issue that fixed it and the production check that
 * proves it (canon: never email about an unfixed flow).
 *
 * `shippedInCode` is flipped by the fix PR itself, so it is true only in builds
 * that contain the fix. The deploy time is never hand-set: the production
 * certifier records the first moment a production build with the flag is
 * observed serving (see probes.server.ts), and the gate re-runs the step's
 * production golden-path check before every send.
 */

export type RecoveryStep = 'preview' | 'signup_pending';

export interface KnownBadFlowFix {
  readonly id: string;
  readonly issue: string;
  readonly step: RecoveryStep;
  /** Template class: approving one template approves its later sends. */
  readonly templateClass: 'step-fixed';
  /** Sentence fragments, written for the person: what happened, what changed. */
  readonly whatBroke: string;
  readonly whatChanged: string;
  /** Where the recipient lands, relative to BASE_URL, when no page link exists. */
  readonly fallbackPath: string;
  /** Production golden-path surface id re-run by the gate (see gate.ts). */
  readonly checkId: string;
  readonly shippedInCode: boolean;
}

export const KNOWN_BAD_FLOW_FIXES: readonly KnownBadFlowFix[] = [
  {
    id: 'preview-real-catalog',
    issue: 'JOV-9758',
    step: 'preview',
    templateClass: 'step-fixed',
    whatBroke: 'your preview only showed your name and a photo',
    whatChanged: 'it now shows your own releases',
    fallbackPath: '/start',
    checkId: 'golden-path-preview-has-release',
    shippedInCode: true,
  },
  {
    id: 'signup-confirmation-link',
    issue: 'JOV-9756',
    step: 'signup_pending',
    templateClass: 'step-fixed',
    whatBroke: 'you signed up and never heard back from us',
    whatChanged:
      'signups now get a confirmation and pick up where they left off',
    fallbackPath: '/start',
    checkId: 'signup-signin',
    shippedInCode: false,
  },
];

export const MAX_RECOVERY_EMAILS_PER_USER = 2;
