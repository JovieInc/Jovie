import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthUnavailableCard } from './AuthUnavailableCard';

/**
 * Rendered states of the auth-unavailable card. The card itself is the
 * error surface for a sign-in setup that is not ready.
 */
const meta = {
  title: 'Auth/AuthUnavailableCard/States',
  component: AuthUnavailableCard,
  parameters: {
    layout: 'padded',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/signin' },
    },
  },
} satisfies Meta<typeof AuthUnavailableCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: sign-in is unavailable and the only way out is the homepage. */
export const ErrorSignInUnavailable: Story = {
  args: { mode: 'signin' },
};

/** Partial: sign-up mode adds the legal line and offers a session reset. */
export const PartialSignUpWithReset: Story = {
  args: { mode: 'signup', showResetAction: true },
};

function RtlDecorator(Story: () => React.JSX.Element) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/** Rtl: the centered card and its legal links mirror without overflow. */
export const RtlSignUpUnavailable: Story = {
  args: { mode: 'signup' },
  decorators: [RtlDecorator],
};
