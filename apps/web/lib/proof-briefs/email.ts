import {
  assertProofBriefRenderable,
  type CertifiedProofBrief,
  proofBriefProvenance,
} from './contract';

export interface ProofBriefEmail {
  readonly subject: string;
  /** Full plain-text body — the email is useful without a click. */
  readonly text: string;
  /** Self-contained HTML module for the existing delivery infrastructure. */
  readonly html: string;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Email body/module for founder/investor updates and weekly recaps.
 * Private-scoped briefs are allowed here — email goes to the owner via the
 * existing (separately authorized) delivery infrastructure.
 */
export function renderProofBriefEmail(
  brief: CertifiedProofBrief,
  options: { readonly now?: Date } = {}
): ProofBriefEmail {
  assertProofBriefRenderable(brief, { now: options.now });

  const subject = brief.hero.value
    ? `${brief.hero.value} ${brief.hero.label ?? 'results'} | ${brief.window.label}`
    : `Your Jovie recap | ${brief.window.label}`;

  const textLines: string[] = [
    "Here's what Jovie did for you in the last 7 days.",
    `${brief.subject} | ${brief.window.label}`,
    '',
    brief.hero.sentence,
    '',
  ];
  for (const point of brief.supportingPoints) {
    textLines.push(`- ${point.value ? `${point.value} ` : ''}${point.label}`);
  }
  if (brief.supportingPoints.length > 0) {
    textLines.push('');
  }
  if (brief.unknowns.length > 0) {
    textLines.push(`Not measured: ${brief.unknowns.join(', ')}.`);
    textLines.push('These outcomes remain unknown, not zero.');
    textLines.push('');
  }
  textLines.push(proofBriefProvenance(brief));

  const pointsHtml = brief.supportingPoints
    .map(
      point => `<tr>
  <td style="padding:8px 0;font-size:15px;color:#F5F5F7;">
    ${point.value ? `<strong>${escapeHtml(point.value)}</strong> ` : ''}${escapeHtml(point.label)}
  </td>
</tr>`
    )
    .join('');

  const unknownsHtml = brief.unknowns.length
    ? `<p style="font-size:13px;line-height:1.5;color:#86868B;margin:0 0 20px;">Not measured: ${escapeHtml(brief.unknowns.join(', '))}. These outcomes remain unknown, not zero.</p>`
    : '';

  const html = `<div style="font-family:'Satoshi',Helvetica,Arial,sans-serif;background:#000000;color:#F5F5F7;padding:32px;">
  <p style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#86868B;margin:0 0 16px;">Your week with Jovie | ${escapeHtml(brief.window.label)}</p>
  <p style="font-size:16px;color:#86868B;margin:0 0 8px;">Here's what Jovie did for you in the last 7 days.</p>
  <p style="font-size:14px;color:#86868B;margin:0 0 20px;">${escapeHtml(brief.subject)}</p>
  ${brief.hero.value ? `<p style="font-size:48px;font-weight:700;letter-spacing:-0.02em;margin:0;">${escapeHtml(brief.hero.value)}</p>` : ''}
  <p style="font-size:20px;font-weight:600;margin:8px 0 24px;">${escapeHtml(brief.hero.sentence)}</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">${pointsHtml}</table>
  ${unknownsHtml}
  <p style="font-size:12px;color:#86868B;margin:0;">${escapeHtml(proofBriefProvenance(brief))}</p>
</div>`;

  return { subject, text: textLines.join('\n'), html };
}
