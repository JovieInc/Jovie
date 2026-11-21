import { providerAlbumId } from '@/lib/discography/release-duplicate-report';

export type PromotionContext = {
  phase: 'released' | 'upcoming' | 'unknown';
  destination: string | null;
};

export function promotionContext(
  work: { status: string; releaseDate: Date | null },
  links: readonly { provider: string; id: string | null; url: string }[],
  now: Date
): PromotionContext {
  if (!work.releaseDate) return { phase: 'unknown', destination: null };
  if (work.releaseDate > now) return { phase: 'upcoming', destination: null };
  if (work.status !== 'released')
    return { phase: 'unknown', destination: null };
  const verified = links.find(link => {
    if (!link.id || providerAlbumId(link.provider, link.url) !== link.id)
      return false;
    const url = new URL(link.url);
    return (
      url.protocol === 'https:' && !url.username && !url.password && !url.port
    );
  });
  return { phase: 'released', destination: verified?.url ?? null };
}

export function composePromotion(
  title: string,
  angle: string,
  context: PromotionContext
) {
  const headline =
    context.phase === 'upcoming'
      ? `A note ahead of “${title}”`
      : `A note about “${title}”`;
  return [headline, angle.trim(), context.destination]
    .filter(Boolean)
    .join('\n\n');
}
