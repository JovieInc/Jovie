import '../../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { OnboardingOverflowMenu, OnboardingShell } from './OnboardingShell';

const meta = {
  title: 'Features/Onboarding/OnboardingShell',
  component: OnboardingShell,
  parameters: {
    layout: 'fullscreen',
    chromatic: { viewports: [390, 1024] },
    docs: {
      description: {
        component:
          'The /start entry shell before and after authentication. A verified account keeps the chat but no longer sees a Sign in menu item.',
      },
    },
  },
  args: {
    sessionLabel: 'story',
    isSignedIn: false,
  },
} satisfies Meta<typeof OnboardingShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Visitor: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Onboarding options' })
    );
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      body.getByRole('menuitem', { name: 'Sign in' })
    ).toHaveAttribute('href', '/signin');
    await userEvent.keyboard('{Escape}');
    await expect(
      canvas.getByRole('button', { name: 'Onboarding options' })
    ).toHaveFocus();
  },
};

export const SignedIn: Story = {
  args: { isSignedIn: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('link', { name: 'Sign in' })).toBeNull();
  },
};

/**
 * `/start?handle=timwhite` for an open name (Pen R6As7U): the draft profile
 * panel is present from the first paint, seeded with the claimed handle.
 */
export const ClaimHandleEntry: Story = {
  args: {
    entryProfile: { status: 'available', handle: 'timwhite' },
  },
  parameters: { chromatic: { viewports: [1440] } },
};

/** Network-free presentation fixture for keyboard, touch and overflow QA. */
export const OverflowActions: Story = {
  render: () => (
    <div className='flex h-dvh flex-col bg-surface-0 text-primary-token'>
      <div className='flex h-11 justify-end px-4'>
        <OnboardingOverflowMenu isSignedIn={false} onRestart={() => {}} />
      </div>
      <label className='px-4' htmlFor='onboarding-options-draft'>
        Chat message
      </label>
      <input
        id='onboarding-options-draft'
        aria-label='Chat message'
        defaultValue='Keep this draft'
      />
    </div>
  ),
  parameters: { chromatic: { viewports: [390, 768, 1440] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'Onboarding options' });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      body.getByRole('menuitem', { name: 'Start over' })
    ).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(body.getByRole('menuitem', { name: 'Sign in' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await expect(trigger).toHaveFocus();
    await expect(
      canvas.getByRole('textbox', { name: 'Chat message' })
    ).toHaveValue('Keep this draft');
  },
};
