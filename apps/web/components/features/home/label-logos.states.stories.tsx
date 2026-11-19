import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { BlancoYNegroLogo, DiscoWaxLogo, RecPlayLogo } from './label-logos';

/** Rendered states of the text label lockups in the trust logo bar. */
const meta = {
  title: 'Marketing/Sections/LabelLogos/States',
  component: DiscoWaxLogo,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
} satisfies Meta<typeof DiscoWaxLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

const withRtlDocument: Decorator = function WithRtlDocument(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

/** Right-to-left: the three lockups in an Arabic document direction. */
export const RtlLockups: Story = {
  decorators: [withRtlDocument],
  render: function RenderRtlLockups() {
    return (
      <div className='flex items-center gap-10 p-10 text-2xl'>
        <DiscoWaxLogo />
        <BlancoYNegroLogo />
        <RecPlayLogo />
      </div>
    );
  },
};
