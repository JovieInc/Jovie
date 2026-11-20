import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { WaitlistSuccessView } from './WaitlistSuccessView';

const meta = {
  title: 'Marketing/Routes/Waitlist',
  component: WaitlistSuccessView,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Exact authenticated confirmation body for web-214-waitlist. The /waitlist server route keeps auth-state resolution and redirects; only a persisted waitlist state renders this no-prop pending receipt. This is not the public recipe.waitlist composition, which remains a stub until an approved public body exists.',
      },
    },
    backgrounds: { default: 'dark' },
    // The receipt body hardcodes white-on-noir text tokens.
    themes: { themeOverride: 'dark' },
    viewport: { defaultViewport: 'desktop' },
    pen: {
      registryId: 'web-214-waitlist',
      route: '/waitlist',
      source: 'apps/web/components/features/waitlist/WaitlistSuccessView.tsx',
      sourceExport: 'WaitlistSuccessView',
      sourceSha: '00895196e53b823bb0311193b4af29f67b8849c1',
      storyExport: 'Web214AuthenticatedPending',
      fixture: 'authenticated WAITLIST_PENDING',
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof WaitlistSuccessView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web214AuthenticatedPending: Story = {
  name: 'web-214 /waitlist — authenticated pending',
  render: () => <WaitlistSuccessView />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: "You're on the waitlist." })
    ).toBeVisible();
    await expect(
      canvas.queryByTestId('waitlist-start-pro-checkout')
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByText(/skip the waitlist/i)
    ).not.toBeInTheDocument();
    const resume = canvas.getByRole('link', { name: 'Resume At Start' });
    await expect(resume).toHaveAttribute('href', '/start');
    resume.focus();
    await expect(resume).toHaveFocus();
    const activated = fn();
    resume.addEventListener(
      'click',
      event => {
        // Verify keyboard activation without leaving the isolated receipt.
        event.preventDefault();
        activated();
      },
      { once: true }
    );
    await userEvent.keyboard('{Enter}');
    await expect(activated).toHaveBeenCalledOnce();
  },
};

export const MobilePending: Story = {
  ...Web214AuthenticatedPending,
  name: 'Pending receipt / mobile',
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

/**
 * Offline: the intake request never reached the server (WaitlistIntakeChat
 * maps a rejected fetch to save_failed). The receipt says nothing was saved,
 * keeps the answers on the device and offers Try Again.
 */
export const OfflineSaveFailed: Story = {
  name: 'Request not saved / offline',
  args: { outcome: 'save_failed', onRetry: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: "We Couldn't Save This" })
    ).toBeVisible();
    await expect(canvas.queryByText("You're on the list")).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Try Again' }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};
