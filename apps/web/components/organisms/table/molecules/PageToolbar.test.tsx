import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  PageToolbar,
  PageToolbarActionButton,
  PageToolbarBackLink,
  PageToolbarTabButton,
} from './PageToolbar';

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    prefetch?: boolean;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('PageToolbar', () => {
  it('switches tabs and runs toolbar actions', async () => {
    const user = userEvent.setup();
    const onDrafts = vi.fn();
    const onDisplay = vi.fn();
    render(
      <PageToolbar
        start={
          <>
            <PageToolbarTabButton label='All' active />
            <PageToolbarTabButton label='Drafts' onClick={onDrafts} />
          </>
        }
        end={
          <PageToolbarActionButton
            label='Display'
            ariaLabel='Display options'
            onClick={onDisplay}
          />
        }
      />
    );

    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await user.click(screen.getByRole('button', { name: 'Drafts' }));
    expect(onDrafts).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Display options' }));
    expect(onDisplay).toHaveBeenCalledTimes(1);
  });

  it('keeps disabled actions inert for read-only viewers', async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    render(
      <PageToolbar
        start={<PageToolbarTabButton label='All' active />}
        end={
          <PageToolbarActionButton
            label='Import'
            ariaLabel='Import contacts'
            disabled
            onClick={onImport}
          />
        }
      />
    );

    const action = screen.getByRole('button', { name: 'Import contacts' });
    expect(action).toBeDisabled();
    await user.click(action);
    expect(onImport).not.toHaveBeenCalled();
  });

  it('renders only the start slot when there are no actions', () => {
    const { container } = render(
      <PageToolbar
        data-testid='toolbar'
        topDivider
        start={<PageToolbarTabButton label='All' active />}
      />
    );

    const toolbar = screen.getByTestId('toolbar');
    expect(toolbar).toHaveAttribute('data-top-divider', 'true');
    expect(toolbar.children).toHaveLength(1);
    expect(container.querySelectorAll('button')).toHaveLength(1);
  });

  it('names the back link after its destination', () => {
    render(
      <PageToolbar
        start={<PageToolbarBackLink href='/app/releases' label='Releases' />}
      />
    );

    expect(
      screen.getByRole('link', { name: 'Back to Releases' })
    ).toHaveAttribute('href', '/app/releases');
  });

  it.each([
    [
      'tabs and actions',
      <PageToolbar
        key='full'
        start={
          <>
            <PageToolbarTabButton label='All' active />
            <PageToolbarTabButton label='Drafts' />
          </>
        }
        end={
          <PageToolbarActionButton
            label='Display'
            ariaLabel='Display options'
          />
        }
      />,
    ],
    [
      'start only',
      <PageToolbar
        key='start'
        start={<PageToolbarBackLink href='/app/releases' label='Releases' />}
      />,
    ],
    [
      'read-only actions',
      <PageToolbar
        key='readonly'
        start={<PageToolbarTabButton label='All' active />}
        end={
          <PageToolbarActionButton
            label='Import'
            ariaLabel='Import contacts'
            disabled
          />
        }
      />,
    ],
    [
      'long content',
      <PageToolbar
        key='long'
        start={
          <PageToolbarBackLink
            href='/app/releases'
            label='Releases From The Extraordinarily Long Named Midnight Orchestra Collective'
          />
        }
        end={
          <PageToolbarActionButton
            label='Display Options For Every Column'
            ariaLabel='Display options'
          />
        }
      />,
    ],
    [
      'rtl',
      <div key='rtl' dir='rtl' lang='ar'>
        <PageToolbar
          start={
            <>
              <PageToolbarBackLink href='/app/releases' label='الإصدارات' />
              <PageToolbarTabButton label='الكل' active />
            </>
          }
          end={
            <PageToolbarActionButton label='العرض' ariaLabel='خيارات العرض' />
          }
        />
      </div>,
    ],
  ])('has no accessibility violations with %s', async (_name, ui) => {
    const { container } = render(ui);
    await expectNoA11yViolations(container);
  });
});
