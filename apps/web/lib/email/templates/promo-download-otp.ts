/**
 * Promo Download OTP Email Template
 *
 * Sent when a DJ enters their email to download promo tracks.
 * Contains a 6-digit OTP code for verification.
 */

import { EMAIL_OTP_TTL_MINUTES } from '@/lib/notifications/email-otp';
import { escapeHtml } from '../utils';

export interface PromoDownloadOtpTemplateData {
  /** Release/track title */
  title: string;
  /** Artist display name */
  artistName: string;
  /** 6-digit OTP code */
  otpCode: string;
  /** Release artwork URL (optional) */
  artworkUrl?: string | null;
}

export function getPromoDownloadOtpSubject(
  data: PromoDownloadOtpTemplateData
): string {
  return `Your code to download "${data.title}" from ${data.artistName}`;
}

export function getPromoDownloadOtpText(
  data: PromoDownloadOtpTemplateData
): string {
  return `Your verification code: ${data.otpCode}

Use this code to download "${data.title}" from ${data.artistName}.
This code expires in ${EMAIL_OTP_TTL_MINUTES} minutes.

If you didn't request this, you can ignore this email.`;
}

export function getPromoDownloadOtpHtml(
  data: PromoDownloadOtpTemplateData
): string {
  const safeTitle = escapeHtml(data.title);
  const safeArtist = escapeHtml(data.artistName);

  const artworkSection = data.artworkUrl
    ? `<img src="${escapeHtml(data.artworkUrl)}" alt="${safeTitle}" width="80" height="80" style="border-radius:8px;margin-bottom:16px;" />`
    : '';

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:400px;margin:0 auto;padding:32px 0;">
      ${artworkSection}
      <p style="margin:0 0 8px;font-size:15px;color:#666;">
        Your code to download <strong style="color:#111;">${safeTitle}</strong> from <strong style="color:#111;">${safeArtist}</strong>
      </p>
      <p style="font-size:36px;letter-spacing:8px;font-weight:700;margin:24px 0;color:#111;font-family:monospace;">
        ${data.otpCode}
      </p>
      <p style="font-size:13px;color:#999;margin:0;">
        This code expires in ${EMAIL_OTP_TTL_MINUTES} minutes. If you didn't request this, you can ignore this email.
      </p>
    </div>
  `;
}
