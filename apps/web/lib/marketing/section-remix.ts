import type { MarketingSectionEntry } from '@/data/marketingSectionRegistry';

export const MARKETING_REMIX_ASPECT_RATIOS = [
  '16:9',
  '4:3',
  '1:1',
  '3:4',
  '9:16',
  '2:1',
] as const;

export type MarketingRemixAspectRatio =
  (typeof MARKETING_REMIX_ASPECT_RATIOS)[number];

interface BuildMarketingSectionRemixPromptInput {
  readonly section: MarketingSectionEntry;
  readonly aspectRatio: MarketingRemixAspectRatio;
  readonly includeDesignGuidance: boolean;
}

interface BuildMarketingSectionImplementationPromptInput
  extends BuildMarketingSectionRemixPromptInput {
  readonly generatedImageUrl?: string;
  readonly generatedPrompt?: string;
}

const DESIGN_GUIDANCE_SUMMARY = [
  'Current Jovie design guidance:',
  '- Keep the work premium, compact, and precise rather than generic dashboard-heavy.',
  '- Use one clear headline, one useful subhead, and one visual idea per marketing section.',
  '- Do not add extra eyebrow text, helper rows, proof bars, nested cards, or decorative motion unless the section needs them.',
  '- Keep existing brand colors and visual tokens when converting a chosen mockup back into code.',
  '- Use Title Case for labels, headings, buttons, badges, and nav items; use sentence case for body copy.',
  '- Use icons instead of emoji.',
].join('\n');

const OPEN_EXPLORATION_GUIDANCE = [
  'Exploration mode:',
  '- Do not constrain this mockup to the current component styling.',
  '- Preserve the product truth, section content, hierarchy, and conversion intent.',
  '- Explore a materially different visual layout that could later be adapted into Jovie.',
  '- Keep the result clean enough to translate into HTML and React without relying on illustration-only tricks.',
].join('\n');

function formatList(label: string, values: readonly string[]): string {
  return `${label}: ${values.length > 0 ? values.join(', ') : 'None'}`;
}

function formatCopyVariants(section: MarketingSectionEntry): string {
  return section.copyVariants
    .map(variant =>
      [
        `- ${variant.label}: ${variant.headline}`,
        variant.body ? `  ${variant.body}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n');
}

export function buildMarketingSectionRemixPrompt({
  section,
  aspectRatio,
  includeDesignGuidance,
}: BuildMarketingSectionRemixPromptInput): string {
  const guidance = includeDesignGuidance
    ? DESIGN_GUIDANCE_SUMMARY
    : OPEN_EXPLORATION_GUIDANCE;

  return [
    `Generate one high-fidelity landing page section mockup at ${aspectRatio}.`,
    'The mockup should keep the same section content and product intent, but use a noticeably different design direction from the current implementation.',
    `Section id: ${section.id}`,
    `Section label: ${section.label}`,
    `Section family: ${section.family}`,
    `Section status: ${section.status}`,
    formatList('Current pages', section.currentPages),
    formatList('Candidate pages', section.candidatePages),
    `Primary preview headline: ${section.preview.headline}`,
    section.preview.body ? `Primary preview body: ${section.preview.body}` : '',
    section.preview.chips?.length
      ? formatList('Content chips', section.preview.chips)
      : '',
    section.preview.metric ? `Metric: ${section.preview.metric}` : '',
    'Copy variants:',
    formatCopyVariants(section),
    guidance,
    'Output only the mockup image. Do not render browser chrome, annotations, before/after comparisons, or explanatory text around the section.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildMarketingSectionImplementationPrompt({
  section,
  aspectRatio,
  includeDesignGuidance,
  generatedImageUrl,
  generatedPrompt,
}: BuildMarketingSectionImplementationPromptInput): string {
  const imageReference =
    generatedImageUrl && !generatedImageUrl.startsWith('data:')
      ? `Generated image reference: ${generatedImageUrl}`
      : generatedImageUrl
        ? 'Generated image reference: attach the mockup image shown in the lab with this prompt.'
        : 'Generated image reference: no mockup image is attached yet. Generate one from the design prompt below, then attach it when asking for implementation.';

  return [
    'Please convert this approved marketing section mockup into the Jovie codebase.',
    '',
    `Target section: ${section.label}`,
    `Registry id: ${section.id}`,
    section.testId ? `Test id: ${section.testId}` : 'Test id: not assigned',
    `Aspect ratio used for mockup: ${aspectRatio}`,
    imageReference,
    '',
    'Implementation scope:',
    '- Replace or modify the production component mapped to this registry entry, or add the missing mapped component if this entry is still a fallback sketch.',
    '- Preserve the section content contract unless the mockup clearly improves hierarchy without changing product claims.',
    '- Keep the final CTA locked if this request touches the locked CTA entry.',
    '- Keep marketing routes static and avoid database, admin, or persistence dependencies.',
    '- Use existing shared marketing primitives where they fit, but do not force the mockup into old one-off chrome.',
    '- If the registry id starts with artifact:, treat it as a Design Studio image reference rather than a production component name. Build the matching page section and replace the artifact with real code.',
    '- Use browser QA and screenshots to compare the implementation against the attached mockup/reference. Iterate until the built result reaches close visual parity while still respecting the design system.',
    '',
    includeDesignGuidance ? DESIGN_GUIDANCE_SUMMARY : OPEN_EXPLORATION_GUIDANCE,
    '',
    'Design generation prompt used:',
    '```text',
    generatedPrompt ??
      buildMarketingSectionRemixPrompt({
        section,
        aspectRatio,
        includeDesignGuidance,
      }),
    '```',
  ].join('\n');
}
