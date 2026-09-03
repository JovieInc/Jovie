import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { DrawerInspectorStack } from './DrawerInspectorStack';
import { DrawerPropertyRow } from './DrawerPropertyRow';

const meta = {
  title: 'Molecules/Drawer/DrawerInspectorStack',
  component: DrawerInspectorStack,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => <div className='w-full max-w-md bg-surface-0 p-3'>{Story()}</div>,
  ],
  args: {
    children: (
      <>
        <DrawerPropertyRow label='Release' value='Summer EP' />
        <DrawerPropertyRow label='Status' value='Draft' />
      </>
    ),
    'data-testid': 'inspector-stack',
  },
} satisfies Meta<typeof DrawerInspectorStack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('inspector-stack')).toHaveTextContent(
      'Draft'
    );
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};

export const WithCustomSpacing: Story = {
  args: {
    className: 'space-y-4',
  },
};
