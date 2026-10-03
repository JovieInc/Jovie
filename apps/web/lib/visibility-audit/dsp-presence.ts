import { DSP_REGISTRY, normalizePlatformKey } from '@/lib/dsp-registry';
import type {
  DspPresenceRow,
  DspPresenceSection,
  VisibilityAuditInput,
  VisibilityAuditUrlLink,
} from './types';

const YOUTUBE_HOSTS = new Set(['youtube.com', 'm.youtube.com', 'youtu.be']);

/**
 * Map a URL onto one registry key. YouTube hosts are shared by YouTube,
 * YouTube Music, and Shorts, so those are decided before the generic domain
 * scan.
 */
export function dspKeyForUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'music.youtube.com') return 'youtube_music';
  if (YOUTUBE_HOSTS.has(host)) {
    return url.pathname.startsWith('/shorts/') ? 'youtube_shorts' : 'youtube';
  }

  let best: { key: string; length: number } | null = null;
  for (const entry of DSP_REGISTRY) {
    if (
      entry.key === 'youtube' ||
      entry.key === 'youtube_music' ||
      entry.key === 'youtube_shorts'
    ) {
      continue;
    }
    for (const domain of entry.domains) {
      const normalized = domain.toLowerCase().replace(/^www\./, '');
      if (!normalized) continue;
      if (host === normalized || host.endsWith(`.${normalized}`)) {
        if (!best || normalized.length > best.length) {
          best = { key: entry.key, length: normalized.length };
        }
      }
    }
  }
  return best?.key ?? null;
}

function dspKeyForLink(link: VisibilityAuditUrlLink): string | null {
  if (link.platform) {
    const key = normalizePlatformKey(link.platform);
    if (key) return key;
  }
  return dspKeyForUrl(link.url);
}

export function buildDspPresenceSection(
  input: VisibilityAuditInput
): DspPresenceSection {
  const urlsByKey = new Map<string, string[]>();
  const links: VisibilityAuditUrlLink[] = [
    ...input.dspLinks,
    ...input.socialLinks,
    ...input.identityLinks.map(link => ({
      platform: link.platform,
      url: link.url,
    })),
  ];
  if (input.spotifyUrl) {
    links.push({ platform: 'spotify', url: input.spotifyUrl });
  }
  if (input.appleMusicUrl) {
    links.push({ platform: 'apple_music', url: input.appleMusicUrl });
  }
  if (input.youtubeUrl) {
    links.push({ platform: 'youtube', url: input.youtubeUrl });
  }

  for (const link of links) {
    const key = dspKeyForLink(link);
    if (!key || !link.url) continue;
    const existing = urlsByKey.get(key) ?? [];
    if (!existing.includes(link.url)) existing.push(link.url);
    urlsByKey.set(key, existing);
  }

  const platforms: DspPresenceRow[] = DSP_REGISTRY.map(entry => {
    const urls = urlsByKey.get(entry.key) ?? [];
    return {
      key: entry.key,
      name: entry.name,
      category: entry.category,
      present: urls.length > 0,
      urls,
    };
  });
  const presentCount = platforms.filter(row => row.present).length;
  return {
    registryCount: platforms.length,
    presentCount,
    missingCount: platforms.length - presentCount,
    platforms,
  };
}
