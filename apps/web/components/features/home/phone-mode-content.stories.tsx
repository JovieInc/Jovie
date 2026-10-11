import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MODE_CONTENT, MODE_IDS } from './phone-mode-content';

function PhoneModeContentPreview() {
  return (
    <div className='flex gap-6'>
      {MODE_IDS.map(id => (
        <div
          key={id}
          className='h-49 w-40 rounded-2xl border border-subtle bg-page p-3'
        >
          {MODE_CONTENT[id]}
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: 'Features/Home/PhoneModeContent',
  component: PhoneModeContentPreview,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Shared phone-mode panels (profile/tour/pay/listen) reused by HeroProfilePreview and DeeplinksGrid on the marketing homepage.',
      },
    },
  },
} satisfies Meta<typeof PhoneModeContentPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllModes: Story = {};
