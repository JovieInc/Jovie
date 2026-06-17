import type {
  DesignTasteBenchmarkReference,
  DesignTasteSurfaceBenchmark,
  DesignTasteSurfaceCategory,
} from '@/lib/agent-os/design-taste-jury/types';
import type { CanonicalSurfaceId } from '@/lib/canonical-surfaces';

const GALLERY_REFS: readonly DesignTasteBenchmarkReference[] = [
  {
    id: 'mobbin',
    label: 'Mobbin',
    url: 'https://mobbin.com',
    notes: 'Pattern gallery for product UI references.',
  },
  {
    id: '21st-dev',
    label: '21st.dev',
    url: 'https://21st.dev',
    notes: 'Component gallery for modern product UI.',
  },
  {
    id: 'godly',
    label: 'Godly',
    url: 'https://godly.website',
    notes: 'Marketing and landing-page references.',
  },
  {
    id: 'refero',
    label: 'Refero',
    url: 'https://refero.design',
    notes: 'Cross-surface design reference library.',
  },
];

const BENCHMARK_BY_CATEGORY: Record<
  DesignTasteSurfaceCategory,
  Omit<DesignTasteSurfaceBenchmark, 'surfaceId'>
> = {
  marketing: {
    category: 'marketing',
    primary: {
      id: 'apple-com',
      label: 'Apple.com',
      url: 'https://www.apple.com',
      notes: 'Premium marketing composition, restraint, and proof hierarchy.',
    },
    secondary: [
      {
        id: 'frame-io',
        label: 'Frame.io',
        url: 'https://frame.io',
        notes: 'Confident product marketing with cinematic proof.',
      },
    ],
    galleryRefs: GALLERY_REFS,
  },
  'public-profile': {
    category: 'public-profile',
    primary: {
      id: 'apple-com',
      label: 'Apple.com',
      url: 'https://www.apple.com',
      notes: 'Device-mockup marketing shots and premium profile framing.',
    },
    secondary: [
      {
        id: 'frame-io',
        label: 'Frame.io',
        url: 'https://frame.io',
        notes: 'High-contrast hero proof without noisy chrome.',
      },
    ],
    galleryRefs: GALLERY_REFS,
  },
  'product-ui': {
    category: 'product-ui',
    primary: {
      id: 'linear',
      label: 'Linear',
      url: 'https://linear.app',
      notes: 'Compact, quiet product UI baseline.',
    },
    secondary: [
      {
        id: 'superhuman',
        label: 'Superhuman',
        url: 'https://superhuman.com',
        notes: 'High-density productivity UI with clear hierarchy.',
      },
      {
        id: 'raycast',
        label: 'Raycast',
        url: 'https://raycast.com',
        notes:
          'Depth, opacity fades, and layered surfaces — dial back consumer tone.',
      },
    ],
    galleryRefs: GALLERY_REFS,
  },
  metrics: {
    category: 'metrics',
    primary: {
      id: 'apple-health',
      label: 'Apple Health',
      url: 'https://www.apple.com/ios/health/',
      notes: 'LYB metrics rhythm, card hierarchy, and calm data density.',
    },
    secondary: [
      {
        id: 'linear',
        label: 'Linear',
        url: 'https://linear.app',
        notes: 'Operational dashboard density without visual noise.',
      },
    ],
    galleryRefs: GALLERY_REFS,
  },
};

const SURFACE_CATEGORY_BY_ID: Partial<
  Record<CanonicalSurfaceId, DesignTasteSurfaceCategory>
> = {
  homepage: 'marketing',
  'public-profile': 'public-profile',
  'release-landing': 'marketing',
  'dashboard-releases': 'product-ui',
  'dashboard-audience': 'product-ui',
  'dashboard-insights': 'metrics',
  'dashboard-earnings': 'metrics',
  'settings-artist-profile': 'product-ui',
  'settings-links': 'product-ui',
};

const VISUAL_QA_SURFACE_CATEGORY: Record<string, DesignTasteSurfaceCategory> = {
  'shell-desktop-idle': 'product-ui',
  'list-releases-default': 'product-ui',
  'drawer-release-open': 'product-ui',
  'settings-root-hierarchy': 'product-ui',
};

export function resolveSurfaceCategory(
  surfaceId: string
): DesignTasteSurfaceCategory {
  const canonicalCategory =
    SURFACE_CATEGORY_BY_ID[surfaceId as CanonicalSurfaceId];
  if (canonicalCategory) {
    return canonicalCategory;
  }

  return VISUAL_QA_SURFACE_CATEGORY[surfaceId] ?? 'product-ui';
}

export function getSurfaceBenchmark(
  surfaceId: string
): DesignTasteSurfaceBenchmark {
  const category = resolveSurfaceCategory(surfaceId);
  const template = BENCHMARK_BY_CATEGORY[category];

  return {
    surfaceId,
    ...template,
  };
}

export function listBenchmarkReferenceIds(surfaceId: string): string[] {
  const benchmark = getSurfaceBenchmark(surfaceId);
  return [
    benchmark.primary.id,
    ...benchmark.secondary.map(reference => reference.id),
    ...benchmark.galleryRefs.map(reference => reference.id),
  ];
}
