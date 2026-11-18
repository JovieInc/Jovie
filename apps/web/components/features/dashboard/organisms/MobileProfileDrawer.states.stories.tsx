import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MobileProfileDrawer } from './MobileProfileDrawer';

/**
 * Rendered states of the mobile profile panel trigger. The default trigger
 * lives in MobileProfileDrawer.stories.tsx.
 */
const meta = {
  title: 'Features/Dashboard/Organisms/MobileProfileDrawer/States',
  component: MobileProfileDrawer,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['onOpen'] },
  },
  args: { onOpen: () => {} },
} satisfies Meta<typeof MobileProfileDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the trigger inside an Arabic RTL header row. */
export const RtlArabicHeader: Story = {
  render: function RtlArabicHeaderStory(args) {
    return (
      <div
        dir='rtl'
        lang='ar'
        className='flex w-64 items-center justify-between'
      >
        <span className='text-app text-primary-token'>الملف الشخصي</span>
        <MobileProfileDrawer {...args} />
      </div>
    );
  },
};
