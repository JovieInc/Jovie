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

  return template.replace('{query}', encodeURIComponent(trimmed));
}
