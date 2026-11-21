import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import {
  CHAT_STARTER_ACTIONS,
  type ChatStarterActionId,
} from '../starter-actions';
import { ChatActionCard } from './ChatActionCard';

const meta = {
  title: 'Jovie/Components/ChatActionCard',
  component: ChatActionCard,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  decorators: [
    Story => (
      <div className='w-full max-w-md'>
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Review imported links',
    body: 'Jovie found three profile links that need confirmation before they appear publicly.',
    actionLabel: 'Review links',
    onAct: fn(),
    onDismiss: fn(),
  },
} satisfies Meta<typeof ChatActionCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ReviewAlert: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: args.actionLabel })
    );
    await expect(args.onAct).toHaveBeenCalledOnce();
    await userEvent.click(
      canvas.getByRole('button', { name: `Dismiss ${args.title}` })
    );
    await expect(args.onDismiss).toHaveBeenCalledOnce();
  },
};

function starterArgs(id: ChatStarterActionId) {
  const action = CHAT_STARTER_ACTIONS[id];
  return {
    title: action.label,
    body: action.description,
    actionLabel: action.actionLabel,
    icon: action.icon,
  };
}

export const PlanRelease: Story = { args: starterArgs('plan-release') };
export const GenerateAlbumArt: Story = {
  args: starterArgs('generate-album-art'),
};
export const BuildProfile: Story = {
  args: starterArgs('build-artist-profile'),
};
export const ReviewSignals: Story = { args: starterArgs('review-signals') };

/** Partial: the card with a short body and no extra aria label. */
export const PartialShortBody: Story = {
  args: { title: 'Connect Spotify', body: 'Link your artist account.' },
};

/** Long content: a long title and body wrap inside the card. */
export const LongContentWrapped: Story = {
  args: {
    title:
      'Review the imported profile links that need confirmation before they go public',
    body: 'Jovie found three profile links across streaming, social and ticketing services. Confirm each one so your public profile only shows accounts you own, and so fans always land on the right page.',
    ariaLabel: 'three imported profile links',
  },
};

/** Rtl: right-to-left copy mirrors the icon, copy and dismiss layout. */
export const RtlCopy: Story = {
  args: {
    title: 'مراجعة الروابط المستوردة',
    body: 'وجد Jovie ثلاثة روابط تحتاج إلى تأكيد قبل ظهورها للجمهور.',
    actionLabel: 'مراجعة الروابط',
  },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' className='w-full max-w-md'>
          <Story />
        </div>
      );
    },
  ],
};
