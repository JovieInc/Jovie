import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AccountMenuShortcut } from './AccountMenuShortcut';

const meta = {
  title: 'Organisms/UserButton/AccountMenuShortcut',
  component: AccountMenuShortcut,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='flex h-8 w-60 items-center justify-between rounded-md bg-surface-elevated px-(--space-2-5) text-app text-secondary-token'>
        <span>Menu Row</span>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AccountMenuShortcut>;

export default meta;
type Story = StoryObj<typeof meta>;

const light = { themes: { themeOverride: 'light' } };

/** Letter chord: Settings. */
export const LetterChord: Story = { args: { keys: ['G', 'S'] } };

/** Modifier chord: Sign Out. */
export const ModifierChord: Story = { args: { keys: ['⌥', '⇧', 'Q'] } };

/** Command chord: Keyboard Shortcuts. */
export const CommandChord: Story = { args: { keys: ['⌘', '/'] } };

/** No keys: the hint renders nothing visible and the row keeps its height. */
export const EmptyKeys: Story = { args: { keys: [] } };

/** The longest chord in the product still fits the row. */
export const LongContentChord: Story = {
  args: { keys: ['⌃', '⌥', '⇧', '⌘', 'K'] },
};

/** Right-to-left: the hint moves to the row's start edge, keys keep order. */
export const RtlChord: Story = {
  args: { keys: ['⌥', '⇧', 'Q'] },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};

export const LetterChordLight: Story = { ...LetterChord, parameters: light };
export const ModifierChordLight: Story = {
  ...ModifierChord,
  parameters: light,
};
