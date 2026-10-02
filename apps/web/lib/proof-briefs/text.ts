import {
  assertProofBriefRenderable,
  type CertifiedProofBrief,
  proofBriefBrand,
} from './contract';

/**
 * Copy-ready plain text for Messages/notes. No markdown — destinations like
 * iMessage render raw asterisks. Hierarchy: hero sentence, supporting
 * bullets, window context, provenance.
 */
export function renderProofBriefText(
  brief: CertifiedProofBrief,
  options: { readonly now?: Date } = {}
): string {
  assertProofBriefRenderable(brief, { now: options.now });

  const lines: string[] = [
    proofBriefBrand(brief).intro,
    `${brief.subject} | ${brief.window.label}`,
    '',
    brief.hero.sentence,
  ];

  for (const point of brief.supportingPoints) {
    lines.push(`- ${point.value ? `${point.value} ` : ''}${point.label}`);
  }

  if (brief.unknowns.length > 0) {
    lines.push('');
    lines.push(`Not measured: ${brief.unknowns.join(', ')}.`);
    lines.push('These outcomes remain unknown, not zero.');
  }

  return lines.join('\n');
}
