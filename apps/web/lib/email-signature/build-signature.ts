/**
 * Build an HTML email signature for an artist's Jovie profile.
 *
 * The output is email-client-safe: table-based layout, inline styles,
 * system font stack, and https-only absolute URLs. A conditional
 * "Get yours at jov.ie" footer is appended when `hideJovieBranding` is false.
 */

import { BASE_URL, HOSTNAME } from '@/constants/domains';

export interface EmailSignatureSocial {
  readonly label: string;
  readonly url: string;
}

export interface EmailSignatureInput {
  readonly name: string;
  readonly handle: string;
  readonly tagline?: string | null;
  readonly avatarUrl?: string | null;
  readonly socials?: ReadonlyArray<EmailSignatureSocial>;
  readonly hideJovieBranding?: boolean;
}

export interface BuiltEmailSignature {
  readonly html: string;
  readonly text: string;
}

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

const UTM_FOOTER_SUFFIX =
  '?utm_source=email_signature&utm_medium=footer&utm_campaign=get_yours';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isSafeHttpsUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizeSocials(
  socials: ReadonlyArray<EmailSignatureSocial> | undefined
): EmailSignatureSocial[] {
  if (!socials) return [];
  return socials
    .map(social => ({
      label: social.label.trim(),
      url: social.url.trim(),
    }))
    .filter(social => social.label && isSafeHttpsUrl(social.url));
}

function buildProfileUrl(handle: string): string {
  return `${BASE_URL}/${encodeURIComponent(handle)}`;
}

export function buildEmailSignature(
  input: EmailSignatureInput
): BuiltEmailSignature {
  const name = input.name.trim();
  const handle = input.handle.trim();
  const tagline = input.tagline?.trim() ?? '';
  const avatarUrl =
    input.avatarUrl && isSafeHttpsUrl(input.avatarUrl) ? input.avatarUrl : null;
  const socials = sanitizeSocials(input.socials);
  const showFooter = input.hideJovieBranding !== true;

  const profileUrl = buildProfileUrl(handle);
  const profileUrlDisplay = `${HOSTNAME}/${handle}`;

  const avatarCell = avatarUrl
    ? `<td style="padding-right:12px;vertical-align:top;"><img src="${escapeHtml(avatarUrl)}" width="56" height="56" alt="${escapeHtml(name)}" style="display:block;border:0;border-radius:28px;width:56px;height:56px;object-fit:cover;"/></td>`
    : '';

  const socialsLine = socials.length
    ? `<div style="margin-top:4px;color:#525866;font-size:12px;">${socials
        .map(
          social =>
            `<a href="${escapeHtml(social.url)}" style="color:#525866;text-decoration:none;">${escapeHtml(social.label)}</a>`
        )
        .join('&nbsp;·&nbsp;')}</div>`
    : '';

  const taglineLine = tagline
    ? `<div style="color:#525866;font-size:13px;line-height:1.45;">${escapeHtml(tagline)}</div>`
    : '';

  const footerHref = `${BASE_URL}/${UTM_FOOTER_SUFFIX}`;
  const footer = showFooter
    ? `<tr><td colspan="2" style="padding-top:8px;font-size:11px;color:#8b94a3;">Get yours at <a href="${escapeHtml(footerHref)}" style="color:#8b94a3;text-decoration:none;">${HOSTNAME}</a></td></tr>`
    : '';

  const html = `<table cellpadding="0" cellspacing="0" border="0" style="font-family:${FONT_STACK};color:#0d0e12;font-size:14px;line-height:1.4;"><tr>${avatarCell}<td style="vertical-align:top;"><div style="font-weight:600;font-size:15px;color:#0d0e12;">${escapeHtml(name)}</div>${taglineLine}<div style="margin-top:4px;"><a href="${escapeHtml(profileUrl)}" style="color:#3b5bdb;text-decoration:none;font-weight:500;">${escapeHtml(profileUrlDisplay)}</a></div>${socialsLine}</td></tr>${footer}</table>`;

  const textLines = [name];
  if (tagline) textLines.push(tagline);
  textLines.push(profileUrlDisplay);
  if (socials.length) {
    textLines.push(socials.map(s => `${s.label}: ${s.url}`).join(' | '));
  }
  if (showFooter) textLines.push(`Get yours at ${HOSTNAME}`);

  return { html, text: textLines.join('\n') };
}
