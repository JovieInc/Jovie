import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { DrawerInspectorGrid } from './DrawerInspectorGrid';
import { DrawerPropertyRow } from './DrawerPropertyRow';

const meta = {
  title: 'Molecules/Drawer/DrawerInspectorGrid',
  component: DrawerInspectorGrid,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => <div className='w-full max-w-md bg-surface-0 p-3'>{Story()}</div>,
  ],
  args: {
    children: (
      <>
        <DrawerPropertyRow label='Status' value='Ready' />
        <DrawerPropertyRow label='Audience' value='1,240 contacts' />
      </>
    ),
    'data-testid': 'inspector-grid',
  },
} satisfies Meta<typeof DrawerInspectorGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('inspector-grid')).toHaveTextContent(
      'Ready'
    );
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};

export const WiderLabels: Story = {
  args: {
    labelWidth: 128,
  },
};
