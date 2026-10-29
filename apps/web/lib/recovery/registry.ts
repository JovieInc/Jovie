/**
 * Known-bad flow registry. A recovery email may only mention a flow that is
 * listed here, linked to the issue that fixed it and the production check that
 * proves it (canon: never email about an unfixed flow).
 *
 * `deployedAt` stays null until the fix is merged AND live on production.
 * Setting it is part of the fix PR's own checklist; the gate re-runs the
 * step's check before every send, so a stale value cannot send on its own.
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
  /** Production check id re-run by the gate (see gate.ts). */
  readonly checkId: string;
  readonly deployedAt: string | null;
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
    deployedAt: null,
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
    checkId: 'golden-path-signup-confirmation',
    deployedAt: null,
  },
];

export const MAX_RECOVERY_EMAILS_PER_USER = 2;
