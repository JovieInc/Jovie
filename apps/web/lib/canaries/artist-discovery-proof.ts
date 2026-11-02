/** Public representations only; HTTP 200 alone is never item or identity proof. */
import { z } from 'zod';
import { publicWorkUrl } from '@/lib/agent/public-work-links';

export const discoveryItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.url(),
  releaseDate: z.string().nullable().optional(),
});
export const discoveryApiSchema = z.object({
  artist: z.object({
    username: z.string(),
    name: z.string(),
    profileUrl: z.url(),
    isClaimed: z.boolean(),
    isVerified: z.boolean(),
    links: z.array(z.object({ url: z.string() })),
  }),
  releases: z.array(discoveryItemSchema).max(200),
  merch: z.array(discoveryItemSchema).max(6),
});
export type DiscoveryItem = z.infer<typeof discoveryItemSchema>;

export function publicJsonLd(document: Document): Record<string, unknown>[] {
  return [
    ...document.querySelectorAll('script[type="application/ld+json"]'),
  ].flatMap(script => {
    try {
      const parsed: unknown = JSON.parse(script.textContent ?? '');
      const values = Array.isArray(parsed) ? parsed : [parsed];
      return values
        .flatMap(value => {
          if (!value || typeof value !== 'object') return [];
          const node = value as Record<string, unknown>;
          return Array.isArray(node['@graph']) ? node['@graph'] : [node];
        })
        .filter(
          (value): value is Record<string, unknown> =>
            value !== null && typeof value === 'object'
        );
    } catch {
      return [];
    }
  });
}

export function inspectPublicItem(
  document: Document,
  item: DiscoveryItem,
  kind: 'release' | 'merch'
) {
  const nodes = publicJsonLd(document);
  const entity = nodes.find(
    node =>
      node.url === item.url &&
      [node['@type']]
        .flat()
        .some(type =>
          (kind === 'merch'
            ? ['Product']
            : ['MusicAlbum', 'MusicRecording', 'MusicVideoObject']
          ).includes(String(type))
        )
  );
  const actions = z
    .array(
      z.object({
        '@type': z.literal('ListenAction'),
        name: z.string().trim().min(1),
        target: z.object({ urlTemplate: z.string() }),
      })
    )
    .safeParse(entity?.potentialAction);
  const destinations = actions.success
    ? actions.data.map(action => ({
        label: action.name,
        url: action.target.urlTemplate,
      }))
    : [];
  const canonical = document
    .querySelector('link[rel="canonical"]')
    ?.getAttribute('href');
  const metadataMatches =
    entity?.name === item.title &&
    (kind === 'merch'
      ? entity?.sku === item.id
      : !item.releaseDate || entity?.datePublished === item.releaseDate);
  const serviceUrls = Array.isArray(entity?.sameAs) ? entity.sameAs : [];
  const safeDestinations =
    destinations.length > 0 &&
    destinations.every(destination => publicWorkUrl(destination.url)) &&
    serviceUrls.every(url =>
      destinations.some(destination => destination.url === url)
    );
  return {
    passed:
      !!entity &&
      metadataMatches &&
      (kind === 'merch' || (canonical === item.url && safeDestinations)),
    canonical: canonical ?? null,
    name: entity?.name ?? null,
    datePublished: entity?.datePublished ?? null,
    destinations,
  };
}

/** Compare complete guide fields so a longer destination or status cannot pass. */
function guideFieldMatches(guide: string, label: string, value: string) {
  const lines = guide.split('\n');
  return lines.some((line, index) => {
    const field = /^- \*\*([^*]+)\*\*: (.*)$/.exec(line);
    if (field?.[1] !== label) return false;
    // Titles can contain newlines; compare their entire serialized value.
    const fieldValue = [field[2], ...lines.slice(index + 1)].join('\n');
    return fieldValue === value || fieldValue.startsWith(`${value}\n`);
  });
}

export function inspectDiscoveryGuide(input: {
  document: Document;
  guide: string;
  api: z.infer<typeof discoveryApiSchema>;
  profileUrl: string;
  artistName: string;
}) {
  const { document, guide, api, profileUrl, artistName } = input;
  const identity =
    api.artist.profileUrl === profileUrl &&
    api.artist.name === artistName &&
    guide.startsWith(`# ${artistName}\n`) &&
    guideFieldMatches(guide, 'Canonical URL', profileUrl) &&
    guideFieldMatches(
      guide,
      'Claim status',
      api.artist.isClaimed ? 'Claimed' : 'Unclaimed'
    ) &&
    guideFieldMatches(
      guide,
      'Jovie verification',
      api.artist.isVerified ? 'Verified' : 'Not verified'
    ) &&
    publicJsonLd(document).some(
      node =>
        node.name === artistName &&
        (node.url === profileUrl || node['@id'] === `${profileUrl}#musicgroup`)
    );
  const guideUrls = guide.split('\n').flatMap(line => {
    const value =
      /^- \*\*[^*]+\*\*: (https?:\/\/\S+)$/.exec(line)?.[1] ??
      /^- \[.+\]\(<(.+)>\)$/.exec(line)?.[1];
    const url = publicWorkUrl(value);
    return url ? [url.href] : [];
  });
  const missingLinks = api.artist.links.flatMap(link => {
    const url = publicWorkUrl(link.url);
    return !url || guideUrls.filter(value => value === url.href).length !== 1
      ? [link.url]
      : [];
  });
  // Only the guide's latest-release section is an item list. Audience collection
  // guidance elsewhere in the document is intentional and remains distinct.
  const latest = guide.split('## Latest Release\n')[1]?.split('\n## ')[0];
  const latestMatches = !latest
    ? api.releases.length === 0
    : api.releases.some(
        item =>
          guideFieldMatches(latest, 'Link', item.url) &&
          guideFieldMatches(latest, 'Title', item.title) &&
          (!item.releaseDate ||
            guideFieldMatches(latest, 'Released', item.releaseDate))
      );
  return { identity, missingLinks, latestMatches };
}
