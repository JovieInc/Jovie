import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LOGO_PERMISSION_FIXTURES } from '@/data/product-truth/logo-permissions.fixture';
import { HomepageLabelLogoMark } from './HomepageLabelLogoMark';

const meta = {
  title: 'Features/Home/HomepageLabelLogoMark',
  component: HomepageLabelLogoMark,
  parameters: {
    layout: 'centered',
  },
  args: {
    partner: 'awal',
    placement: { page: '/' },
    fixturePermissions: LOGO_PERMISSION_FIXTURES,
  },
} satisfies Meta<typeof HomepageLabelLogoMark>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Awal: Story = {
  args: {
    partner: 'awal',
  },
};

export const Umg: Story = {
  args: {
    partner: 'umg',
  },
};
