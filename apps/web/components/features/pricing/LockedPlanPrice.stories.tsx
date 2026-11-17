import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor, within } from 'storybook/test';
import { JovieAuthValuesProvider } from '@/hooks/useJovieAuth';
import {
  type FixtureWindow,
  installPricingStoryFixture,
} from '@/tests/fixtures/billing/pricing-story';
import { LockedPlanPrice } from './LockedPlanPrice';

const meta = {
  title: 'Features/Pricing/LockedPlanPrice',
  component: LockedPlanPrice,
  parameters: { layout: 'padded' },
  args: { price: '$12', cadence: '/mo' },
  beforeEach: ({ parameters }) => installPricingStoryFixture(parameters.status),
  decorators: [
    (Story, { parameters }) =>
      parameters.signedIn ? (
        <JovieAuthValuesProvider>
          <Story />
        </JovieAuthValuesProvider>
      ) : (
        <Story />
      ),
  ],
  play: async ({ canvasElement, args, parameters }) => {
    await expect(within(canvasElement).getByText(args.price)).toBeVisible();
    if (parameters.signedIn)
      await waitFor(() =>
        expect((window as FixtureWindow).__jovieApiMock).toHaveBeenCalledWith(
          expect.objectContaining({
            url: expect.objectContaining({
              pathname: '/api/billing/price-lock',
            }),
          })
        )
      );
  },
} satisfies Meta<typeof LockedPlanPrice>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ListPrice: Story = {};
export const EmptyNoLock: Story = { parameters: { signedIn: true } };
export const ErrorUnavailable: Story = {
  parameters: { signedIn: true, status: 503 },
};
export const PermissionDenied: Story = {
  parameters: { signedIn: true, status: 403 },
};
export const LongContent: Story = { args: { price: '$123,456,789.00' } };
export const RtlPrice: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
