import type { RiderSection } from './types';

export interface RiderRenderInput {
  artistName: string;
  technical: readonly RiderSection[];
  hospitality: readonly RiderSection[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderSectionsMarkdown(sections: readonly RiderSection[]): string[] {
  return sections.flatMap(section => [
    `### ${section.title}`,
    '',
    ...section.items.map(item => `- ${item}`),
    '',
  ]);
}

/** Deterministic Markdown export — identical input, identical bytes. */
export function renderRiderMarkdown(input: RiderRenderInput): string {
  const lines = [
    `# ${input.artistName} — Rider`,
    '',
    '## Technical Rider',
    '',
    ...renderSectionsMarkdown(input.technical),
    '## Hospitality Rider',
    '',
    ...renderSectionsMarkdown(input.hospitality),
  ];
  return `${lines.join('\n').trimEnd()}\n`;
}

function renderSectionsHtml(sections: readonly RiderSection[]): string {
  return sections
    .map(
      section => `<section>
<h3>${escapeHtml(section.title)}</h3>
<ul>
${section.items.map(item => `<li>${escapeHtml(item)}</li>`).join('\n')}
</ul>
</section>`
    )
    .join('\n');
}

/** Deterministic standalone HTML export; all user text is escaped. */
export function renderRiderHtml(input: RiderRenderInput): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.artistName)} — Rider</title>
</head>
<body>
<h1>${escapeHtml(input.artistName)} — Rider</h1>
<h2>Technical Rider</h2>
${renderSectionsHtml(input.technical)}
<h2>Hospitality Rider</h2>
${renderSectionsHtml(input.hospitality)}
</body>
</html>
`;
}
