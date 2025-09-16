import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet';

const meta: Meta<typeof Sheet> = {
  title: 'UI/Atoms/Sheet',
  component: Sheet,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
# Sheet Component

A slide-over dialog component built with Radix UI Dialog, featuring Apple-level polish and full accessibility support.

## Features

- **SSR Safe**: Server-side rendering compatible
- **Accessibility**: Complete keyboard navigation, focus trapping, and screen reader support
- **Responsive**: Works across all device sizes with mobile-first design
- **Motion**: Smooth animations with reduced motion support
- **Tokenized**: Uses Tailwind v4 design tokens for consistent theming
- **Versatile**: Support for all sides (left, right, top, bottom) and multiple sizes

## Accessibility

- Focus is trapped within the sheet when open
- Escape key closes the sheet
- Clicking the overlay closes the sheet
- Proper ARIA labels and descriptions
- Screen reader announcements
- Keyboard navigation support
        `,
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    side: {
      control: 'select',
      options: ['left', 'right', 'top', 'bottom'],
      description: 'Which side the sheet slides in from',
    },
    size: {
      control: 'select',
      options: ['sm', 'default', 'lg', 'xl', 'full'],
      description: 'Size of the sheet',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Basic story wrapper component
const SheetDemo = ({ 
  side = 'right', 
  size = 'default',
  children,
  triggerText = 'Open Sheet',
}: {
  side?: 'left' | 'right' | 'top' | 'bottom';
  size?: 'sm' | 'default' | 'lg' | 'xl' | 'full';
  children?: React.ReactNode;
  triggerText?: string;
}) => {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-btn-primary text-btn-primary-foreground hover:bg-btn-primary/90 h-10 px-4 py-2">
          {triggerText}
        </button>
      </SheetTrigger>
      <SheetContent side={side} size={size}>
        {children}
      </SheetContent>
    </Sheet>
  );
};

export const Default: Story = {
  render: () => (
    <SheetDemo>
      <SheetHeader>
        <SheetTitle>Sheet Title</SheetTitle>
        <SheetDescription>
          This is a sheet description that explains what this dialog is for.
        </SheetDescription>
      </SheetHeader>
      <div className="flex-1 py-4">
        <p className="text-sm text-secondary-token">
          Sheet content goes here. This area will scroll if the content is too long.
        </p>
      </div>
      <SheetFooter>
        <SheetClose asChild>
          <button className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-surface-2 text-primary-token hover:bg-surface-3 h-9 px-3">
            Cancel
          </button>
        </SheetClose>
        <button className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-btn-primary text-btn-primary-foreground hover:bg-btn-primary/90 h-9 px-3">
          Save changes
        </button>
      </SheetFooter>
    </SheetDemo>
  ),
};

export const AllSides: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <SheetDemo side="left" triggerText="Left Sheet">
        <SheetHeader>
          <SheetTitle>Left Sheet</SheetTitle>
          <SheetDescription>Slides in from the left side</SheetDescription>
        </SheetHeader>
        <div className="py-4">
          <p className="text-sm text-secondary-token">Content for left sheet.</p>
        </div>
      </SheetDemo>

      <SheetDemo side="right" triggerText="Right Sheet">
        <SheetHeader>
          <SheetTitle>Right Sheet</SheetTitle>
          <SheetDescription>Slides in from the right side (default)</SheetDescription>
        </SheetHeader>
        <div className="py-4">
          <p className="text-sm text-secondary-token">Content for right sheet.</p>
        </div>
      </SheetDemo>

      <SheetDemo side="top" triggerText="Top Sheet">
        <SheetHeader>
          <SheetTitle>Top Sheet</SheetTitle>
          <SheetDescription>Slides in from the top</SheetDescription>
        </SheetHeader>
        <div className="py-4">
          <p className="text-sm text-secondary-token">Content for top sheet.</p>
        </div>
      </SheetDemo>

      <SheetDemo side="bottom" triggerText="Bottom Sheet">
        <SheetHeader>
          <SheetTitle>Bottom Sheet</SheetTitle>
          <SheetDescription>Slides in from the bottom</SheetDescription>
        </SheetHeader>
        <div className="py-4">
          <p className="text-sm text-secondary-token">Content for bottom sheet.</p>
        </div>
      </SheetDemo>
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <SheetDemo size="sm" triggerText="Small Sheet">
        <SheetHeader>
          <SheetTitle>Small Sheet</SheetTitle>
          <SheetDescription>320px wide (80vw max)</SheetDescription>
        </SheetHeader>
        <div className="py-4">
          <p className="text-sm text-secondary-token">This is a small sheet.</p>
        </div>
      </SheetDemo>

      <SheetDemo size="default" triggerText="Default Sheet">
        <SheetHeader>
          <SheetTitle>Default Sheet</SheetTitle>
          <SheetDescription>384px wide (85vw max)</SheetDescription>
        </SheetHeader>
        <div className="py-4">
          <p className="text-sm text-secondary-token">This is the default size sheet.</p>
        </div>
      </SheetDemo>

      <SheetDemo size="lg" triggerText="Large Sheet">
        <SheetHeader>
          <SheetTitle>Large Sheet</SheetTitle>
          <SheetDescription>512px wide (90vw max)</SheetDescription>
        </SheetHeader>
        <div className="py-4">
          <p className="text-sm text-secondary-token">This is a large sheet.</p>
        </div>
      </SheetDemo>

      <SheetDemo size="xl" triggerText="Extra Large Sheet">
        <SheetHeader>
          <SheetTitle>Extra Large Sheet</SheetTitle>
          <SheetDescription>640px wide (95vw max)</SheetDescription>
        </SheetHeader>
        <div className="py-4">
          <p className="text-sm text-secondary-token">This is an extra large sheet.</p>
        </div>
      </SheetDemo>

      <SheetDemo size="full" triggerText="Full Width Sheet">
        <SheetHeader>
          <SheetTitle>Full Width Sheet</SheetTitle>
          <SheetDescription>Takes full width of the viewport</SheetDescription>
        </SheetHeader>
        <div className="py-4">
          <p className="text-sm text-secondary-token">This sheet takes the full width.</p>
        </div>
      </SheetDemo>
    </div>
  ),
};

export const WithForm: Story = {
  render: () => {
    const FormExample = () => {
      const [formData, setFormData] = useState({
        name: '',
        email: '',
        message: '',
      });

      return (
        <SheetDemo size="lg" triggerText="Open Form Sheet">
          <SheetHeader>
            <SheetTitle>Contact Form</SheetTitle>
            <SheetDescription>
              Fill out this form to get in touch with us.
            </SheetDescription>
          </SheetHeader>
          
          <form className="flex-1 space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium text-primary-token">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-md border border-subtle bg-surface-1 px-3 py-2 text-sm text-primary-token focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="Enter your name"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-primary-token">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="w-full rounded-md border border-subtle bg-surface-1 px-3 py-2 text-sm text-primary-token focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="Enter your email"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="message" className="text-sm font-medium text-primary-token">
                Message
              </label>
              <textarea
                id="message"
                value={formData.message}
                onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                className="w-full rounded-md border border-subtle bg-surface-1 px-3 py-2 text-sm text-primary-token focus:outline-none focus:ring-2 focus:ring-accent min-h-[100px] resize-y"
                placeholder="Enter your message"
              />
            </div>
          </form>

          <SheetFooter>
            <SheetClose asChild>
              <button className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-surface-2 text-primary-token hover:bg-surface-3 h-9 px-3">
                Cancel
              </button>
            </SheetClose>
            <button 
              type="submit"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-btn-primary text-btn-primary-foreground hover:bg-btn-primary/90 h-9 px-3"
            >
              Send Message
            </button>
          </SheetFooter>
        </SheetDemo>
      );
    };

    return <FormExample />;
  },
};

export const LongContent: Story = {
  render: () => (
    <SheetDemo triggerText="Long Content Sheet">
      <SheetHeader>
        <SheetTitle>Long Content Example</SheetTitle>
        <SheetDescription>
          This sheet demonstrates how scrolling works with longer content.
        </SheetDescription>
      </SheetHeader>
      
      <div className="flex-1 space-y-4 py-4 overflow-y-auto">
        {Array.from({ length: 20 }, (_, i) => (
          <div key={i} className="p-4 bg-surface-2 rounded-md">
            <h3 className="font-medium text-primary-token">Section {i + 1}</h3>
            <p className="text-sm text-secondary-token mt-2">
              This is some content for section {i + 1}. It demonstrates how the sheet
              handles scrolling when there&apos;s too much content to fit in the viewport.
              The header and footer remain fixed while this content area scrolls.
            </p>
          </div>
        ))}
      </div>

      <SheetFooter>
        <SheetClose asChild>
          <button className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-surface-2 text-primary-token hover:bg-surface-3 h-9 px-3">
            Close
          </button>
        </SheetClose>
      </SheetFooter>
    </SheetDemo>
  ),
};

export const NoCloseButton: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <button className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-btn-primary text-btn-primary-foreground hover:bg-btn-primary/90 h-10 px-4 py-2">
          No Close Button
        </button>
      </SheetTrigger>
      <SheetContent hideCloseButton>
        <SheetHeader>
          <SheetTitle>Sheet Without Close Button</SheetTitle>
          <SheetDescription>
            This sheet has the close button hidden. You can still close it by
            pressing Escape or clicking the overlay.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 py-4">
          <p className="text-sm text-secondary-token">
            Sometimes you might want to hide the default close button and provide
            your own closing mechanism.
          </p>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <button className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-btn-primary text-btn-primary-foreground hover:bg-btn-primary/90 h-9 px-3">
              Custom Close Button
            </button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const ReducedMotion: Story = {
  render: () => (
    <div className="space-y-6">
      <div className="text-center">
        <SheetDemo triggerText="Test Reduced Motion">
          <SheetHeader>
            <SheetTitle>Reduced Motion Support</SheetTitle>
            <SheetDescription>
              This sheet respects the user&apos;s motion preferences.
            </SheetDescription>
          </SheetHeader>
          <div className="py-4">
            <p className="text-sm text-secondary-token mb-4">
              This sheet component automatically adapts its animations based on
              the user&apos;s motion preferences.
            </p>
            <div className="p-4 bg-surface-2 rounded-lg">
              <p className="text-sm mb-2 font-medium text-primary-token">Motion Settings:</p>
              <ul className="text-sm text-secondary-token list-disc pl-5 space-y-1">
                <li>Standard: Smooth animations with backdrop blur</li>
                <li>Reduced motion: Faster, simpler animations without blur</li>
                <li>No motion: Instant state changes (CSS only)</li>
              </ul>
            </div>
          </div>
        </SheetDemo>
      </div>
      <div className="p-4 bg-surface-1 rounded-lg border border-subtle text-center">
        <p className="text-sm text-secondary-token">
          <strong>How to test:</strong> Change your OS motion settings
          (e.g., &quot;Reduce motion&quot; on macOS) to see the different animation behaviors.
        </p>
      </div>
    </div>
  ),
};