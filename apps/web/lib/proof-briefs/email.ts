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
    ? `${brief.hero.value} ${brief.hero.label ?? 'results'} — ${brief.window.label}`
    : `${brief.window.label} update`;

  const textLines: string[] = [
    `Here's what Jovie did for ${brief.subject} this week.`,
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
  textLines.push(`Window: ${brief.window.label}`);
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

  const html = `<div style="font-family:'Satoshi',Helvetica,Arial,sans-serif;background:#000000;color:#F5F5F7;padding:32px;">
  <p style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#86868B;margin:0 0 16px;">Weekly proof · ${escapeHtml(brief.window.label)}</p>
  <p style="font-size:16px;color:#86868B;margin:0 0 8px;">Here's what Jovie did for ${escapeHtml(brief.subject)} this week.</p>
  ${brief.hero.value ? `<p style="font-size:48px;font-weight:700;letter-spacing:-0.02em;margin:0;">${escapeHtml(brief.hero.value)}</p>` : ''}
  <p style="font-size:20px;font-weight:600;margin:8px 0 24px;">${escapeHtml(brief.hero.sentence)}</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">${pointsHtml}</table>
  <p style="font-size:12px;color:#86868B;margin:0;">${escapeHtml(proofBriefProvenance(brief))}</p>
</div>`;

  return { subject, text: textLines.join('\n'), html };
}
