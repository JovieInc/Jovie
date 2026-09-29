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
