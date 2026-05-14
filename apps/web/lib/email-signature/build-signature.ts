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

export interface EmailSignatureRelease {
  readonly title: string;
  readonly url: string;
  readonly artworkUrl?: string | null;
}

export interface EmailSignatureInput {
  readonly name: string;
  readonly handle: string;
  readonly tagline?: string | null;
  readonly avatarUrl?: string | null;
  readonly socials?: ReadonlyArray<EmailSignatureSocial>;
  readonly latestRelease?: EmailSignatureRelease | null;
  readonly hideJovieBranding?: boolean;
}

export interface BuiltEmailSignature {
  readonly html: string;
  readonly text: string;
}

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

const UTM_FOOTER_SUFFIX =
  '?utm_source=email_signature&utm_medium=referral&utm_campaign=branding';

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

function sanitizeRelease(
  release: EmailSignatureRelease | null | undefined
): EmailSignatureRelease | null {
  if (!release) return null;
  const title = release.title.trim();
  const url = release.url.trim();
  if (!title || !isSafeHttpsUrl(url)) return null;
  const artworkUrl =
    release.artworkUrl && isSafeHttpsUrl(release.artworkUrl)
      ? release.artworkUrl
      : null;
  return { title, url, artworkUrl };
}

function buildProfileUrl(handle: string): string {
  return `${BASE_URL}/${encodeURIComponent(handle)}`;
}

function renderReleaseRow(release: EmailSignatureRelease): string {
  const artwork = release.artworkUrl
    ? `<td style="padding-right:10px;vertical-align:middle;width:48px;"><a href="${escapeHtml(release.url)}" style="text-decoration:none;"><img src="${escapeHtml(release.artworkUrl)}" width="48" height="48" alt="${escapeHtml(release.title)} artwork" style="display:block;border:0;border-radius:6px;width:48px;height:48px;object-fit:cover;"/></a></td>`
    : '';
  return `<tr><td colspan="2" style="padding-top:10px;"><table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>${artwork}<td style="vertical-align:middle;"><div style="font-size:12px;color:#525866;line-height:1.4;">Latest release</div><div style="font-size:13px;color:#0d0e12;font-weight:500;line-height:1.4;">${escapeHtml(release.title)}</div><div style="margin-top:2px;"><a href="${escapeHtml(release.url)}" style="color:#3b5bdb;text-decoration:none;font-size:12px;">Stream now &rarr;</a></div></td></tr></table></td></tr>`;
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
  const release = sanitizeRelease(input.latestRelease);
  const showFooter = input.hideJovieBranding !== true;

  const profileUrl = buildProfileUrl(handle);
  const profileUrlDisplay = `${HOSTNAME}/${handle}`;

  const avatarCell = avatarUrl
    ? `<td style="padding-right:12px;vertical-align:top;width:56px;"><img src="${escapeHtml(avatarUrl)}" width="56" height="56" alt="${escapeHtml(name)}" style="display:block;border:0;border-radius:28px;width:56px;height:56px;object-fit:cover;"/></td>`
    : '';

  const socialsLine = socials.length
    ? `<div style="margin-top:6px;color:#525866;font-size:12px;">${socials
        .map(
          social =>
            `<a href="${escapeHtml(social.url)}" style="color:#525866;text-decoration:none;">${escapeHtml(social.label)}</a>`
        )
        .join('&nbsp;·&nbsp;')}</div>`
    : '';

  const taglineLine = tagline
    ? `<div style="color:#525866;font-size:13px;line-height:1.45;">${escapeHtml(tagline)}</div>`
    : '';

  const releaseRow = release ? renderReleaseRow(release) : '';

  const footerHref = `${BASE_URL}/${UTM_FOOTER_SUFFIX}`;
  const footer = showFooter
    ? `<tr><td colspan="2" style="padding-top:10px;border-top:1px solid #e5e7eb;"><div style="padding-top:8px;font-size:11px;color:#8b94a3;">Get your free music link in bio &rarr; <a href="${escapeHtml(footerHref)}" style="color:#8b94a3;text-decoration:underline;">${HOSTNAME}</a></div></td></tr>`
    : '';

  const html = `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="font-family:${FONT_STACK};color:#0d0e12;font-size:14px;line-height:1.4;max-width:600px;"><tr>${avatarCell}<td style="vertical-align:top;"><div style="font-weight:600;font-size:16px;color:#0d0e12;">${escapeHtml(name)}</div>${taglineLine}<div style="margin-top:6px;"><a href="${escapeHtml(profileUrl)}" style="display:inline-block;color:#3b5bdb;text-decoration:none;font-weight:600;font-size:14px;">${escapeHtml(profileUrlDisplay)}</a></div>${socialsLine}</td></tr>${releaseRow}${footer}</table>`;

  const textLines = [name];
  if (tagline) textLines.push(tagline);
  textLines.push(profileUrlDisplay);
  if (socials.length) {
    textLines.push(socials.map(s => `${s.label}: ${s.url}`).join(' | '));
  }
  if (release) {
    textLines.push(`Latest release: ${release.title} — ${release.url}`);
  }
  if (showFooter) {
    textLines.push(`Get your free music link in bio → ${HOSTNAME}`);
  }

  return { html, text: textLines.join('\n') };
}
