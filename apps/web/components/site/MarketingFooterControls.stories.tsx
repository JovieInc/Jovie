import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingFooterControls } from './MarketingFooterControls';

const meta = {
  title: 'Site/MarketingFooterControls',
  component: MarketingFooterControls,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Cursor-style footer preferences: persisted System/Light/Dark theme choices and the currently supported English locale.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MarketingFooterControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EnglishOnly: Story = {};

/**
 * Right-to-left: the preferences row inside an RTL document. The theme
 * segments and the locale label swap sides with the writing direction.
 */
export const RtlDocument: Story = {
  render: () => (
    <div dir='rtl' className='marketing-footer-premium p-6'>
      <MarketingFooterControls />
    </div>
  ),
};
