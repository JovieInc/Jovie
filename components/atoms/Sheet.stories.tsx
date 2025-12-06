import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './Sheet';

const meta: Meta<typeof Sheet> = {
  title: 'Atoms/Sheet',
  component: Sheet,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant='primary' size='sm'>
          Open sheet
        </Button>
      </SheetTrigger>
      <SheetContent side='right'>
        <SheetHeader>
          <SheetTitle>Profile settings</SheetTitle>
          <p className='text-sm text-muted-foreground'>
            Customize what fans see
          </p>
        </SheetHeader>
        <div className='flex-1'>
          <p className='text-sm text-secondary'>
            Try the new layout for better discovery.
          </p>
        </div>
        <SheetFooter>
          <Button variant='ghost'>Cancel</Button>
          <Button variant='primary'>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};
