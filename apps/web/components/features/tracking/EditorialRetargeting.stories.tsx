import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { EditorialRetargetingEntry } from '@/lib/retargeting/editorial';
import { EditorialRetargeting } from './EditorialRetargeting';

const ENTRY: EditorialRetargetingEntry = {
  canonicalPath: '/blog/one-profile-for-your-work',
  derivativeId: 'company-identity-customer-explanation',
  contentRevision: '2026-09-28',
};

const meta = {
  title: 'Tracking/EditorialRetargeting',
  component: EditorialRetargeting,
  parameters: {
    docs: {
      description: {
        component:
          'Renderless consented retargeting adapter for approved public editorial routes. It only mounts the Meta pixel on an exact canonical-path match with marketing consent and no sensitive query parameters; every other surface stays tracker-free. The story certifies the mounted, suppressed state; consent and route gating are covered by component tests.',
      },
    },
  },
} satisfies Meta<typeof EditorialRetargeting>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mounted: Story = {
  args: {
    entries: [ENTRY],
    pixelId: 'storybook-pixel',
  },
  render: args => (
    <div className='min-h-40 bg-base p-8 text-primary-token'>
      <p className='text-sm'>
        The retargeting adapter mounts with no visible chrome. On a registered
        editorial route with consent it loads the Meta pixel and emits a single
        bounded custom event; everywhere else it stays silent.
      </p>
      <EditorialRetargeting {...args} />
    </div>
  ),
};
