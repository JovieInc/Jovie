import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CAPABILITY_EVIDENCE_FIXTURE } from '@/lib/admin/capability-evidence-fixtures';
import { CapabilityEvidenceMatrix } from './CapabilityEvidenceMatrix';

const record = CAPABILITY_EVIDENCE_FIXTURE;

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
