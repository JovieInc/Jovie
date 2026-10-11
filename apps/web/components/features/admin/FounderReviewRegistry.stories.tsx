import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import type { FounderReviewItem, FounderReviewMedia } from '@/lib/admin/types';
import type {
  OvieCertificationInventory,
  OvieCertificationRow,
} from '@/lib/ovie/certifications/types';
import { queryKeys } from '@/lib/queries/keys';
import { FounderReviewRegistry } from './FounderReviewRegistry';

// Built inline: the shared fixture hashes with node:crypto, which cannot load
// in the browser. The digest only has to be stable, not real.
function storyItem(
  overrides: Partial<FounderReviewItem> &
    Pick<FounderReviewItem, 'id' | 'title' | 'readiness'>
): FounderReviewItem {
  const certificationPacket = {
    contract: 'jovie.certification/v1' as const,
    subject: {
      id: overrides.id,
      kind: 'feature' as const,
      title: overrides.title,
    },
    source: null,
    canonicalReferences: [],
    invariantEvaluation: [],
    testsCoverage: [],
    visualProof: [],
    requiredVariants: [],
    itemMedia: [],
  };
  return {
    registry: 'feature',
    eyebrow: 'Smart Links',
    scope: 'capability',
    description: 'A source-backed capability with dedicated evidence.',
    status: 'Shipped',
    access: 'Free+',
    source: 'docs/FEATURE_REGISTRY.md',
    gate: 'None',
    readinessReason: 'The review packet is complete.',
    media: [],
    certificationPacket,
    decisionEvidenceDigest: `sha256:story-${overrides.id}`,
    certificationState:
      overrides.readiness === 'ready' ? 'review_ready' : 'working',
    ...overrides,
  };
}

const evidence: readonly FounderReviewMedia[] = [
  {
    kind: 'image',
    src: '/product-screenshots/artist-spec-geo-insights-desktop.png',
    alt: 'Geo insights desktop capture',
    label: 'Dedicated product capture',
    dedicated: true,
  },
  {
    kind: 'video',
    src: '/demo/jovie-demo.mp4',
    poster: '/demo/jovie-demo-poster.jpg',
    alt: 'Product walkthrough',
    label: 'Walkthrough recording',
    dedicated: true,
  },
  {
    kind: 'image',
    src: '/product-screenshots/artist-spec-creator-menu-mobile.png',
    alt: 'Creator menu mobile capture',
    label: 'Mobile capture',
    dedicated: false,
  },
];

const items: readonly FounderReviewItem[] = [
  storyItem({
    id: 'feature.smart-link-editing',
    title: 'Smart link editing and customization',
    readiness: 'ready',
    description:
      'Artists edit smart link titles, artwork, destinations and UTM presets from the release row without leaving the table.',
    media: evidence,
  }),
  storyItem({
    id: 'feature.ab-testing',
    title: 'A/B testing',
    readiness: 'collecting',
    eyebrow: 'Growth (Coming Soon)',
    status: 'Planned',
    description:
      'Split traffic between two profile variants and report the winner once the sample is significant.',
  }),
  storyItem({
    id: 'feature.spotify-oauth',
    title: 'Spotify OAuth sign-in method',
    readiness: 'collecting',
    eyebrow: 'Integrations',
    status: 'Shipped (internal v1 default-on)',
    description:
      'A sign-in method that links the Spotify artist account during onboarding and backfills the catalog.',
  }),
  storyItem({
    id: 'feature.pac-variant-slots',
    title:
      'Public profile PAC variant slots with a deliberately long registry title',
    readiness: 'collecting',
    eyebrow: 'Public Profile',
    status: 'In rollout',
    description:
      'First-last CTA slot variants for the public profile, gated by the rollout flag and measured against the control.',
  }),
];

function RightPanelSlot() {
  const panel = useRightPanel();
  return (
    <aside className='w-95 shrink-0 border-l border-(--app-shell-border)'>
      {panel}
    </aside>
  );
}

function RegistryStoryFrame({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const { headerActions } = useHeaderActions();
  return (
    <div className='flex h-screen flex-col bg-(--app-shell-content-surface)'>
      <header className='flex h-(--app-shell-header-height) shrink-0 items-center gap-2 border-b border-(--app-shell-border) px-(--app-shell-header-padding-x)'>
        <h1 className='min-w-0 flex-1 truncate text-xs font-semibold text-primary-token'>
          Feature Registry
        </h1>
        {headerActions}
      </header>
      <div className='flex min-h-0 flex-1'>
        <main className='min-w-0 flex-1 overflow-auto p-3'>{children}</main>
        <RightPanelSlot />
      </div>
    </div>
  );
}

/** Minimal server projection so the ready story item is decidable. */
function storyRow(item: FounderReviewItem): OvieCertificationRow {
  const reviewReady = item.readiness === 'ready';
  return {
    id: `feature_registry:${item.id}`,
    domain: 'feature_registry',
    surface: 'Feature Capability',
    subject: { id: item.id, kind: 'feature', title: item.title },
    state: reviewReady ? 'review_ready' : 'working',
    tiers: {},
    evidence: [],
    blockers: [],
    staleFounderLock: false,
    updatedAt: '2026-10-02T00:00:00.000Z',
    links: [],
    history: [],
    decision: {
      available: reviewReady,
      reason: reviewReady ? null : 'Evidence is incomplete: 1 blocker.',
      evidenceDigest: item.decisionEvidenceDigest,
      currentDecision: null,
    },
    source: null,
  } as unknown as OvieCertificationRow;
}

function RegistryStory({ children }: { readonly children: React.ReactNode }) {
  const client = useMemo(() => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const key = queryKeys.admin.certifications();
    queryClient.setQueryDefaults(key, { enabled: false, staleTime: Infinity });
    queryClient.setQueryData(key, {
      rows: items.map(storyRow),
    } as unknown as OvieCertificationInventory);
    return queryClient;
  }, []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const meta = {
  title: 'Features/Admin/FounderReviewRegistry',
  component: FounderReviewRegistry,
  parameters: {
    layout: 'fullscreen',
    jovie: { uncoveredProps: ['disabled'] },
  },
  decorators: [
    Story => (
      <RegistryStory>
        <HeaderActionsProvider>
          <RightPanelProvider>
            <RegistryStoryFrame>
              <Story />
            </RegistryStoryFrame>
          </RightPanelProvider>
        </HeaderActionsProvider>
      </RegistryStory>
    ),
  ],
  args: {
    kind: 'feature',
    items,
  },
} satisfies Meta<typeof FounderReviewRegistry>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FeatureRegistry: Story = {};

export const FeatureRegistryLight: Story = {
  parameters: { themes: { themeOverride: 'light' } },
};
