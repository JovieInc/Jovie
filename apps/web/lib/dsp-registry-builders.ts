import type { DspCategory, DspRegistryEntry } from './dsp-registry-types';

// ============================================================================
// Logo Helpers
// ============================================================================

export function buildMonogramLogo(name: string): string {
  const monogram = name
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return `<svg role="img" viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg"><title>${name}</title><circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2"/><text x="12" y="15" text-anchor="middle" font-size="8" font-family="system-ui, -apple-system, sans-serif" font-weight="700" fill="currentColor">${monogram}</text></svg>`;
}

// ============================================================================
// Registry Builder — eliminates repetitive object literals
// ============================================================================

interface DspInput {
  key: string;
  name: string;
  musicfetchService: string | null;
  color: string;
  domains: string[];
  searchUrlTemplate?: string | null;
  textColor?: string;
  logoSvg?: string;
  category?: DspCategory;
  showOnListenPage?: boolean;
  aliases?: string[];
}

type CompactDspOptions = Pick<DspInput, 'aliases' | 'textColor'> & {};

export type CompactDspInput = readonly [
  key: string,
  name: string,
  musicfetchService: string | null,
  color: string,
  domains: string[],
  searchUrlTemplate: string | null,
  options?: CompactDspOptions,
];

/** Build a registry entry with sensible defaults for streaming DSPs. */
export function dsp(input: DspInput): DspRegistryEntry {
  const category = input.category ?? 'streaming';
  return {
    key: input.key,
    name: input.name,
    musicfetchService: input.musicfetchService,
    color: input.color,
    textColor: input.textColor ?? 'white',
    logoSvg: input.logoSvg ?? buildMonogramLogo(input.name),
    domains: input.domains,
    searchUrlTemplate: input.searchUrlTemplate ?? null,
    category,
    showOnListenPage: input.showOnListenPage ?? category === 'streaming',
    aliases: input.aliases ?? [],
  };
}

export function compactDsp([
  key,
  name,
  musicfetchService,
  color,
  domains,
  searchUrlTemplate,
  options,
]: CompactDspInput): DspRegistryEntry {
  return dsp({
    key,
    name,
    musicfetchService,
    color,
    domains,
    searchUrlTemplate,
    ...options,
  });
}
