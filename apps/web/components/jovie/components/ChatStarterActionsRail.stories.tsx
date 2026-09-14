import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ComponentProps, useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import {
  CHAT_STARTER_ACTION_ORDER,
  CHAT_STARTER_ACTIONS,
} from '../starter-actions';
import type { ChatActionCard } from '../types';
import { ChatStarterActionsRail } from './ChatStarterActionsRail';

const cards: ChatActionCard[] = CHAT_STARTER_ACTION_ORDER.map(id => {
  const action = CHAT_STARTER_ACTIONS[id];
  return {
    id,
    title: action.label,
    body: action.description,
    actionLabel: action.actionLabel,
    prompt: action.prompt,
  };
});

const meta = {
  title: 'Jovie/Components/ChatStarterActionsRail',
  component: ChatStarterActionsRail,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  decorators: [
    Story => (
      <div className='mx-auto w-full max-w-xl px-12 py-4'>
        <Story />
      </div>
    ),
  ],
  args: { cards, onAct: fn(), onDismiss: fn() },
} satisfies Meta<typeof ChatStarterActionsRail>;
export default meta;
type Story = StoryObj<typeof meta>;

function DismissibleRail(args: ComponentProps<typeof ChatStarterActionsRail>) {
  const [visibleCards, setVisibleCards] = useState(args.cards);
  return (
    <ChatStarterActionsRail
      {...args}
      cards={visibleCards}
      onDismiss={card => {
        args.onDismiss(card);
        setVisibleCards(current =>
          current.filter(candidate => candidate.id !== card.id)
        );
      }}
    />
  );
}

export const AllStarters: Story = {
  render: args => <DismissibleRail {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const first = cards[0]!;
    await userEvent.click(canvas.getByRole('button', { name: first.title }));
    await expect(args.onAct).toHaveBeenCalledWith(first);
    await userEvent.click(
      canvas.getByRole('button', { name: `Dismiss ${first.title}` })
    );
    await expect(args.onDismiss).toHaveBeenCalledWith(first);
    await expect(
      canvas.getByRole('group', { name: `1 of 3: ${cards[1]!.title}` })
    ).toBeVisible();
  },
};
export const SingleStarter: Story = {
  args: { cards: cards.slice(0, 1) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const name of [
      'Show Previous Starter Action',
      'Show Next Starter Action',
    ]) {
      await expect(canvas.getByLabelText(name)).toHaveAttribute('disabled');
    }
  },
};
export const Empty: Story = { args: { cards: [] } };
