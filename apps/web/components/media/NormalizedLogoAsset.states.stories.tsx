import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NormalizedLogoAsset } from './NormalizedLogoAsset';
import { getTrustLogoAsset } from './trustLogoAssets';

const umg = getTrustLogoAsset('umg');
const Logo = umg.component;

const meta = {
  title: 'Media/NormalizedLogoAsset States',
  component: NormalizedLogoAsset,
  parameters: { layout: 'centered' },
  args: {
    asset: umg.normalization,
    children: <Logo aria-label={umg.label} />,
    fit: 'contain',
  },
} satisfies Meta<typeof NormalizedLogoAsset>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the contained logo keeps its offsets in an Arabic document. */
export const RtlDocument: Story = {
  render: args => (
    <div dir='rtl' lang='ar' className='w-32 text-primary-token'>
      <NormalizedLogoAsset {...args} />
    </div>
  ),
};
