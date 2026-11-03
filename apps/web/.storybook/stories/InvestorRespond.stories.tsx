import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { RespondScreen } from '@/app/investor-portal/_components/RespondScreen';

const meta = {
  title: 'Investor Portal/Respond',
  component: RespondScreen,
  parameters: { layout: 'fullscreen' },
  args: {
    token: 'a'.repeat(43),
    action: 'interested',
    title: 'Confirm your interest',
    description:
      'Confirm below so we know it was really you. This tells the team you would like to connect.',
    confirmLabel: 'Confirm interest',
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { level: 1, name: args.title })
    ).toBeVisible();

    if (!args.confirmLabel) {
      await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
      await expect(canvasElement.querySelector('form')).toBeNull();
      return;
    }

    const button = canvas.getByRole('button', { name: args.confirmLabel });
    const form = button.closest('form');
    await expect(form).toHaveAttribute('method', 'post');
    await expect(form).toHaveAttribute('action', '/api/investors/respond');
    if (!form) throw new Error('Confirmation must submit a form.');
    const fields = new FormData(form);
    await expect(fields.get('token')).toBe(args.token);
    await expect(fields.get('action')).toBe(args.action);

    // Exercise native submission without sending the fixture token to a server.
    const submitted = fn((event: Event) => event.preventDefault());
    form.addEventListener('submit', submitted);
    button.focus();
    await expect(button).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(submitted).toHaveBeenCalledOnce();
    await userEvent.click(button);
    await expect(submitted).toHaveBeenCalledTimes(2);
    form.removeEventListener('submit', submitted);
  },
} satisfies Meta<typeof RespondScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConfirmInterest: Story = {};

export const ConfirmPass: Story = {
  args: {
    title: 'Confirm you are passing',
    description:
      'Confirm below so we know it was really you. This tells the team you are not interested right now.',
    confirmLabel: 'Confirm pass',
    action: 'pass',
  },
};

export const InterestConfirmed: Story = {
  args: {
    title: 'Thanks for your interest!',
    description: "We'll be in touch soon to schedule a call.",
    confirmLabel: undefined,
  },
};

export const PassConfirmed: Story = {
  args: {
    title: 'Thanks for letting us know',
    description: 'No hard feelings. We appreciate you taking the time.',
    confirmLabel: undefined,
    action: 'pass',
  },
};
