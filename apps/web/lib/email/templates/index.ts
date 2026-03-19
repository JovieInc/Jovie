/**
 * Email Templates Index
 *
 * Central export for all email templates.
 */

export type { ChangelogVerifyTemplateData } from './changelog-verify';
export {
  getChangelogVerifyEmail,
  getChangelogVerifyHtml,
  getChangelogVerifySubject,
  getChangelogVerifyText,
} from './changelog-verify';
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
export type { FounderWelcomeTemplateData } from './founder-welcome';
export {
  getFounderWelcomeEmail,
  getFounderWelcomeHtml,
  getFounderWelcomeSubject,
  getFounderWelcomeText,
} from './founder-welcome';
export type { ProductUpdateTemplateData } from './product-update';
export {
  getProductUpdateEmail,
  getProductUpdateHtml,
  getProductUpdateSubject,
  getProductUpdateText,
  getProductUpdateUnsubscribeHeaders,
} from './product-update';
export type { TipThankYouTemplateData } from './tip-thank-you';
export {
  getTipThankYouEmail,
  getTipThankYouHtml,
  getTipThankYouSubject,
  getTipThankYouText,
} from './tip-thank-you';
