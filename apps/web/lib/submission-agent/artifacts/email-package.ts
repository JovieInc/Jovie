import { createHash } from 'node:crypto';
import { escapeHtml } from '@/lib/email/utils';
import type {
  CanonicalSubmissionContext,
  SubmissionAttachment,
  SubmissionMonitoringBaseline,
  SubmissionPackage,
} from '../types';

export function computeAttachmentChecksum(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function buildSubmissionPackage(params: {
  canonical: CanonicalSubmissionContext;
  subject: string;
  greeting: string;
  bodyIntro: string;
  attachments: SubmissionAttachment[];
  monitoringBaseline: SubmissionMonitoringBaseline;
}): SubmissionPackage {
  const {
    canonical,
    subject,
    greeting,
    bodyIntro,
    attachments,
    monitoringBaseline,
  } = params;
  const artistName = canonical.artistName;
  const releaseTitle = canonical.release?.title ?? 'Untitled release';
  const releaseDate = canonical.release?.releaseDate
    ? canonical.release.releaseDate.toISOString().slice(0, 10)
    : 'Unknown';

  const text = `${greeting}

${bodyIntro}

Artist: ${artistName}
Release: ${releaseTitle}
Release Date: ${releaseDate}
Reply-To: ${canonical.replyToEmail ?? canonical.artistContactEmail ?? 'Not provided'}

Attachments included:
${attachments.map(attachment => `- ${attachment.filename}`).join('\n')}
`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827;">
      <p>${escapeHtml(greeting)}</p>
      <p>${escapeHtml(bodyIntro)}</p>
      <table style="border-collapse: collapse; margin: 24px 0;">
        <tbody>
          <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Artist</td><td>${escapeHtml(artistName)}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Release</td><td>${escapeHtml(releaseTitle)}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Release Date</td><td>${escapeHtml(releaseDate)}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Reply-To</td><td>${escapeHtml(canonical.replyToEmail ?? canonical.artistContactEmail ?? 'Not provided')}</td></tr>
        </tbody>
      </table>
      <p style="font-weight: 600;">Attachments included</p>
      <ul>
        ${attachments.map(attachment => `<li>${escapeHtml(attachment.filename)}</li>`).join('')}
      </ul>
    </div>
  `;

  return {
    subject,
    text,
    html,
    attachments,
    monitoringBaseline,
  };
}
