import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { CHAT_STARTER_ACTIONS } from '../starter-actions';
import { ChatActionCard } from './ChatActionCard';

const planRelease = CHAT_STARTER_ACTIONS['plan-release'];
const generateAlbumArt = CHAT_STARTER_ACTIONS['generate-album-art'];

const meta = {
  title: 'Jovie/Components/ChatActionCard',
  component: ChatActionCard,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
} satisfies Meta<typeof ChatActionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PlanRelease: Story = {
  args: {
    title: planRelease.label,
    icon: planRelease.icon,
    body: planRelease.description,
    actionLabel: planRelease.actionLabel,
    onAct: fn(),
    onDismiss: fn(),
  },
};

export const GenerateAlbumArt: Story = {
  args: {
    title: generateAlbumArt.label,
    icon: generateAlbumArt.icon,
    body: generateAlbumArt.description,
    actionLabel: generateAlbumArt.actionLabel,
    onAct: fn(),
    onDismiss: fn(),
  },
};
