import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ACCOUNT_MENU_ROW_CLASS } from './account-menu-row';
import {
  HideEarningsMenuRow,
  hideEarningsAccessibleName,
} from './HideEarningsMenuRow';

const meta = {
  title: 'Organisms/UserButton/HideEarningsMenuRow',
  component: HideEarningsMenuRow,
  parameters: { layout: 'centered' },
  args: { hidden: false },
  decorators: [
    (Story, context) => (
      <div
        role='menu'
        className='w-60 max-w-full rounded-xl border border-subtle bg-surface-elevated p-1'
      >
        <div
          role='menuitem'
          tabIndex={0}
          aria-label={hideEarningsAccessibleName(context.args.hidden)}
          className={`flex items-center gap-2 rounded-md text-app text-secondary-token ${ACCOUNT_MENU_ROW_CLASS}`}
        >
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof HideEarningsMenuRow>;

export default meta;
type Story = StoryObj<typeof meta>;

const light = { themes: { themeOverride: 'light' } };

/** Earnings visible: switch off. */
export const Off: Story = {};

/** Earnings hidden: switch on. */
export const On: Story = { args: { hidden: true } };

/** A narrow menu: the label truncates and the switch keeps its place. */
export const LongContentNarrowMenu: Story = {
  decorators: [
    Story => (
      <div className='w-32'>
        <Story />
      </div>
    ),
  ],
};

/** Right-to-left: icon and switch swap edges. */
export const RtlOn: Story = {
  args: { hidden: true },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};

export const OffLight: Story = { ...Off, parameters: light };
export const OnLight: Story = { ...On, parameters: light };
