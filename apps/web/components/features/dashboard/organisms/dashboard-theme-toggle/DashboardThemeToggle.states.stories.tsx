import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardThemeToggle } from './DashboardThemeToggle';

const meta = {
  title: 'Dashboard/Theme/DashboardThemeToggle/States',
  component: DashboardThemeToggle,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['theme', 'resolvedTheme', 'isDark', 'onToggle'] },
  },
  args: { onThemeChange: () => undefined },
} satisfies Meta<typeof DashboardThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Rtl: the three-way theme grid inside a right-to-left container. */
export const RtlSystemOption: Story = {
  args: { showSystemOption: true },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' className='w-full max-w-sm'>
          <Story />
        </div>
      );
    },
  ],
};

/** Long content: the theme grid squeezed into a narrow column. */
export const LongContentNarrowGrid: Story = {
  args: { showSystemOption: true },
  decorators: [
    function NarrowFrame(Story) {
      return (
        <div className='w-56'>
          <Story />
        </div>
      );
    },
  ],
};
