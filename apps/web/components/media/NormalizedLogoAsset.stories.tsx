import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NormalizedLogoAsset } from './NormalizedLogoAsset';
import { getTrustLogoAsset } from './trustLogoAssets';

const umg = getTrustLogoAsset('umg');
const Logo = umg.component;
const meta = {
  title: 'Media/NormalizedLogoAsset',
  component: NormalizedLogoAsset,
  parameters: { layout: 'centered' },
  args: {
    asset: umg.normalization,
    children: <Logo aria-label={umg.label} />,
    fit: 'natural',
  },
} satisfies Meta<typeof NormalizedLogoAsset>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Natural: Story = {};

export const Contained: Story = {
  args: { fit: 'contain' },
  render: args => (
    <div className='w-32 text-primary-token'>
      <NormalizedLogoAsset {...args} />
    </div>
  ),
};

export const Narrow: Story = {
  args: { fit: 'contain' },
  render: args => (
    <div className='w-16 text-primary-token'>
      <NormalizedLogoAsset {...args} />
    </div>
  ),
};
