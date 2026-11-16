import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { APP_ROUTES } from '@/constants/routes';
import { AuthLink } from './AuthLink';

/**
 * State coverage for the auth inline link. The canonical story stays in
 * AuthLink.stories.tsx.
 */
const meta = {
  title: 'Features/Auth/AuthLink States',
  component: AuthLink,
  parameters: {
    layout: 'centered',
  },
  args: {
    href: APP_ROUTES.SIGNUP,
    children: 'Sign up',
  },
} satisfies Meta<typeof AuthLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: link text long enough to wrap in a narrow column. */
export const LongContentLabel: Story = {
  args: {
    children:
      'Create an account for your label and every artist on your roster',
  },
  decorators: [
    Story => (
      <div className='max-w-xs'>
        <Story />
      </div>
    ),
  ],
};

/** Right-to-left: the link inside an RTL document. */
export const RtlDocument: Story = {
  args: { children: 'سجّل الآن' },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
