import type { CanonicalSurfaceId } from '@/lib/canonical-surfaces';
import type { DesignTasteSurfaceBenchmark } from './types';

const GALLERY_REFERENCES = [
  {
    id: 'mobbin',
    label: 'Mobbin',
    url: 'https://mobbin.com/',
    rationale: 'Pattern gallery for high-signal product UI references.',
  },
  {
    id: '21st-dev',
    label: '21st.dev',
    url: 'https://21st.dev/',
    rationale: 'Component gallery for modern product UI density and polish.',
  },
  {
    id: 'godly',
    label: 'Godly',
    url: 'https://godly.website/',
    rationale: 'Marketing and landing-page craft references.',
  },
  {
    id: 'refero',
    label: 'Refero',
    url: 'https://refero.design/',
    rationale: 'Cross-surface design reference library.',
  },
] as const;

const PRODUCT_UI_REFERENCES = [
  {
    id: 'linear',
    label: 'Linear',
    url: 'https://linear.app/',
    rationale: 'Compact product UI baseline for shell rhythm and hierarchy.',
  },
  {
    id: 'superhuman',
    label: 'Superhuman',
    url: 'https://superhuman.com/',
    rationale: 'High-clarity information density without consumer gloss.',
  },
  {
    id: 'raycast',
    label: 'Raycast',
    url: 'https://www.raycast.com/',
    rationale:
      'Depth, opacity fades, and layered surfaces — dial back consumer tone.',
  },
] as const;

const MARKETING_REFERENCES = [
  {
    id: 'apple-com',
    label: 'Apple.com',
    url: 'https://www.apple.com/',
    rationale: 'Premium marketing restraint and hero composition.',
  },
  {
    id: 'frame-io',
    label: 'Frame.io',
    url: 'https://frame.io/',
    rationale: 'Creator-product marketing with proof-first storytelling.',
  },
] as const;

const METRICS_REFERENCES = [
  {
    id: 'apple-health',
    label: 'Apple Health',
    url: 'https://www.apple.com/ios/health/',
    rationale: 'LYB metrics clarity and calm data hierarchy.',
  },
] as const;

function defineBenchmark(
  surfaceId: CanonicalSurfaceId,
  surfaceLabel: string,
  category: DesignTasteSurfaceBenchmark['category'],
  primaryReferences: DesignTasteSurfaceBenchmark['primaryReferences']
): DesignTasteSurfaceBenchmark {
  return {
    surfaceId,
    surfaceLabel,
    category,
    primaryReferences,
    galleryReferences: GALLERY_REFERENCES,
  };
}

export const DESIGN_TASTE_SURFACE_BENCHMARKS: Record<
  CanonicalSurfaceId,
  DesignTasteSurfaceBenchmark
> = {
  homepage: defineBenchmark(
    'homepage',
    'Homepage',
    'marketing',
    MARKETING_REFERENCES
  ),
  'public-profile': defineBenchmark(
    'public-profile',
    'Public Profile',
    'marketing',
    MARKETING_REFERENCES
  ),
  'release-landing': defineBenchmark(
    'release-landing',
    'Release Landing',
    'marketing',
    MARKETING_REFERENCES
  ),
  'dashboard-releases': defineBenchmark(
    'dashboard-releases',
    'Dashboard Releases',
    'product-ui',
    PRODUCT_UI_REFERENCES
  ),
  'dashboard-audience': defineBenchmark(
    'dashboard-audience',
    'Dashboard Audience',
    'product-ui',
    PRODUCT_UI_REFERENCES
  ),
  'dashboard-insights': defineBenchmark(
    'dashboard-insights',
    'Dashboard Insights',
    'metrics',
    METRICS_REFERENCES
  ),
  'dashboard-earnings': defineBenchmark(
    'dashboard-earnings',
    'Dashboard Earnings',
    'metrics',
    METRICS_REFERENCES
  ),
  'settings-artist-profile': defineBenchmark(
    'settings-artist-profile',
    'Settings Artist Profile',
    'product-ui',
    PRODUCT_UI_REFERENCES
  ),
  'settings-links': defineBenchmark(
    'settings-links',
    'Settings Links',
    'product-ui',
    PRODUCT_UI_REFERENCES
  ),
};

export function getDesignTasteBenchmarkForSurface(
  surfaceId: string
): DesignTasteSurfaceBenchmark | null {
  if (surfaceId in DESIGN_TASTE_SURFACE_BENCHMARKS) {
    return DESIGN_TASTE_SURFACE_BENCHMARKS[surfaceId as CanonicalSurfaceId];
  }

  return null;
}

export function listDesignTasteBenchmarkReferences(
  surfaceId: string
): readonly DesignTasteSurfaceBenchmark['primaryReferences'][number][] {
  const benchmark = getDesignTasteBenchmarkForSurface(surfaceId);
  if (!benchmark) {
    return [];
  }

  return [...benchmark.primaryReferences, ...benchmark.galleryReferences];
}
