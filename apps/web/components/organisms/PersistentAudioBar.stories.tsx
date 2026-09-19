import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PersistentAudioBar } from './PersistentAudioBar';

const meta = {
  title: 'Organisms/PersistentAudioBar',
  component: PersistentAudioBar,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PersistentAudioBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};
