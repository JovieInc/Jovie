/**
 * Email Templates Index
 *
 * Central export for all email templates.
 */

export type { ClaimInviteTemplateData } from './claim-invite';
export {
  buildClaimUrl,
  buildPreviewUrl,
  getClaimInviteEmail,
  getClaimInviteHtml,
  getClaimInviteSubject,
  getClaimInviteText,
} from './claim-invite';
export type { DspBioUpdateTemplateData } from './dsp-bio-update';
export {
  getDspBioUpdateEmail,
  getDspBioUpdateHtml,
  getDspBioUpdateSubject,
  getDspBioUpdateText,
} from './dsp-bio-update';
export type { TipThankYouTemplateData } from './tip-thank-you';
export {
  getTipThankYouEmail,
  getTipThankYouHtml,
  getTipThankYouSubject,
  getTipThankYouText,
} from './tip-thank-you';
