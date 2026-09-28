import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import type { FounderReviewItem } from '@/lib/admin/types';
import {
  buildCertificationDecisionDigest,
  JOVIE_CERTIFICATION_CONTRACT,
} from '@/lib/agent-os/certification';
import { FounderReviewRegistry } from './FounderReviewRegistry';

function storyItem(
  overrides: Partial<FounderReviewItem> &
    Pick<FounderReviewItem, 'id' | 'title' | 'readiness'>
): FounderReviewItem {
  const certificationPacket = {
    contract: JOVIE_CERTIFICATION_CONTRACT,
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
    evidence: ['Canonical feature registry', 'Dedicated product capture'],
    media: [],
    certificationPacket,
    decisionEvidenceDigest:
      buildCertificationDecisionDigest(certificationPacket),
    certificationState:
      overrides.readiness === 'ready' ? 'review_ready' : 'working',
    ...overrides,
  };
}

const items: readonly FounderReviewItem[] = [
  storyItem({
    id: 'feature.ready',
    title: 'Ready feature',
    readiness: 'ready',
  }),
  storyItem({
    id: 'feature.collecting',
    title: 'Collecting feature',
    readiness: 'collecting',
    readinessReason: 'A dedicated end-to-end capture is still required.',
    media: [],
  }),
];

const meta = {
  title: 'Features/Admin/FounderReviewRegistry',
  component: FounderReviewRegistry,
  parameters: {
    layout: 'fullscreen',
    jovie: { uncoveredProps: ['disabled'] },
  },
  decorators: [
    Story => (
      <RightPanelProvider>
        <Story />
      </RightPanelProvider>
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

export const DesignSystemRegistry: Story = {
  args: {
    kind: 'design-system',
  },
};
