import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PaySelector } from './PaySelector';

/**
 * PaySelector is the product composition for tip amount selection.
 * Never replace it with hand-rolled blue buttons or black-void frames.
 */
const meta: Meta<typeof PaySelector> = {
  title: 'Molecules/PaySelector',
  component: PaySelector,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'light' },
    docs: {
      description: {
        component:
          'Canonical tip/pay amount chooser. Stories must render the real component on a System B surface.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    Story => (
      <div className='w-[24rem] rounded-3xl border border-black/6 bg-base p-6 text-primary-token shadow-sm dark:border-white/10'>
        <Story />
      </div>
    ),
  ],
  args: {
    onContinue: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    amounts: [5, 10, 20],
  },
};

export const CompactTips: Story = {
  args: {
    amounts: [3, 5, 10],
  },
};

export const Loading: Story = {
  args: {
    amounts: [5, 10, 20],
    isLoading: true,
  },
};

export const DrawerPresentation: Story = {
  args: {
    amounts: [5, 10, 20],
    presentation: 'drawer',
    showOtherPaymentOptions: true,
  },
};
