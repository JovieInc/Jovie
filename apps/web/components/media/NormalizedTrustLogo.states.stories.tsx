import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NormalizedTrustLogo } from './NormalizedTrustLogo';

const meta = {
  title: 'Media/NormalizedTrustLogo States',
  component: NormalizedTrustLogo,
  parameters: { layout: 'centered' },
  args: { id: 'umg' },
} satisfies Meta<typeof NormalizedTrustLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the contained trust logo in an Arabic document. */
export const RtlDocument: Story = {
  render: args => (
    <div dir='rtl' lang='ar' className='w-32 text-primary-token'>
      <NormalizedTrustLogo {...args} />
    </div>
  ),
};
