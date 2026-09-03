import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { OnboardingExperienceShell } from './OnboardingExperienceShell';

function StageCopy({ label }: { readonly label: string }) {
  return (
    <div className='space-y-3'>
      <h1 className='text-2xl font-semibold tracking-tight text-primary-token'>
        {label}
      </h1>
      <p className='text-sm text-secondary-token'>
        Onboarding stage framing fixture. Shared radius and padding stay owned
        by one recipe; variant fills remain distinct.
      </p>
    </div>
  );
}

function FixtureSidebar() {
  return (
    <nav aria-label='Onboarding Steps'>
      <ul className='space-y-1.5'>
        <li className='text-sm font-semibold text-primary-token'>Handle</li>
        <li className='text-sm text-secondary-token'>Spotify</li>
      </ul>
    </nav>
  );
}

function FocusCopy() {
  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-semibold tracking-tight text-primary-token'>
        Continue setup
      </h1>
      <Button type='button'>Continue</Button>
    </div>
  );
}

const OVERFLOW_ROWS = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
] as const;

function OverflowCopy() {
  return (
    <div className='space-y-4' data-testid='onboarding-stage-overflow-copy'>
      {OVERFLOW_ROWS.map(row => (
        <p key={row} className='text-sm text-secondary-token'>
          Overflow {row} row. The stage keeps its shared radius and padding
          while content grows past the reserved height.
        </p>
      ))}
    </div>
  );
}

const meta = {
  title: 'Onboarding/ExperienceShell',
  component: OnboardingExperienceShell,
  parameters: {
    layout: 'fullscreen',
    chromatic: { viewports: [390, 1024] },
    docs: {
      description: {
        component:
          'Deterministic onboarding stage variants. Storybook preview freezes motion and prefers-reduced-motion, so every story is the static reduced-motion state. Desktop and mobile Chromatic viewports cover the stacked sidebar layout.',
      },
    },
  },
  args: {
    mode: 'standalone',
    sidebar: <FixtureSidebar />,
    sidebarTitle: 'Jovie Setup',
    children: <StageCopy label='Claim your handle' />,
  },
} satisfies Meta<typeof OnboardingExperienceShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Framed: Story = {
  args: {
    stageVariant: 'framed',
    visualVariant: 'default',
  },
};

export const Flat: Story = {
  args: {
    stageVariant: 'flat',
    visualVariant: 'default',
  },
};

export const V1: Story = {
  args: {
    stageVariant: 'flat',
    visualVariant: 'v1',
  },
};

export const Light: Story = {
  args: {
    stageVariant: 'framed',
    visualVariant: 'default',
  },
  parameters: {
    backgrounds: { default: 'light' },
  },
};

export const Focus: Story = {
  args: {
    stageVariant: 'framed',
    visualVariant: 'default',
    children: <FocusCopy />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: 'Continue' });
    await userEvent.click(button);
    button.focus();
    await expect(button).toHaveFocus();
  },
};

export const Overflow: Story = {
  args: {
    stageVariant: 'framed',
    visualVariant: 'default',
    children: <OverflowCopy />,
  },
};

export const ReducedMotion: Story = {
  args: {
    stageVariant: 'framed',
    visualVariant: 'default',
  },
  parameters: {
    docs: {
      description: {
        story:
          'prefers-reduced-motion is forced by the Storybook preview fixture. This story is the static framed stage with animations paused.',
      },
    },
  },
};
