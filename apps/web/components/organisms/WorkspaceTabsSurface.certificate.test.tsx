import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WorkspaceTabsSurface } from './WorkspaceTabsSurface';

let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/ov/people',
  useSearchParams: () => searchParams,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    prefetch: _prefetch,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    readonly href: string;
    readonly prefetch?: boolean;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const primaryOptions = [
  { value: 'creators', label: 'Creators' },
  { value: 'users', label: 'Users' },
] as const;

const secondaryOptions = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
] as const;

describe('WorkspaceTabsSurface certificate', () => {
  beforeEach(() => {
    searchParams = new URLSearchParams('view=creators&page=2&status=active');
  });

  it('renders titled primary and secondary tabs axe-clean', async () => {
    const { container } = render(
      <WorkspaceTabsSurface
        title='People'
        description='Manage creators and users.'
        primaryParam='view'
        primaryValue='creators'
        primaryOptions={primaryOptions}
        secondaryParam='status'
        secondaryValue='active'
        secondaryOptions={secondaryOptions}
      >
        <p>Workspace content</p>
      </WorkspaceTabsSurface>
    );

    expect(
      screen.getByRole('tablist', { name: 'People primary views' })
    ).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Users' })).toHaveAttribute(
      'href',
      '/app/ov/people?view=users&status=active'
    );
    expect(screen.getByRole('tab', { name: 'Archived' })).toHaveAttribute(
      'href',
      '/app/ov/people?view=creators&page=2&status=archived'
    );
    await expectNoA11yViolations(container);
  });

  it('puts only the selected tab in the keyboard order', async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceTabsSurface
        title='People'
        description='Manage creators and users.'
        primaryParam='view'
        primaryValue='users'
        primaryOptions={primaryOptions}
      >
        <button type='button'>After tabs</button>
      </WorkspaceTabsSurface>
    );

    await user.tab();
    expect(screen.getByRole('tab', { name: 'Users' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Creators' })).toHaveAttribute(
      'tabindex',
      '-1'
    );
    await user.tab();
    expect(screen.getByRole('button', { name: 'After tabs' })).toHaveFocus();
  });

  it('drops the tab bar for a single view and stays axe-clean', async () => {
    const { container } = render(
      <WorkspaceTabsSurface
        title='People'
        description='Manage creators.'
        primaryParam='view'
        primaryValue='creators'
        primaryOptions={[primaryOptions[0]]}
        secondaryParam='status'
        secondaryValue={null}
        secondaryOptions={secondaryOptions}
      >
        <p>Workspace content</p>
      </WorkspaceTabsSurface>
    );

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByText('Workspace content')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('keeps headerless, long and right-to-left tabs axe-clean', async () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      value: `v${index + 1}`,
      label: `عرض ${index + 1}`,
    }));
    const { container } = render(
      <div dir='rtl'>
        <WorkspaceTabsSurface
          title='الأشخاص'
          description='إدارة المبدعين.'
          primaryParam='view'
          primaryValue='v1'
          primaryOptions={many}
          headerless
        >
          <p>محتوى</p>
        </WorkspaceTabsSurface>
      </div>
    );

    expect(screen.getAllByRole('tab')).toHaveLength(9);
    expect(screen.queryByText('إدارة المبدعين.')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
