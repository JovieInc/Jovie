import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import {
  CHAT_STARTER_ACTION_ORDER,
  CHAT_STARTER_ACTIONS,
} from '../starter-actions';
import { ChatStarterActionsRail } from './ChatStarterActionsRail';

const cards = CHAT_STARTER_ACTION_ORDER.map(id => {
  const action = CHAT_STARTER_ACTIONS[id];
  return {
    id: action.id,
    title: action.label,
    body: action.description,
    actionLabel: action.actionLabel,
    prompt: action.prompt,
  };
});

const meta = {
  title: 'Jovie/Components/ChatStarterActionsRail',
  component: ChatStarterActionsRail,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
    jovie: {
      // `disabled` appears only as Tailwind control-state variants in the
      // pagination buttons, not as a component prop to exercise.
      uncoveredProps: ['disabled'],
    },
  },
} satisfies Meta<typeof ChatStarterActionsRail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStarters: Story = {
  args: {
    cards,
    onAct: fn(),
    onDismiss: fn(),
  },
};

export const SingleStarter: Story = {
  args: {
    cards: cards.slice(0, 1),
    onAct: fn(),
    onDismiss: fn(),
  },
};
