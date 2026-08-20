import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet';

const meta: Meta = {
  title: 'UI/Atoms/Sheet',
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button variant='secondary'>Open sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Refine your library results.</SheetDescription>
        </SheetHeader>
        <div className='grid gap-2'>
          {['All listeners', 'Returning visitors', 'New subscribers'].map(
            option => (
              <button
                key={option}
                type='button'
                className='rounded-(--system-b-radius-overlay) border border-subtle bg-surface-1 px-3 py-2 text-left text-sm text-secondary-token hover:text-primary-token'
              >
                {option}
              </button>
            )
          )}
        </div>
        <SheetFooter>
          <Button variant='secondary'>Reset</Button>
          <Button>Apply filters</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const LeftRail: Story = {
  render: () => (
    <Sheet defaultOpen>
      <SheetContent side='left'>
        <SheetHeader>
          <SheetTitle>Audience details</SheetTitle>
          <SheetDescription>
            Side, surface, spacing, and close anatomy stay consistent.
          </SheetDescription>
        </SheetHeader>
        <div className='grid gap-3'>
          {[
            'Germany · 18 visits',
            'United States · 12 visits',
            'UK · 7 visits',
          ].map(listener => (
            <div
              key={listener}
              className='rounded-(--system-b-radius-panel-inner) border border-subtle bg-surface-1 p-3 text-sm text-secondary-token'
            >
              {listener}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  ),
};
