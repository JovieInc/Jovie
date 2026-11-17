import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthFormContainer } from './AuthFormContainer';

/**
 * State coverage for the auth form wrapper. The canonical page stories stay
 * in AuthFormContainer.stories.tsx; these change only the slotted content or
 * the document direction.
 */
const meta: Meta<typeof AuthFormContainer> = {
  title: 'Auth/AuthFormContainer States',
  component: AuthFormContainer,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof AuthFormContainer>;

/** Long content: a long paragraph wraps inside the full-width container. */
export const LongContentBody: Story = {
  args: {
    className: 'max-w-sm',
    children: (
      <p className='text-app text-secondary-token'>
        We sent a six digit code to the address you entered. It can take a
        minute or two to arrive, so check your spam or promotions folder before
        asking for a new one, and keep this tab open while you wait.
      </p>
    ),
  },
};

/** Right-to-left: the container inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    className: 'max-w-sm',
    children: (
      <p className='text-app text-secondary-token'>
        أرسلنا رمزًا من ستة أرقام إلى بريدك الإلكتروني.
      </p>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
