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

function uniqueNonEmpty(values: readonly (string | null | undefined)[]): string[] {
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
      ? context.genres.map(g => g.trim()).filter(Boolean).join(', ')
      : null;
  const genreClause = genres ? ` working in ${genres}` : '';
  if (nonEmpty(context.bio)) {
    return context.bio.trim();
  }
  return `**${name}** is a musician${genreClause}.`;
}

function buildFandomBody(context: ClaimedGraphContext): string {
  const name = context.artistName.trim();
  const aliases = uniqueNonEmpty(context.aliases ?? []);
  const releases = context.releases ?? [];
  const collabs = context.collabs ?? [];
  const press = (context.confirmedPress ?? []).filter(p => p.confirmed !== false);

  const lines: string[] = [
    `{{Infobox artist`,
    `| name = ${name}`,
    aliases.length > 0 ? `| aliases = ${aliases.join(', ')}` : null,
    context.genres && context.genres.length > 0
      ? `| genre = ${context.genres.join(', ')}`
      : null,
    `}}`,
    ``,
    introParagraph(context),
    ``,
  ].filter((line): line is string => line !== null);

  if (collabs.length > 0) {
    lines.push('== Associated artists ==', '');
    for (const collab of collabs) {
      lines.push(formatCollabLine(collab));
    }
    lines.push('');
  }

  if (releases.length > 0) {
    lines.push('== Discography ==', '');
    for (const release of releases) {
      lines.push(formatReleaseLine(release));
    }
    lines.push('');
  }

  if (press.length > 0) {
    lines.push('== References ==', '');
    for (const item of press) {
      lines.push(formatPressLine(item));
    }
    lines.push('');
  }

  lines.push(
    '<!-- Draft generated from claimed Jovie graph context. Verify every fact before publishing. -->'
  );

  return lines.join('\n');
}

function buildGeniusBody(context: ClaimedGraphContext): string {
  const name = context.artistName.trim();
  const aliases = uniqueNonEmpty(context.aliases ?? []);
  const releases = context.releases ?? [];
  const collabs = context.collabs ?? [];
  const press = (context.confirmedPress ?? []).filter(p => p.confirmed !== false);

  const lines: string[] = [
    `# ${name}`,
    ``,
    introParagraph(context),
    ``,
  ];

  if (aliases.length > 0) {
    lines.push(`**Also known as:** ${aliases.join(', ')}`, ``);
  }

  if (collabs.length > 0) {
    lines.push(`## Associated artists`, ``);
    for (const collab of collabs) {
      lines.push(formatCollabLine(collab));
    }
    lines.push(``);
  }

  if (releases.length > 0) {
    lines.push(`## Notable releases`, ``);
    for (const release of releases) {
      lines.push(formatReleaseLine(release));
    }
    lines.push(``);
  }

  if (press.length > 0) {
    lines.push(`## Sources`, ``);
    for (const item of press) {
      lines.push(formatPressLine(item));
    }
    lines.push(``);
  }

  lines.push(
    `_Draft from Jovie claimed-profile context. Do not invent credits or chart stats._`
  );

  return lines.join('\n');
}

function buildWikipediaBody(context: ClaimedGraphContext): string {
  const name = context.artistName.trim();
  const aliases = uniqueNonEmpty(context.aliases ?? []);
  const releases = context.releases ?? [];
  const collabs = context.collabs ?? [];
  const press = (context.confirmedPress ?? []).filter(p => p.confirmed !== false);

  const lines: string[] = [
    `> **HUMAN GATE:** Do not publish this stub to Wikipedia without independent notability review.`,
    `> Only include claims with reliable secondary sources. Prefer confirmed press below.`,
    ``,
    `{{Infobox musical artist`,
    `| name = ${name}`,
    aliases.length > 0 ? `| alias = ${aliases.join(', ')}` : null,
    context.genres && context.genres.length > 0
      ? `| genre = ${context.genres.map(g => `[[${g.trim()}]]`).join(', ')}`
      : null,
    `| occupation = Musician`,
    `}}`,
    ``,
    `'''${name}''' is a musician.${nonEmpty(context.bio) ? ` ${context.bio.trim()}` : ''}`,
    ``,
  ].filter((line): line is string => line !== null);

  if (collabs.length > 0) {
    lines.push('== Collaborations ==', '');
    for (const collab of collabs) {
      lines.push(formatCollabLine(collab));
    }
    lines.push('');
  }

  if (releases.length > 0) {
    lines.push('== Discography ==', '');
    for (const release of releases) {
      lines.push(formatReleaseLine(release));
    }
    lines.push('');
  }

  if (press.length > 0) {
    lines.push('== References ==', '');
    for (const item of press) {
      lines.push(formatPressLine(item));
    }
    lines.push('');
  } else {
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
  const bodyMarkdown =
    platform === 'fandom'
      ? buildFandomBody(context)
      : platform === 'genius'
        ? buildGeniusBody(context)
        : buildWikipediaBody(context);

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
