import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card';
import { InlineOfflineNotice } from './inline-offline';

const meta: Meta<typeof Card> = {
  title: 'UI/Atoms/Card',
  component: Card,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A flexible card component with shadcn-aligned primitives. Supports asChild for semantic variants and optional hoverable interactions.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['default', 'hoverable'],
    },
    asChild: {
      control: { type: 'boolean' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <>
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>
            This is a description of the card content.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>This is the main content of the card.</p>
        </CardContent>
      </>
    ),
  },
};

export const Plain: Story = {
  args: {
    children: (
      <CardContent>
        <p>A simple card with just content.</p>
      </CardContent>
    ),
  },
};

export const HeaderAndContent: Story = {
  args: {
    children: (
      <>
        <CardHeader>
          <CardTitle>Featured Article</CardTitle>
          <CardDescription>
            Learn about the latest developments in our platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>
            This card demonstrates the typical header and content structure. The
            header contains a title and description, while the content area
            holds the main information.
          </p>
        </CardContent>
      </>
    ),
  },
};

export const WithFooter: Story = {
  args: {
    children: (
      <>
        <CardHeader>
          <CardTitle>Action Required</CardTitle>
          <CardDescription>
            Please review and confirm your settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>Your account settings need to be updated to continue.</p>
        </CardContent>
        <CardFooter>
          <button
            type='button'
            className='px-4 py-2 bg-primary-token text-base rounded-md hover:bg-blue-700'
          >
            Update Settings
          </button>
        </CardFooter>
      </>
    ),
  },
};

export const Hoverable: Story = {
  args: {
    variant: 'hoverable',
    children: (
      <>
        <CardHeader>
          <CardTitle>Interactive Card</CardTitle>
          <CardDescription>
            This card responds to hover interactions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>Hover over this card to see the interactive effect.</p>
        </CardContent>
      </>
    ),
  },
};

export const AsArticle: Story = {
  args: {
    asChild: true,
    children: (
      <article>
        <CardHeader>
          <CardTitle asChild>
            <h1>Blog Post Title</h1>
          </CardTitle>
          <CardDescription>Published on March 15, 2024</CardDescription>
        </CardHeader>
        <CardContent>
          <p>
            This card uses semantic HTML with an article element and h1 heading
            for better accessibility and SEO.
          </p>
        </CardContent>
      </article>
    ),
  },
};

export const AsSection: Story = {
  args: {
    asChild: true,
    children: (
      <section>
        <CardHeader>
          <CardTitle asChild>
            <h2>Dashboard Section</h2>
          </CardTitle>
          <CardDescription>Overview of your account activity</CardDescription>
        </CardHeader>
        <CardContent>
          <p>
            This card uses a section element with h2 heading for proper document
            structure.
          </p>
        </CardContent>
      </section>
    ),
  },
};

export const DarkTheme: Story = {
  parameters: {
    backgrounds: { default: 'dark' },
  },
  args: {
    children: (
      <>
        <CardHeader>
          <CardTitle>Dark Theme Card</CardTitle>
          <CardDescription>
            This card adapts to dark theme automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>The design tokens ensure proper contrast in dark mode.</p>
        </CardContent>
      </>
    ),
  },
};

export const HoverableInteractive: Story = {
  args: {
    variant: 'hoverable',
    onClick: () => alert('Card clicked!'),
    children: (
      <>
        <CardHeader>
          <CardTitle>Clickable Card</CardTitle>
          <CardDescription>
            This card is both hoverable and clickable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>Click anywhere on this card to trigger an action.</p>
        </CardContent>
      </>
    ),
  },
};

export const PartialData: Story = {
  args: {
    contentState: 'partial',
    className: 'max-w-md',
    children: (
      <>
        <CardHeader>
          <CardTitle>Audience insights</CardTitle>
          <CardDescription>
            Showing cached metrics while fresh data loads.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>12.4K profile views · last synced 2m ago</p>
        </CardContent>
      </>
    ),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Partial-data state via data-content-state="partial" and --state-partial-opacity.',
      },
    },
  },
};

export const LongContent: Story = {
  args: {
    className: 'max-w-xs',
    children: (
      <>
        <CardHeader>
          <CardTitle
            maxLines={2}
            title='Independent Artist Revenue Playbook for Multi-Platform Release Campaigns'
          >
            Independent Artist Revenue Playbook for Multi-Platform Release
            Campaigns
          </CardTitle>
          <CardDescription>
            Long titles clamp without breaking card layout.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-sm text-secondary-token'>
            Use maxLines or truncate on CardTitle for long-content handling.
          </p>
        </CardContent>
      </>
    ),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Long-content state via data-content-length="long" with line-clamp utilities.',
      },
    },
  },
};

export const InlineOffline: Story = {
  args: {
    className: 'max-w-md',
    children: (
      <>
        <CardHeader>
          <CardTitle>Billing summary</CardTitle>
          <CardDescription>Retry when your connection returns.</CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          <InlineOfflineNotice onRetry={() => undefined} />
          <p className='text-sm text-secondary-token'>
            Cached invoice totals remain visible beneath the inline offline
            notice.
          </p>
        </CardContent>
      </>
    ),
  },
};

export const CustomStyling: Story = {
  args: {
    className: 'max-w-md border-blue-200 bg-blue-50',
    children: (
      <>
        <CardHeader>
          <CardTitle className='text-blue-900'>Custom Styled Card</CardTitle>
          <CardDescription className='text-blue-700'>
            This card demonstrates custom styling capabilities.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-blue-800'>
            You can override the default styles while maintaining the component
            structure.
          </p>
        </CardContent>
      </>
    ),
  },
};
