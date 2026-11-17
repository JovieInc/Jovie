import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { APP_ROUTES } from '@/constants/routes';
import { AuthBackButton } from './AuthBackButton';

/**
 * State coverage for the auth back control. The canonical stories stay in
 * AuthBackButton.stories.tsx.
 */
const meta = {
  title: 'Features/Auth/AuthBackButton States',
  component: AuthBackButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    inline: true,
  },
} satisfies Meta<typeof AuthBackButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no href, so the control renders as a button with a handler. */
export const PartialButtonOnly: Story = {
  args: { onClick: fn() },
};

/** Right-to-left: the link form inside an RTL document. */
export const RtlDocument: Story = {
  args: { href: APP_ROUTES.HOME, ariaLabel: 'رجوع' },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
