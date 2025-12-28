import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SkipToContent } from './SkipToContent';

const meta: Meta<typeof SkipToContent> = {
  title: 'Atoms/SkipToContent',
  component: SkipToContent,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
A visually hidden skip link for keyboard accessibility that allows users to bypass navigation and jump directly to main content.

## Keyboard Accessibility

This component is essential for WCAG 2.1 Level A compliance (2.4.1 Bypass Blocks). It provides a way for keyboard and screen reader users to skip repetitive navigation elements.

### How it works:
- **Hidden by default**: The link is visually hidden using the \`sr-only\` class but remains accessible to screen readers.
- **Visible on focus**: When a user tabs to the link, it becomes visible using \`focus:not-sr-only\`.
- **Skip functionality**: Activating the link (pressing Enter) jumps focus to the main content area.

### Usage:
1. Add this component as the **first focusable element** in your layout
2. Ensure your main content area has a matching \`id\` attribute (default: \`main-content\`)
3. The target element should have \`tabindex="-1"\` if it's not natively focusable

### Testing in Storybook:
To see this component in action, **press Tab** to focus on it. The link will appear in the top-left corner when focused.
        `,
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    targetId: {
      control: { type: 'text' },
      description:
        'The ID of the target element to skip to (without the # prefix)',
    },
    linkText: {
      control: { type: 'text' },
      description: 'The text to display in the skip link',
    },
    className: {
      control: { type: 'text' },
      description: 'Additional CSS classes',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default configuration. Press Tab to see the skip link appear.
 * The link targets an element with id="main-content".
 */
export const Default: Story = {
  args: {
    targetId: 'main-content',
    linkText: 'Skip to content',
  },
  render: args => (
    <div className='min-h-screen bg-background'>
      <SkipToContent {...args} />
      <header className='border-b p-4'>
        <p className='text-muted-foreground text-sm'>
          Press{' '}
          <kbd className='rounded bg-muted px-1.5 py-0.5 font-mono text-xs'>
            Tab
          </kbd>{' '}
          to see the skip link appear in the top-left corner.
        </p>
      </header>
      <main id='main-content' className='p-4' tabIndex={-1}>
        <h1 className='mb-4 text-2xl font-bold'>Main Content</h1>
        <p>This is the main content area that the skip link will jump to.</p>
      </main>
    </div>
  ),
};

/**
 * Custom link text for different contexts, such as a documentation page.
 */
export const CustomText: Story = {
  args: {
    targetId: 'main-content',
    linkText: 'Skip to main article',
  },
  render: args => (
    <div className='min-h-screen bg-background'>
      <SkipToContent {...args} />
      <header className='border-b p-4'>
        <p className='text-muted-foreground text-sm'>
          Press{' '}
          <kbd className='rounded bg-muted px-1.5 py-0.5 font-mono text-xs'>
            Tab
          </kbd>{' '}
          to see the skip link with custom text.
        </p>
      </header>
      <main id='main-content' className='p-4' tabIndex={-1}>
        <h1 className='mb-4 text-2xl font-bold'>Main Article</h1>
        <p>The skip link now reads &quot;Skip to main article&quot;.</p>
      </main>
    </div>
  ),
};

/**
 * Targeting a custom element ID, useful when the main content
 * has a different identifier.
 */
export const CustomTarget: Story = {
  args: {
    targetId: 'article-content',
    linkText: 'Skip to article',
  },
  render: args => (
    <div className='min-h-screen bg-background'>
      <SkipToContent {...args} />
      <header className='border-b p-4'>
        <p className='text-muted-foreground text-sm'>
          Press{' '}
          <kbd className='rounded bg-muted px-1.5 py-0.5 font-mono text-xs'>
            Tab
          </kbd>{' '}
          to see the skip link. It targets &quot;#article-content&quot; instead
          of the default.
        </p>
      </header>
      <nav className='border-b p-4'>
        <p className='text-sm'>
          Navigation section (would normally contain many links)
        </p>
      </nav>
      <article id='article-content' className='p-4' tabIndex={-1}>
        <h1 className='mb-4 text-2xl font-bold'>Article Content</h1>
        <p>This section has a custom ID that the skip link targets.</p>
      </article>
    </div>
  ),
};

/**
 * Demonstrates the component in a more realistic layout with navigation
 * elements that keyboard users would want to skip.
 */
export const WithNavigation: Story = {
  args: {
    targetId: 'main-content',
    linkText: 'Skip to content',
  },
  render: args => (
    <div className='min-h-screen bg-background'>
      <SkipToContent {...args} />
      <header className='border-b p-4'>
        <nav className='flex gap-4'>
          {/* biome-ignore lint/a11y/useValidAnchor: Story example anchor */}
          <a href='#' className='text-sm hover:underline'>
            Home
          </a>
          {/* biome-ignore lint/a11y/useValidAnchor: Story example anchor */}
          <a href='#' className='text-sm hover:underline'>
            About
          </a>
          {/* biome-ignore lint/a11y/useValidAnchor: Story example anchor */}
          <a href='#' className='text-sm hover:underline'>
            Products
          </a>
          {/* biome-ignore lint/a11y/useValidAnchor: Story example anchor */}
          <a href='#' className='text-sm hover:underline'>
            Services
          </a>
          {/* biome-ignore lint/a11y/useValidAnchor: Story example anchor */}
          <a href='#' className='text-sm hover:underline'>
            Contact
          </a>
        </nav>
      </header>
      <aside className='border-b p-4'>
        <h2 className='mb-2 font-semibold'>Sidebar</h2>
        <ul className='space-y-1 text-sm'>
          <li>
            {/* biome-ignore lint/a11y/useValidAnchor: Story example anchor */}
            <a href='#' className='hover:underline'>
              Link 1
            </a>
          </li>
          <li>
            {/* biome-ignore lint/a11y/useValidAnchor: Story example anchor */}
            <a href='#' className='hover:underline'>
              Link 2
            </a>
          </li>
          <li>
            {/* biome-ignore lint/a11y/useValidAnchor: Story example anchor */}
            <a href='#' className='hover:underline'>
              Link 3
            </a>
          </li>
        </ul>
      </aside>
      <main id='main-content' className='p-4' tabIndex={-1}>
        <h1 className='mb-4 text-2xl font-bold'>Main Content</h1>
        <p className='mb-4'>
          Without the skip link, keyboard users would need to tab through all
          navigation items above before reaching this content.
        </p>
        <p className='text-muted-foreground text-sm'>
          Tip: Press{' '}
          <kbd className='rounded bg-muted px-1.5 py-0.5 font-mono text-xs'>
            Shift+Tab
          </kbd>{' '}
          repeatedly to navigate backwards and see the skip link appear.
        </p>
      </main>
    </div>
  ),
};

/**
 * Always visible variant for demonstration purposes.
 * In production, the component would only be visible on focus.
 */
export const AlwaysVisible: Story = {
  args: {
    targetId: 'main-content',
    linkText: 'Skip to content',
    className:
      'not-sr-only fixed left-4 top-4 z-[9999] rounded-md bg-primary px-4 py-2 text-primary-foreground outline-none ring-2 ring-ring ring-offset-2',
  },
  render: args => (
    <div className='min-h-screen bg-background'>
      <SkipToContent {...args} />
      <header className='border-b p-4 pt-16'>
        <p className='text-muted-foreground text-sm'>
          This story shows the skip link in its visible state for demonstration.
          In production, it would only appear when focused via keyboard.
        </p>
      </header>
      <main id='main-content' className='p-4' tabIndex={-1}>
        <h1 className='mb-4 text-2xl font-bold'>Main Content</h1>
        <p>
          The skip link is always visible in this story for demonstration
          purposes.
        </p>
      </main>
    </div>
  ),
};
