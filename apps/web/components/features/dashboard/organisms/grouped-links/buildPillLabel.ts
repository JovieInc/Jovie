import type { DetectedLink } from '@/lib/utils/platform-detection';
import { compactUrlDisplay } from '../links/utils';

export function buildPillLabel(link: DetectedLink): string {
  const platform = link.platform.name || link.platform.id;
  const identity = compactUrlDisplay(
    link.platform.id,
    link.normalizedUrl
  ).trim();
  const suggested = (link.suggestedTitle || '').trim();

  const cleanSuggested = (() => {
    if (!suggested) return '';
    const onIdx = suggested.toLowerCase().indexOf(' on ');
    if (onIdx !== -1) {
      return suggested.slice(0, onIdx).trim();
    }
    return suggested;
  })();

  const pickShortest = (candidates: string[]): string => {
    const filtered = candidates
      .map(s => s.trim())
      .filter(Boolean)
      .filter(s => s.length <= 28);
    if (filtered.length === 0) return platform;
    return filtered.reduce(
      (best, next) => (next.length < best.length ? next : best),
      filtered[0]
    );
  };

  // Prefer @handles when present.
  if (identity.startsWith('@')) {
    return pickShortest([identity]);
  }

  // Website-style labels should just be the host.
  if (link.platform.id === 'website' && identity) {
    return pickShortest([identity, platform]);
  }

  // For DSPs, the URL identity is usually just the host; prefer platform name / suggested.
  if (link.platform.category === 'dsp') {
    return pickShortest([cleanSuggested, platform]);
  }

  if (!identity) {
    return pickShortest([cleanSuggested, platform]);
  }

  return pickShortest([cleanSuggested, `${platform} • ${identity}`, platform]);
}
