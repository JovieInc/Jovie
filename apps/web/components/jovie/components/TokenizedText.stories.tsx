import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { TokenizedText } from './TokenizedText';

const meta = {
  title: 'Jovie/TokenizedText',
  component: TokenizedText,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 bg-base p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    content: 'How is @release:rel_1[Midnight Drive] doing this week?',
  },
} satisfies Meta<typeof TokenizedText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithEntityMention: Story = {};

export const WithSkillInvocation: Story = {
  args: {
    content: '/skill:generateAlbumArt for my next single',
  },
};

export const PlainText: Story = {
  args: {
    content: 'Just a plain message with no tokens.',
  },
};

export const OnLightTone: Story = {
  args: {
    tone: 'onLight',
  },
};

/** Empty: an empty message string renders nothing at all. */
export const EmptyContent: Story = {
  args: {
    content: '',
  },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector('.whitespace-pre-wrap')
    ).toBeNull();
  },
};

/**
 * Partial: a message whose entity cannot be resolved here and whose skill is
 * no longer in the registry. The chip hides the stored label behind
 * "Unavailable reference" and the skill falls back to its raw id.
 */
export const PartialUnresolvedTokens: Story = {
  args: {
    content:
      'Can you check @release:rel_gone[Old Title] and run /skill:retiredSkill again?',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Unavailable reference')).toBeVisible();
    await expect(canvas.getByTestId('transcript-skill-chip')).toHaveTextContent(
      'retiredSkill'
    );
  },
};

/** Long content: a multi-line message keeps its newlines and wraps. */
export const LongContentMessage: Story = {
  args: {
    content:
      'Here is everything for the launch:\n\n1. Pin @release:rel_1[Midnight Drive] to the top of my profile\n2. Draft a welcome post that thanks everyone who pre-saved the deluxe anniversary edition before the weekend\n3. /skill:generateAlbumArt for the remix single that follows it',
  },
};

/** Right-to-left: an Arabic message with an inline mention in an RTL bubble. */
export const RtlArabicMessage: Story = {
  args: {
    content: 'كيف حال @release:rel_1[ليلة في القاهرة] هذا الأسبوع؟',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='w-80 bg-base p-3'>
        <Story />
      </div>
    ),
  ],
};
