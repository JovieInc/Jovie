import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Check } from 'lucide-react';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { AuthLinkPreviewCard } from './AuthLinkPreviewCard';

/**
 * State coverage for the auth link preview card. The canonical story stays in
 * AuthLinkPreviewCard.stories.tsx.
 */
const meta = {
  title: 'Features/Auth/AuthLinkPreviewCard States',
  component: AuthLinkPreviewCard,
  parameters: {
    layout: 'centered',
  },
  args: {
    label: 'Your profile is live at',
    hrefText: TIM_WHITE_PROFILE.publicProfileDisplay,
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AuthLinkPreviewCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no handle chosen yet, so the address line is blank. */
export const EmptyHandle: Story = {
  args: { hrefText: '' },
};

/** Partial: the address with a trailing status mark. */
export const PartialWithTrailing: Story = {
  args: {
    trailing: <Check aria-hidden='true' className='h-4 w-4 text-success' />,
  },
};

/** Long content: a long handle breaks inside the card. */
export const LongContentHandle: Story = {
  args: {
    hrefText: 'jov.ie/the-extremely-long-artist-handle-that-keeps-going-on',
  },
};

/** Right-to-left: the card inside an RTL document. */
export const RtlDocument: Story = {
  args: { label: 'ملفك متاح الآن على' },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
