import {
  assertProofBriefRenderable,
  type CertifiedProofBrief,
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

  const lines: string[] = [brief.hero.sentence];

  for (const point of brief.supportingPoints) {
    lines.push(`- ${point.value ? `${point.value} ` : ''}${point.label}`);
  }

  lines.push(`${brief.window.label}`);

  return lines.join('\n');
}
