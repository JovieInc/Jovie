import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { UpdateAvailablePillView } from './UpdateAvailablePill';

const meta = {
  title: 'Atoms/UpdateAvailablePill/States',
  component: UpdateAvailablePillView,
  parameters: { layout: 'centered' },
  args: { onClick: () => undefined },
} satisfies Meta<typeof UpdateAvailablePillView>;

export default meta;
type Story = StoryObj<typeof meta>;

function NarrowFrame({
  children,
  dir,
}: {
  readonly children: React.ReactNode;
  readonly dir?: 'rtl';
}) {
  return (
    <div dir={dir} className='flex w-32 justify-center'>
      {children}
    </div>
  );
}

/** Empty: the pill renders nothing at all when no update is available. */
export const EmptyNoUpdate: Story = {
  args: { state: 'web-ready' },
  render: () => <NarrowFrame>{null}</NarrowFrame>,
};

/** Long content: the longest label stays inside the fixed pill width. */
export const LongContentBusyLabel: Story = {
  args: { state: 'downloading' },
  render: args => (
    <NarrowFrame>
      <UpdateAvailablePillView {...args} />
    </NarrowFrame>
  ),
};

/** Rtl: the pill inside a right-to-left toolbar. */
export const RtlWebUpdate: Story = {
  args: { state: 'web-ready' },
  render: args => (
    <NarrowFrame dir='rtl'>
      <UpdateAvailablePillView {...args} />
    </NarrowFrame>
  ),
};
