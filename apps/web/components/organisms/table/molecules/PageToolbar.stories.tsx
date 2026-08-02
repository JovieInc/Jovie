import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  PageToolbar,
  PageToolbarActionButton,
  PageToolbarTabButton,
} from './PageToolbar';

const meta: Meta<typeof PageToolbar> = {
  title: 'Organisms/Table/PageToolbar',
  component: PageToolbar,
  parameters: {
    layout: 'padded',
    jovie: {
      // PageToolbar shell has no disabled prop; ActionButton disabled is covered below.
      uncoveredProps: ['disabled'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof PageToolbar>;

export const Default: Story = {
  args: {
    start: (
      <>
        <PageToolbarTabButton label='All' active />
        <PageToolbarTabButton label='Drafts' />
        <span className='text-xs text-tertiary-token tabular-nums'>
          12 rows
        </span>
      </>
    ),
    end: (
      <>
        <PageToolbarActionButton label='Display' ariaLabel='Display options' />
        <PageToolbarActionButton
          label='Disabled'
          ariaLabel='Disabled action'
          disabled
        />
      </>
    ),
    'data-testid': 'page-toolbar-story',
  },
};

export const WithTopDivider: Story = {
  args: {
    ...Default.args,
    topDivider: true,
  },
};
