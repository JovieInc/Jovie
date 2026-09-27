import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';

/**
 * Overlay collision harness (JOV-INV-036).
 *
 * Composes the canonical @jovie/ui overlay primitives in the combinations
 * that break in production: a select inside a sheet, a dialog opened from a
 * dropdown item, a popover inside a dialog, an alert dialog over a sheet,
 * three-level submenus at every viewport corner, a popover whose anchor
 * unmounts, and a modal over a scrolling page. The Playwright suite
 * `tests/e2e/storybook-overlay-collisions.spec.ts` drives each story and
 * asserts the overlay layer contract (topmost hit-testing, Escape order,
 * focus trap and restore, scroll lock without layout shift, viewport fit).
 */

const meta: Meta = {
  title: 'Guardrails/Overlay Collisions',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof meta>;

const FRUITS = ['Apple', 'Banana', 'Cherry', 'Damson', 'Elderberry'];

function FruitSelect({ testId }: { readonly testId: string }) {
  return (
    <Select defaultValue='Apple'>
      <SelectTrigger data-testid={`${testId}-trigger`} aria-label='Fruit'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent data-testid={`${testId}-content`}>
        {FRUITS.map(fruit => (
          <SelectItem key={fruit} value={fruit}>
            {fruit}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const SheetStack: Story = {
  render: () => (
    <div className='p-6'>
      <Sheet>
        <SheetTrigger asChild>
          <Button data-testid='sheet-trigger'>Open sheet</Button>
        </SheetTrigger>
        <SheetContent side='right' data-testid='sheet-content'>
          <SheetHeader>
            <SheetTitle>Rules</SheetTitle>
            <SheetDescription>
              Pick a fruit, then delete a rule.
            </SheetDescription>
          </SheetHeader>
          <FruitSelect testId='sheet-select' />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant='secondary' data-testid='sheet-popover-trigger'>
                Rule details
              </Button>
            </PopoverTrigger>
            <PopoverContent data-testid='sheet-popover-content'>
              <p className='text-sm'>Applies to every release.</p>
            </PopoverContent>
          </Popover>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant='secondary' data-testid='sheet-alert-trigger'>
                Delete rule
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent data-testid='sheet-alert-content'>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
                <AlertDialogDescription>
                  The rule stops applying immediately.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid='sheet-alert-cancel'>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SheetContent>
      </Sheet>
    </div>
  ),
};

function DialogFromDropdownHarness() {
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <div className='p-6'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button data-testid='menu-trigger'>Actions</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent data-testid='menu-content'>
          <DropdownMenuItem
            data-testid='menu-item-rename'
            onSelect={() => setDialogOpen(true)}
          >
            Rename…
          </DropdownMenuItem>
          <DropdownMenuItem>Duplicate</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-testid='dialog-content'>
          <DialogHeader>
            <DialogTitle>Rename release</DialogTitle>
            <DialogDescription>Names show on every link.</DialogDescription>
          </DialogHeader>
          <input
            aria-label='Release name'
            data-testid='dialog-input'
            className='rounded border border-default px-2 py-1'
            defaultValue='Midnight'
          />
          <FruitSelect testId='dialog-select' />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant='secondary' data-testid='dialog-popover-trigger'>
                Naming tips
              </Button>
            </PopoverTrigger>
            <PopoverContent data-testid='dialog-popover-content'>
              <p className='text-sm'>Keep it under 40 characters.</p>
            </PopoverContent>
          </Popover>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const DialogFromDropdown: Story = {
  render: () => <DialogFromDropdownHarness />,
};

const CORNERS = [
  { id: 'top-left', className: 'left-2 top-2' },
  { id: 'top-right', className: 'right-2 top-2' },
  { id: 'bottom-left', className: 'bottom-2 left-2' },
  { id: 'bottom-right', className: 'bottom-2 right-2' },
] as const;

function NestedMenu({ corner }: { readonly corner: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button data-testid={`nested-trigger-${corner}`}>{corner}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent data-testid={`nested-l1-${corner}`}>
        <DropdownMenuItem>Level one item</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-testid={`nested-l1-sub-${corner}`}>
            Move to
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent data-testid={`nested-l2-${corner}`}>
            <DropdownMenuItem>Level two item</DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-testid={`nested-l2-sub-${corner}`}>
                Playlist
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent data-testid={`nested-l3-${corner}`}>
                <DropdownMenuItem data-testid={`nested-l3-item-${corner}`}>
                  Late night drives with a long playlist name
                </DropdownMenuItem>
                <DropdownMenuItem>Morning run</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const NestedMenusAtEdges: Story = {
  render: () => (
    <div className='relative h-dvh w-full'>
      {CORNERS.map(corner => (
        <div key={corner.id} className={`absolute ${corner.className}`}>
          <NestedMenu corner={corner.id} />
        </div>
      ))}
    </div>
  ),
};

function PopoverAnchorUnmountHarness() {
  const [anchorMounted, setAnchorMounted] = useState(true);
  const [open, setOpen] = useState(false);
  return (
    <div className='p-6'>
      <Popover open={open} onOpenChange={setOpen}>
        {anchorMounted ? (
          <PopoverAnchor asChild>
            <Button
              data-testid='anchor-trigger'
              onClick={() => setOpen(value => !value)}
            >
              Row actions
            </Button>
          </PopoverAnchor>
        ) : null}
        <PopoverContent data-testid='anchor-popover-content'>
          <Button
            variant='secondary'
            data-testid='anchor-remove'
            onClick={() => setAnchorMounted(false)}
          >
            Remove row
          </Button>
        </PopoverContent>
      </Popover>
      <p data-testid='anchor-state'>{anchorMounted ? 'mounted' : 'removed'}</p>
    </div>
  );
}

export const PopoverAnchorUnmount: Story = {
  render: () => <PopoverAnchorUnmountHarness />,
};

export const ScrollLock: Story = {
  render: () => (
    <div className='min-h-[250vh] p-6'>
      <div
        data-testid='scroll-lock-marker'
        className='ml-auto h-8 w-32 rounded bg-surface-1'
      />
      <Dialog>
        <DialogTrigger asChild>
          <Button data-testid='scroll-lock-trigger'>Open dialog</Button>
        </DialogTrigger>
        <DialogContent data-testid='scroll-lock-dialog'>
          <DialogHeader>
            <DialogTitle>Locked page</DialogTitle>
            <DialogDescription>
              The page behind must not shift.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  ),
};
