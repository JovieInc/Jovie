import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { OvieHomeBriefing } from '@/lib/ovie/home-briefing';
import { OvieEditorialBriefing } from './OvieEditorialBriefing';

const briefing: OvieHomeBriefing = {
  greeting: 'Good morning, Tim.',
  updatedLabel: 'Updated Sep 28, 8:00 AM PDT',
  signal: {
    id: 'activation.first-user',
    title: 'The first real user completed onboarding',
    summary: 'Activation has moved from theory to observed behavior.',
    currentValue: '1 activated user',
    delta: '+1 today',
    target: 'Learn what made the path work',
    sourceLabel: 'Founder Funnel',
    nextAction: 'Review the session and preserve the shortest successful path.',
    removalEvent: 'The activation lesson is recorded and applied.',
    summerCanAct: true,
  },
  actions: [
    {
      id: 'activation.first-user:next',
      label: 'Start The Next Step',
      prompt: 'Review the first activation with me.',
    },
    {
      id: 'activation.first-user:evidence',
      label: 'Show The Evidence',
      prompt: 'Show the evidence for the first activation.',
    },
  ],
};

const meta = {
  title: 'Jovie/Components/OvieEditorialBriefing',
  component: OvieEditorialBriefing,
  parameters: { layout: 'fullscreen', backgrounds: { default: 'dark' } },
  decorators: [
    Story => (
      <div className='flex min-h-screen w-full flex-col'>
        <Story />
      </div>
    ),
  ],
  args: {
    briefing,
    onSelectAction: fn(),
  },
} satisfies Meta<typeof OvieEditorialBriefing>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', {
        name: 'The first real user completed onboarding',
      })
    ).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole('button', { name: 'Show The Evidence' })
    );
    await expect(args.onSelectAction).toHaveBeenCalledWith(
      'Show the evidence for the first activation.'
    );
  },
};

export const WithoutDeltaOrTarget: Story = {
  args: {
    briefing: {
      ...briefing,
      signal: {
        ...briefing.signal,
        delta: null,
        target: null,
      },
    },
  },
};
