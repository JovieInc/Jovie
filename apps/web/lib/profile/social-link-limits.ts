import { detectPlatform } from '@/lib/utils/platform-detection';
import type { LegacySocialLink } from '@/types/db';

export const MAX_PROFILE_LINKS = 6;
export const MAX_MODE_LINKS = 4;

type LinkGroup = 'mode' | 'social' | null;

function getLinkGroup(link: { platform: string; url: string }): LinkGroup {
  const detected = detectPlatform(link.url);
  if (detected.platform.category === 'dsp') {
    return 'mode';
  }
  if (detected.platform.category === 'social') {
    return 'social';
  }
  return null;
}

export function applyPublicProfileLinkCaps(links: LegacySocialLink[]): {
  modeLinks: LegacySocialLink[];
  socialLinks: LegacySocialLink[];
} {
  const modeLinks: LegacySocialLink[] = [];
  const socialLinks: LegacySocialLink[] = [];

  for (const link of links) {
    const group = getLinkGroup(link);
    if (group === 'mode') {
      modeLinks.push(link);
      continue;
    }
    if (group === 'social') {
      socialLinks.push(link);
    }
  }

  const cappedModeLinks = modeLinks.slice(0, MAX_MODE_LINKS);
  const availableSocialSlots = Math.max(
    0,
    MAX_PROFILE_LINKS - cappedModeLinks.length
  );

  return {
    modeLinks: cappedModeLinks,
    socialLinks: socialLinks.slice(0, availableSocialSlots),
  };
}

export function capProfileLinkInputs<
  T extends { platform: string; url: string },
>(links: T[]): T[] {
  const withIndex = links.map((link, index) => ({ link, index }));
  const mode = withIndex.filter(({ link }) => getLinkGroup(link) === 'mode');
  const social = withIndex.filter(
    ({ link }) => getLinkGroup(link) === 'social'
  );

  const modeKeep = mode.slice(0, MAX_MODE_LINKS);
  const socialSlots = Math.max(0, MAX_PROFILE_LINKS - modeKeep.length);
  const socialKeep = social.slice(0, socialSlots);

  const keep = new Set([...modeKeep, ...socialKeep].map(item => item.index));
  return links.filter((_, index) => keep.has(index));
}
