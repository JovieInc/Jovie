import {
  detectIngestionPlatform,
  extractBeaconsHandle,
  extractInstagramHandle,
  extractLayloHandle,
  extractLinktreeHandle,
  extractTikTokHandle,
  extractTwitterHandle,
  extractYouTubeHandle,
  type IngestionPlatform,
} from '@/lib/ingestion/strategies';
import type {
  LinkGraphConflict,
  LinkGraphNode,
  LinkGraphSection,
  VisibilityAuditInput,
} from './types';

const LINK_IN_BIO = new Set<IngestionPlatform>([
  'linktree',
  'beacons',
  'laylo',
]);

const HANDLE_EXTRACTORS: Record<
  Exclude<IngestionPlatform, 'unknown'>,
  (url: string) => string | null
> = {
  linktree: extractLinktreeHandle,
  beacons: extractBeaconsHandle,
  laylo: extractLayloHandle,
  instagram: extractInstagramHandle,
  tiktok: extractTikTokHandle,
  twitter: extractTwitterHandle,
  youtube: extractYouTubeHandle,
};

function classify(url: string): {
  platform: IngestionPlatform;
  handle: string | null;
} {
  const platform = detectIngestionPlatform(url);
  if (platform === 'unknown') return { platform, handle: null };
  return { platform, handle: HANDLE_EXTRACTORS[platform](url) };
}

function pushNode(
  nodes: LinkGraphNode[],
  seen: Set<string>,
  node: LinkGraphNode
): void {
  const key = `${node.platform}|${node.url}|${node.source}|${node.via ?? ''}`;
  if (seen.has(key)) return;
  seen.add(key);
  nodes.push(node);
}

export function buildLinkGraphSection(
  input: VisibilityAuditInput
): LinkGraphSection {
  const nodes: LinkGraphNode[] = [];
  const seen = new Set<string>();

  for (const link of input.socialLinks) {
    const classified = classify(link.url);
    if (classified.platform === 'unknown') continue;
    pushNode(nodes, seen, {
      platform: classified.platform,
      url: link.url,
      handle: classified.handle,
      source: 'profile',
      via: null,
    });
  }

  for (const url of input.ingestedUrls) {
    const classified = classify(url);
    if (classified.platform === 'unknown') continue;
    pushNode(nodes, seen, {
      platform: classified.platform,
      url,
      handle: classified.handle,
      source: 'ingested',
      via: null,
    });
  }

  for (const outbound of input.linkInBioOutbound) {
    for (const url of outbound.outboundUrls) {
      const classified = classify(url);
      if (classified.platform === 'unknown') continue;
      pushNode(nodes, seen, {
        platform: classified.platform,
        url,
        handle: classified.handle,
        source: 'link_in_bio_outbound',
        via: outbound.sourceUrl,
      });
    }
  }

  const conflicts: LinkGraphConflict[] = [];
  const linkInBioPlatforms = [
    ...new Set(
      nodes
        .filter(node => LINK_IN_BIO.has(node.platform as IngestionPlatform))
        .map(node => node.platform)
    ),
  ];
  if (linkInBioPlatforms.length > 1) {
    conflicts.push({
      kind: 'multiple_link_in_bio_products',
      summary: `More than one link-in-bio product is present: ${linkInBioPlatforms.join(', ')}.`,
    });
  }

  const handlesByPlatform = new Map<string, Set<string>>();
  for (const node of nodes) {
    if (!node.handle) continue;
    const handles = handlesByPlatform.get(node.platform) ?? new Set<string>();
    handles.add(node.handle.toLowerCase());
    handlesByPlatform.set(node.platform, handles);
  }
  for (const [platform, handles] of handlesByPlatform) {
    if (handles.size > 1) {
      conflicts.push({
        kind: 'handle_mismatch',
        summary: `${platform} has more than one handle: ${[...handles].join(', ')}.`,
      });
    }
  }

  for (const node of nodes) {
    if (node.source !== 'link_in_bio_outbound' || !node.handle) continue;
    const profileHandles = nodes
      .filter(
        candidate =>
          candidate.source === 'profile' &&
          candidate.platform === node.platform &&
          candidate.handle
      )
      .map(candidate => candidate.handle?.toLowerCase());
    if (
      profileHandles.length > 0 &&
      !profileHandles.includes(node.handle.toLowerCase())
    ) {
      conflicts.push({
        kind: 'outbound_disagrees_with_profile',
        summary: `${node.platform} on ${node.via ?? 'a link-in-bio page'} is @${node.handle}, which does not match the profile handle.`,
      });
    }
  }

  return { nodes, conflicts };
}
