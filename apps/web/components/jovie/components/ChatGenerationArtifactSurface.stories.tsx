import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatGenerationArtifactSurface } from './ChatGenerationArtifactSurface';

const meta = {
  title: 'Jovie/ChatGenerationArtifactSurface',
  component: ChatGenerationArtifactSurface,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-96 bg-base p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Generating cover art',
    children: <div className='h-32 w-full rounded-lg bg-surface-1' />,
  },
} satisfies Meta<typeof ChatGenerationArtifactSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithSubtitle: Story = {
  args: {
    subtitle: 'This usually takes about 20 seconds.',
  },
};

/** Title only: the subtitle is optional and the header collapses to one line. */
export const PartialTitleOnly: Story = {
  args: {
    title: 'Merch Options',
    subtitle: null,
  },
};

export const LongContent: Story = {
  args: {
    title:
      'Generating cover art for The Extended Midnight Drive Sessions (Deluxe Anniversary Edition)',
    subtitle:
      'Three styles are rendering at full resolution. Large batches can take up to a minute; you can keep chatting while they finish.',
  },
};

export const RtlContent: Story = {
  args: {
    title: 'جارٍ إنشاء غلاف الألبوم',
    subtitle: 'يستغرق هذا عادةً حوالي 20 ثانية.',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
