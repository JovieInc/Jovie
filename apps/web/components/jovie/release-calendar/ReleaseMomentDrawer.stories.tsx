import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DemoMoment } from '@/lib/release-planning/demo-plan';
import { ReleaseMomentDrawer } from './ReleaseMomentDrawer';

const SINGLE_MOMENT: DemoMoment = {
  slug: 'midnight-drive-single',
  title: 'Midnight Drive — Single Release',
  momentType: 'single',
  friday: '2026-11-13',
  trackSlug: 'midnight-drive',
};

const meta = {
  title: 'Jovie/ReleaseMomentDrawer',
  component: ReleaseMomentDrawer,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onClose: () => {},
  },
} satisfies Meta<typeof ReleaseMomentDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: {
    moment: SINGLE_MOMENT,
  },
};

export const MerchDrop: Story = {
  args: {
    moment: {
      ...SINGLE_MOMENT,
      slug: 'midnight-drive-merch',
      title: 'Midnight Drive — Merch Drop',
      momentType: 'merch_drop',
    },
  },
};

export const Closed: Story = {
  args: {
    moment: null,
  },
};
