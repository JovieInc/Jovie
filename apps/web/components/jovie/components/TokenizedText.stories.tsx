import type { Meta, StoryObj } from '@storybook/nextjs-vite';
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
