import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  InputSkeleton,
  ProfileSettingsLoading,
  SettingsButtonSkeleton,
  SettingsCardSkeleton,
  SettingsLoadingSkeleton,
  ToggleRowSkeleton,
} from './SettingsLoadingSkeleton';

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Molecules/SettingsLoadingSkeleton States',
  component: SettingsLoadingSkeleton,
  parameters: {
    layout: 'padded',
  },
  args: {
    children: (
      <>
        <InputSkeleton />
        <SettingsButtonSkeleton />
      </>
    ),
  },
} satisfies Meta<typeof SettingsLoadingSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the profile settings page while its data loads. */
export const LoadingProfileSettings: Story = {
  render: function RenderProfileSettingsLoading() {
    return <ProfileSettingsLoading />;
  },
};

/** Partial: only children, so the title and description use default widths. */
export const PartialDefaultWidths: Story = {
  args: {
    children: <InputSkeleton />,
  },
};

/** Long content: a long settings section with many placeholder rows. */
export const LongContentManyRows: Story = {
  args: {
    titleWidth: 'w-64',
    descriptionWidth: 'w-full',
    children: (
      <>
        <InputSkeleton />
        <InputSkeleton width='w-2/3' />
        <ToggleRowSkeleton />
        <ToggleRowSkeleton labelWidth='w-72' />
        <ToggleRowSkeleton labelWidth='w-40' />
        <SettingsCardSkeleton />
        <SettingsCardSkeleton height='h-32' />
        <SettingsButtonSkeleton width='w-32' />
      </>
    ),
  },
};

/** Right-to-left: the skeleton inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    children: (
      <>
        <ToggleRowSkeleton />
        <InputSkeleton width='w-2/3' />
      </>
    ),
  },
  decorators: [RtlFrame],
};
