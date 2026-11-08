import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { createSignedInApiMock } from '@/.storybook/signed-in-session';
import { JovieAuthValuesProvider } from '@/hooks/useJovieAuth';
import { LockedPlanPrice } from './LockedPlanPrice';

type FixtureWindow = Window & {
  __jovieApiMock?: ReturnType<typeof createSignedInApiMock>;
};
const meta = {
  title: 'Features/Pricing/LockedPlanPrice',
  component: LockedPlanPrice,
  parameters: { layout: 'padded' },
  args: { price: '$12', cadence: '/mo' },
  beforeEach: ({ parameters }) => {
    const target = window as FixtureWindow;
    const previous = target.__jovieApiMock;
    const signedIn = createSignedInApiMock();
    target.__jovieApiMock = fn(request =>
      request.url.pathname === '/api/billing/price-lock'
        ? Response.json(
            { priceLock: null },
            { status: parameters.status ?? 200 }
          )
        : signedIn(request)
    );
    return () => {
      target.__jovieApiMock = previous;
    };
  },
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
