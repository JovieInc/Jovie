/**
 * Postal-address footer for commercial email (CAN-SPAM 15 U.S.C. 7704(a)(5),
 * CASL s.6, GDPR identity disclosure). The address is operator-supplied via
 * LEGAL_MAILING_ADDRESS so a real address never lives in the repo. When unset
 * the footer shows the legal entity name only; the compliance register
 * (canon/COMPLIANCE.md, item CAN-1) tracks setting it as a launch gate for
 * outbound campaigns.
 */

import { LEGAL_ENTITY_NAME } from '@/constants/app';
import { escapeHtml } from './utils';

function resolveSenderIdentity(): string {
  const address = process.env.LEGAL_MAILING_ADDRESS?.trim();
  return address ? `${LEGAL_ENTITY_NAME}, ${address}` : LEGAL_ENTITY_NAME;
}

export function getEmailPostalFooterText(): string {
  return `\n\n${resolveSenderIdentity()}`;
}

export function getEmailPostalFooterHtml(): string {
  return `<p style="margin: 12px 0 0; font-size: 11px; color: #999; text-align: center;">${escapeHtml(resolveSenderIdentity())}</p>`;
}
