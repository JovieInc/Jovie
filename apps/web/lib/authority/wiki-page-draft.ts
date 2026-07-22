/**
 * Deterministic artist wiki / Genius page draft builder from claimed graph context.
 *
 * Never fabricates press, awards, or collabs — only uses caller-supplied facts.
 * Wikipedia drafts include a human-gate banner; Fandom/Genius are agent-assisted.
 *
 * GH #14651.
 */

import {
  AUTHORITY_PLATFORM_META,
  type AuthorityPagePlatform,
  type AuthorityPublishGate,
  resolveAuthorityCreateUrl,
} from './platforms';

export interface AuthorityReleaseFact {
  readonly title: string;
  readonly year?: string | null;
  readonly role?: string | null;
}

export interface AuthorityCollabFact {
  readonly name: string;
  readonly context?: string | null;
  /** When true, peer page exists but this artist is an unlinked plain-text mention. */
  readonly unlinkedMention?: boolean;
  readonly sourceUrl?: string | null;
}

export interface AuthorityPressFact {
  readonly title: string;
  readonly outlet?: string | null;
  readonly url?: string | null;
  readonly confirmed?: boolean;
}

export interface ClaimedGraphContext {
  readonly artistName: string;
  readonly aliases?: readonly string[];
  readonly bio?: string | null;
  readonly genres?: readonly string[];
  readonly releases?: readonly AuthorityReleaseFact[];
  readonly collabs?: readonly AuthorityCollabFact[];
  readonly confirmedPress?: readonly AuthorityPressFact[];
  /** Profile username for internal cross-links in draft notes. */
  readonly jovieUsername?: string | null;
}

export interface AuthorityPageDraft {
  readonly platform: AuthorityPagePlatform;
  readonly platformLabel: string;
  readonly publishGate: AuthorityPublishGate;
  readonly createUrl: string;
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly checklist: readonly string[];
  readonly sources: readonly string[];
  readonly humanGateRequired: boolean;
}

function nonEmpty(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function uniqueNonEmpty(
  values: readonly (string | null | undefined)[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!nonEmpty(value)) continue;
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function formatReleaseLine(release: AuthorityReleaseFact): string {
  const year = nonEmpty(release.year) ? ` (${release.year.trim()})` : '';
  const role = nonEmpty(release.role) ? ` — ${release.role.trim()}` : '';
  return `- **${release.title.trim()}**${year}${role}`;
}

function formatCollabLine(collab: AuthorityCollabFact): string {
  const context = nonEmpty(collab.context) ? ` — ${collab.context.trim()}` : '';
  const unlinked = collab.unlinkedMention
    ? ' (currently unlinked plain-text mention)'
    : '';
  return `- **${collab.name.trim()}**${context}${unlinked}`;
}

function formatPressLine(press: AuthorityPressFact): string {
  const outlet = nonEmpty(press.outlet) ? `${press.outlet.trim()}: ` : '';
  const title = press.title.trim();
  if (nonEmpty(press.url)) {
    return `- ${outlet}[${title}](${press.url.trim()})`;
  }
  return `- ${outlet}${title}`;
}

function introParagraph(context: ClaimedGraphContext): string {
  const name = context.artistName.trim();
  const genres =
    context.genres && context.genres.length > 0
      ? context.genres
          .map(g => g.trim())
          .filter(Boolean)
          .join(', ')
      : null;
  const genreClause = genres ? ` working in ${genres}` : '';
  if (nonEmpty(context.bio)) {
    return context.bio.trim();
  }
  return `**${name}** is a musician${genreClause}.`;
}

type DraftSectionHeadings = {
  readonly collabs: string;
  readonly releases: string;
  readonly press: string;
};

function extractDraftFacts(context: ClaimedGraphContext): {
  readonly name: string;
  readonly aliases: string[];
  readonly releases: readonly AuthorityReleaseFact[];
  readonly collabs: readonly AuthorityCollabFact[];
  readonly press: readonly AuthorityPressFact[];
} {
  return {
    name: context.artistName.trim(),
    aliases: uniqueNonEmpty(context.aliases ?? []),
    releases: context.releases ?? [],
    collabs: context.collabs ?? [],
    press: (context.confirmedPress ?? []).filter(p => p.confirmed !== false),
  };
}

function appendFactSections(
  lines: string[],
  facts: ReturnType<typeof extractDraftFacts>,
  headings: DraftSectionHeadings
): void {
  if (facts.collabs.length > 0) {
    lines.push(headings.collabs, '');
    for (const collab of facts.collabs) {
      lines.push(formatCollabLine(collab));
    }
    lines.push('');
  }
  if (facts.releases.length > 0) {
    lines.push(headings.releases, '');
    for (const release of facts.releases) {
      lines.push(formatReleaseLine(release));
    }
    lines.push('');
  }
  if (facts.press.length > 0) {
    lines.push(headings.press, '');
    for (const item of facts.press) {
      lines.push(formatPressLine(item));
    }
    lines.push('');
  }
}

function buildFandomBody(context: ClaimedGraphContext): string {
  const facts = extractDraftFacts(context);

  const lines: string[] = [
    `{{Infobox artist`,
    `| name = ${facts.name}`,
    facts.aliases.length > 0 ? `| aliases = ${facts.aliases.join(', ')}` : null,
    context.genres && context.genres.length > 0
      ? `| genre = ${context.genres.join(', ')}`
      : null,
    `}}`,
    ``,
    introParagraph(context),
    ``,
  ].filter((line): line is string => line !== null);

  appendFactSections(lines, facts, {
    collabs: '== Associated artists ==',
    releases: '== Discography ==',
    press: '== References ==',
  });

  lines.push(
    '<!-- Draft generated from claimed Jovie graph context. Verify every fact before publishing. -->'
  );

  return lines.join('\n');
}

function buildGeniusBody(context: ClaimedGraphContext): string {
  const facts = extractDraftFacts(context);

  const lines: string[] = [`# ${facts.name}`, ``, introParagraph(context), ``];

  if (facts.aliases.length > 0) {
    lines.push(`**Also known as:** ${facts.aliases.join(', ')}`, ``);
  }

  appendFactSections(lines, facts, {
    collabs: '## Associated artists',
    releases: '## Notable releases',
    press: '## Sources',
  });

  lines.push(
    `_Draft from Jovie claimed-profile context. Do not invent credits or chart stats._`
  );

  return lines.join('\n');
}

function buildWikipediaBody(context: ClaimedGraphContext): string {
  const facts = extractDraftFacts(context);

  const genreWikilinks =
    context.genres && context.genres.length > 0
      ? context.genres.map(g => '[[' + g.trim() + ']]').join(', ')
      : null;
  const bioSuffix = nonEmpty(context.bio) ? ' ' + context.bio.trim() : '';

  const lines: string[] = [
    `> **HUMAN GATE:** Do not publish this stub to Wikipedia without independent notability review.`,
    `> Only include claims with reliable secondary sources. Prefer confirmed press below.`,
    ``,
    `{{Infobox musical artist`,
    `| name = ${facts.name}`,
    facts.aliases.length > 0 ? `| alias = ${facts.aliases.join(', ')}` : null,
    genreWikilinks ? `| genre = ${genreWikilinks}` : null,
    `| occupation = Musician`,
    `}}`,
    ``,
    `'''${facts.name}''' is a musician.${bioSuffix}`,
    ``,
  ].filter((line): line is string => line !== null);

  appendFactSections(lines, facts, {
    collabs: '== Collaborations ==',
    releases: '== Discography ==',
    press: '== References ==',
  });
  if (facts.press.length === 0) {
    lines.push(
      '== References ==',
      '',
      '<!-- Add independent secondary sources before nominating for mainspace. -->',
      ''
    );
  }

  lines.push('{{Drafts moved from mainspace|date=}}', '');

  return lines.join('\n');
}

function checklistFor(platform: AuthorityPagePlatform): readonly string[] {
  const shared = [
    'Verify every name, release, and collab against primary sources',
    'Only keep confirmed press; remove unconfirmed candidates',
    'Match platform tone and formatting conventions',
  ];
  if (platform === 'wikipedia') {
    return [
      ...shared,
      'Confirm independent notability (multiple reliable secondary sources)',
      'Do not auto-publish — human review required',
      'Avoid promotional tone and primary-source-only stubs',
    ];
  }
  if (platform === 'fandom') {
    return [
      ...shared,
      'Link associated artists that already have Fandom pages',
      'Use the wiki infobox conventions for the target fandom',
    ];
  }
  return [
    ...shared,
    'Attach verified discography / song credits when available',
    'Keep the artist bio factual and free of hype',
  ];
}

function collectSources(context: ClaimedGraphContext): readonly string[] {
  const sources: string[] = [];
  for (const press of context.confirmedPress ?? []) {
    if (press.confirmed === false) continue;
    if (nonEmpty(press.url)) sources.push(press.url.trim());
  }
  for (const collab of context.collabs ?? []) {
    if (nonEmpty(collab.sourceUrl)) sources.push(collab.sourceUrl.trim());
  }
  if (nonEmpty(context.jovieUsername)) {
    sources.push(`jovie:profile:${context.jovieUsername.trim()}`);
  }
  return uniqueNonEmpty(sources);
}

/**
 * Build a platform-specific page draft from claimed graph context.
 * Pure: no I/O, no fabrication of missing facts.
 */
export function buildAuthorityPageDraft(
  platform: AuthorityPagePlatform,
  context: ClaimedGraphContext
): AuthorityPageDraft {
  const name = context.artistName.trim();
  if (!name) {
    throw new Error('artistName is required to draft an authority page');
  }

  const meta = AUTHORITY_PLATFORM_META[platform];
  let bodyMarkdown: string;
  if (platform === 'fandom') {
    bodyMarkdown = buildFandomBody(context);
  } else if (platform === 'genius') {
    bodyMarkdown = buildGeniusBody(context);
  } else {
    bodyMarkdown = buildWikipediaBody(context);
  }

  return {
    platform,
    platformLabel: meta.label,
    publishGate: meta.publishGate,
    createUrl: resolveAuthorityCreateUrl(platform, name),
    title: name,
    bodyMarkdown,
    checklist: checklistFor(platform),
    sources: collectSources(context),
    humanGateRequired: meta.publishGate === 'human_only',
  };
}

export function buildAuthorityPageDrafts(
  platforms: readonly AuthorityPagePlatform[],
  context: ClaimedGraphContext
): readonly AuthorityPageDraft[] {
  return platforms.map(platform => buildAuthorityPageDraft(platform, context));
}
