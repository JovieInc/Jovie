import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { RightDrawer } from './RightDrawer';

const meta: Meta<typeof RightDrawer> = {
  title: 'Molecules/Drawer/RightDrawer',
  component: RightDrawer,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    isOpen: true,
    width: 360,
    ariaLabel: 'Entity details',
    children: <div className='p-4'>Inspector content</div>,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Closed: Story = {
  args: {
    isOpen: false,
  },
};

function FocusReturnExample() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button
        data-rail-toggle='right'
        aria-controls='focus-return-rail'
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        Toggle inspector
      </Button>
      <RightDrawer
        id='focus-return-rail'
        isOpen={open}
        width={360}
        ariaLabel='Focus return inspector'
      >
        <Button onClick={() => setOpen(false)}>Close inspector</Button>
      </RightDrawer>
    </>
  );
}

export const FocusReturn: Story = {
  render: () => <FocusReturnExample />,
};
