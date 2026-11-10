import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import {
  PageToolbar,
  PageToolbarActionButton,
  PageToolbarBackLink,
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const action = canvas.getByRole('button', { name: 'Display options' });
    const bounds = action.getBoundingClientRect().toJSON();

    await userEvent.hover(action);
    await expect(action.getBoundingClientRect().toJSON()).toEqual(bounds);
    await userEvent.unhover(action);

    await userEvent.click(canvas.getByRole('button', { name: 'All' }));
    await userEvent.tab();
    await userEvent.tab();

    await expect(action).toHaveFocus();
    await expect(action.matches(':focus-visible')).toBe(true);
    await expect(getComputedStyle(action).boxShadow).not.toBe('none');
    await expect(action.getBoundingClientRect().toJSON()).toEqual(bounds);
    await expect(
      canvas.getByRole('button', { name: 'Disabled action' })
    ).toBeDisabled();
  },
};

export const WithTopDivider: Story = {
  args: {
    ...Default.args,
    topDivider: true,
  },
};

export const WithBackLink: Story = {
  args: {
    start: (
      <>
        <PageToolbarBackLink
          href='/app/releases'
          label='Releases'
          ariaLabel='Back to releases'
        />
        <span className='min-w-0 truncate text-xs text-tertiary-token tabular-nums'>
          The Deep End release tasks
        </span>
      </>
    ),
  },
};
