/**
 * Email Module
 *
 * Central export for email functionality.
 */

export {
  enqueueBulkClaimInviteJobs,
  enqueueClaimInviteJob,
} from './jobs/enqueue';
export type {
  SendClaimInvitePayload,
  SendClaimInviteResult,
} from './jobs/send-claim-invite';
export {
  processSendClaimInviteJob,
  sendClaimInviteJobConfig,
  sendClaimInvitePayloadSchema,
} from './jobs/send-claim-invite';
export type { ClaimInviteTemplateData } from './templates/claim-invite';
export {
  buildClaimUrl,
  buildPreviewUrl,
  getClaimInviteEmail,
  getClaimInviteHtml,
  getClaimInviteSubject,
  getClaimInviteText,
} from './templates/claim-invite';
export type { DspBioUpdateTemplateData } from './templates/dsp-bio-update';
export {
  getDspBioUpdateEmail,
  getDspBioUpdateHtml,
  getDspBioUpdateSubject,
  getDspBioUpdateText,
} from './templates/dsp-bio-update';
export type { TipThankYouTemplateData } from './templates/tip-thank-you';
export {
  getTipThankYouEmail,
  getTipThankYouHtml,
  getTipThankYouSubject,
  getTipThankYouText,
} from './templates/tip-thank-you';
