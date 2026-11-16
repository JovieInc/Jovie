import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SuggestionCard } from './SuggestionCard';

const canvas: Decorator = function HomeCanvas(Story) {
  return (
    <div className='w-full max-w-2xl'>
      <Story />
    </div>
  );
};

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar' className='w-full max-w-2xl'>
      <Story />
    </div>
  );
};

/** State coverage for the home suggestion card; Default lives in SuggestionCard.stories.tsx. */
const meta = {
  title: 'Shell/SuggestionCard States',
  component: SuggestionCard,
  parameters: { layout: 'centered' },
  decorators: [canvas],
  args: {
    title: 'Detroit listeners up 340% — book a show',
    body: 'A promoter at the Magic Stick reached out yesterday.',
    actionLabel: 'Review pitch',
    onAct: fn(),
    onDismiss: fn(),
  },
} satisfies Meta<typeof SuggestionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no dismiss and no act handler, so only a disabled action shows. */
export const PartialNoHandlers: Story = {
  args: { onAct: undefined, onDismiss: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: /Review pitch/ })
    ).toBeDisabled();
    await expect(canvas.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  },
};

/** Long content: a title past the two-line clamp and a long body. */
export const LongContentClampedTitle: Story = {
  args: {
    title:
      'Detroit listeners are up 340% this month across Spotify, Apple Music and YouTube, so this is the moment to book a headline show',
    body: 'A promoter at the Magic Stick reached out yesterday. I have a draft pitch ready that ties your Spotify growth in Detroit to a Friday date, with a support slot for a local artist and a pre-save link for the next single.',
    actionLabel: 'Review the draft pitch',
  },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', {
        name: /Review the draft pitch/,
      })
    );
    await expect(args.onAct).toHaveBeenCalledOnce();
  },
};

/** Right-to-left: an Arabic suggestion in an RTL canvas. */
export const RtlArabic: Story = {
  args: {
    title: 'المستمعون في ديترويت ارتفعوا ٣٤٠٪',
    body: 'تواصل منظم حفلات أمس. لدي عرض جاهز للمراجعة.',
    actionLabel: 'مراجعة العرض',
    dismissLabel: 'تجاهل',
  },
  decorators: [rtl],
};
