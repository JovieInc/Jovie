import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import OnboardingCheckoutLoading from '@/app/onboarding/checkout/loading';

/**
 * /onboarding/checkout loading state: the same frame and scroll box as the
 * checkout itself, with a skeleton of its header, profile card, highlights,
 * price and button, so the page swaps in place instead of jumping from the
 * auth layout to the app shell.
 */
const meta = {
  title: 'Onboarding/Checkout',
  component: OnboardingCheckoutLoading,
  parameters: { layout: 'fullscreen', chromatic: { viewports: [390, 1440] } },
  decorators: [
    Story => (
      <div className='flex h-dvh flex-col'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OnboardingCheckoutLoading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const scroll = canvas.getByTestId('onboarding-checkout-scroll');
    await expect(scroll).toContainElement(
      canvas.getByTestId('onboarding-checkout-loading')
    );
    await expect(
      canvas.getByTestId('checkout-loading-highlights').children
    ).toHaveLength(3);
  },
};
