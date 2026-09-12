import type { ProviderKey } from '@/lib/discography/types';
import { DSP_REGISTRY } from '@/lib/dsp-registry';

export function buildDspFindUrl(
  provider: ProviderKey | string,
  query: string
): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const entry = DSP_REGISTRY.find(item => item.key === provider);
  const template = entry?.searchUrlTemplate;
  if (!template) return null;

  // Templates may carry a storefront segment (e.g. Apple Music). Default to
  // the US storefront — the search page redirects by locale from there.
  return template
    .replaceAll('{storefront}', 'us')
    .replace('{query}', encodeURIComponent(trimmed));
}
