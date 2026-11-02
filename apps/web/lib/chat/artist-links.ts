/**
 * Pure helpers for the artist's profile links and connected accounts in chat.
 * No DB or network: shared by the route context, the system prompt and the
 * helpfulness eval fixtures.
 */

export interface ProfileLink {
  readonly platform: string;
  readonly url: string;
}

export interface ArtistLinksContext {
  /** Active links on the public profile, one per platform+url. */
  readonly links: readonly ProfileLink[];
  /** OAuth-connected providers for this profile (e.g. 'youtube'). */
  readonly connectedAccounts: readonly string[];
}

export const EMPTY_ARTIST_LINKS_CONTEXT: ArtistLinksContext = {
  links: [],
  connectedAccounts: [],
};

/** Cap so a link farm cannot blow the prompt budget. */
export const MAX_PROMPT_LINKS = 25;

function canonicalUrl(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(?:www\.|m\.)?/i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/** Dedupes by platform+url (case, scheme and www-insensitive), keeps order. */
export function normalizeProfileLinks(
  rows: readonly { platform: string | null; url: string | null }[]
): ProfileLink[] {
  const seen = new Set<string>();
  const out: ProfileLink[] = [];
  for (const row of rows) {
    const platform = row.platform?.trim().toLowerCase();
    const url = row.url?.trim();
    if (!platform || !url) continue;
    const key = `${platform} ${canonicalUrl(url)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ platform, url });
  }
  return out;
}

/** First link for a platform, preferring an @handle URL for YouTube. */
export function findProfileLink(
  links: readonly ProfileLink[],
  platform: string
): ProfileLink | null {
  const matches = links.filter(link => link.platform === platform);
  if (matches.length === 0) return null;
  return matches.find(link => /\/@[^/]+/.test(link.url)) ?? matches[0] ?? null;
}

const CONNECTABLE_ACCOUNTS: readonly { id: string; label: string }[] = [
  { id: 'youtube', label: 'YouTube' },
  { id: 'spotify', label: 'Spotify' },
];

/**
 * Prompt section: the exact links and connections, so the model never asks for
 * a URL the profile already has or sends the artist to a settings page.
 */
export function buildProfileLinksPromptSection(
  context: ArtistLinksContext | undefined
): string {
  const links = context?.links ?? [];
  const connected = new Set(context?.connectedAccounts ?? []);
  const linkLines =
    links.length > 0
      ? links
          .slice(0, MAX_PROMPT_LINKS)
          .map(link => `- ${link.platform}: ${link.url}`)
          .join('\n')
      : '- none yet';
  const connectionLines = CONNECTABLE_ACCOUNTS.map(
    account =>
      `- ${account.label}: ${connected.has(account.id) ? 'connected (OAuth)' : 'not connected (public data only)'}`
  ).join('\n');
  return `## Profile Links (live on their Jovie profile)
${linkLines}

## Connected Accounts
${connectionLines}
These are facts you already have. Never ask the artist for a link listed above, and never say you cannot see which platforms they use. A listed link is enough to work from public data; a connection only adds write access and private analytics.`;
}
