import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { CapabilityEvidenceRecord } from '@/lib/admin/capability-evidence-model';
import { CapabilityEvidenceMatrix } from './CapabilityEvidenceMatrix';

// Synthetic display fixtures; these are not deployment or usage receipts.
const record: CapabilityEvidenceRecord = {
  capabilityId: 'public-profile-pages',
  subjectId: 'feature.profile.public-profile-pages',
  title: 'Public profile pages',
  goldenPath: 'Fan opens a public profile and taps a link.',
  certification: {
    state: 'review_ready',
    readiness: 'ready',
    decisionEvidenceDigest: 'a'.repeat(40),
    sourcePath: 'docs/FEATURE_REGISTRY.md',
  },
  deployment: {
    commitSha: 'b'.repeat(40),
    version: '1.2.3',
    environment: 'production',
    deploymentId: 'story-deployment',
  },
  rollout: { gate: null, configuredPercent: null },
  clientSha: null,
  exposure: {
    measured: true,
    count: 128,
    latestAt: '2026-10-02',
    stale: false,
    windowDays: 7,
    population: 'public claimed profiles owned by non-internal accounts',
    error: null,
  },
  outcome: {
    measured: true,
    count: 41,
    latestAt: '2026-10-02',
    stale: false,
    windowDays: 7,
    population: 'public claimed profiles; bot-filtered link taps',
    error: null,
  },
  generatedAt: '2026-10-02T00:00:00.000Z',
};

const meta = {
  title: 'Admin/CapabilityEvidenceMatrix',
  component: CapabilityEvidenceMatrix,
  parameters: { layout: 'padded' },
  args: { record },
} satisfies Meta<typeof CapabilityEvidenceMatrix>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {};
export const Unknown: Story = {
  args: { record: { ...record, certification: null } },
};
export const ObservationFailure: Story = {
  args: {
    record: {
      ...record,
      exposure: {
        ...record.exposure,
        measured: false,
        count: null,
        error: 'Read unavailable',
      },
    },
  },
};
export const MergedOnly: Story = {
  args: {
    record: {
      ...record,
      deployment: {
        commitSha: null,
        version: null,
        environment: null,
        deploymentId: null,
      },
    },
  },
};
export const DeployedUnobserved: Story = {
  args: {
    record: {
      ...record,
      exposure: {
        ...record.exposure,
        measured: false,
        count: null,
        latestAt: null,
      },
    },
  },
};
export const ConfiguredUnobserved: Story = {
  args: {
    record: {
      ...record,
      rollout: { gate: 'profile-capability', configuredPercent: 100 },
      exposure: {
        ...record.exposure,
        measured: false,
        count: null,
        latestAt: null,
      },
    },
  },
};
export const StaleObservation: Story = {
  args: {
    record: { ...record, exposure: { ...record.exposure, stale: true } },
  },
};
export const StaleClient: Story = {
  args: { record: { ...record, clientSha: 'c'.repeat(40) } },
};
export const PartialRollout: Story = {
  args: {
    record: {
      ...record,
      rollout: { gate: 'profile-capability', configuredPercent: 25 },
    },
  },
};
