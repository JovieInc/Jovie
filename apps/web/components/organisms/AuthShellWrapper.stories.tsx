import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthShellWrapper } from './AuthShellWrapper';

const ShellContent = ({ label }: { label: string }) => (
  <div className='min-h-full space-y-4 p-6'>
    <div className='rounded-xl border border-subtle bg-surface p-5'>
      <p className='text-sm font-semibold text-primary-token'>{label}</p>
      <p className='mt-2 text-sm text-secondary-token'>
        Shell content remains in place while route chrome changes.
      </p>
    </div>
  </div>
);

const meta: Meta<typeof AuthShellWrapper> = {
  title: 'Organisms/AuthShellWrapper',
  component: AuthShellWrapper,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    children: <ShellContent label='Customer shell' />,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const PreviewPanelOpen: Story = {
  args: {
    previewPanelDefaultOpen: true,
    children: <ShellContent label='Customer shell with preview panel' />,
  },
};

export const OperatorShell: Story = {
  args: {
    mode: 'ov',
    children: <ShellContent label='Operator shell' />,
  },
};
