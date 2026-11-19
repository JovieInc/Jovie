import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SmartLinkCreditGroup } from '@/app/[username]/[slug]/_lib/data';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseCreditsDrawer } from './ReleaseCreditsDrawer';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
    readonly prefetch?: boolean;
  }) => React.createElement('a', { href, ...props }, children),
}));

const credits = [
  {
    role: 'producer',
    label: 'PRODUCER',
    entries: [
      {
        artistId: 'ada',
        name: 'Ada Lovelace',
        handle: 'ada',
        role: 'producer',
        position: 0,
      },
      {
        artistId: 'grace',
        name: 'Grace Hopper',
        handle: null,
        role: 'producer',
        position: 1,
      },
    ],
  },
] satisfies SmartLinkCreditGroup[];

describe('ReleaseCreditsDrawer certificate', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders sentence-case role labels on the on-media token without forced caps', async () => {
    const { baseElement } = render(
      <ReleaseCreditsDrawer
        open
        onOpenChange={vi.fn()}
        credits={credits}
        presentation='modal'
      />
    );

    const heading = screen.getByRole('heading', { name: 'Producer' });
    expect(heading).toHaveTextContent('Producer');
    expect(heading).toHaveClass('text-on-media/50');
    expect(heading.className).not.toContain('uppercase');
    expect(screen.getByRole('link', { name: 'Ada Lovelace' })).toHaveClass(
      'text-on-media/88'
    );
    await expectNoA11yViolations(baseElement);
  });

  it('closes through the drawer close control', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { baseElement } = render(
      <ReleaseCreditsDrawer
        open
        onOpenChange={onOpenChange}
        credits={credits}
        presentation='modal'
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Close Modal Overlay' })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await expectNoA11yViolations(baseElement);
  });

  it('renders nothing for an empty credit list', async () => {
    const { container } = render(
      <ReleaseCreditsDrawer
        open
        onOpenChange={vi.fn()}
        credits={[{ role: 'producer', label: 'Producer', entries: [] }]}
        presentation='modal'
      />
    );

    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('keeps unlinked, long and RTL credits readable', async () => {
    const { baseElement } = render(
      <div dir='rtl' lang='ar'>
        <ReleaseCreditsDrawer
          open
          onOpenChange={vi.fn()}
          presentation='modal'
          credits={[
            {
              role: 'producer',
              label: 'منتج',
              entries: [
                {
                  artistId: 'ar1',
                  name: 'An Exceptionally Long Producer Name That Keeps Going',
                  handle: null,
                  role: 'producer',
                  position: 0,
                },
              ],
            },
          ]}
        />
      </div>
    );

    expect(
      screen.getByText('An Exceptionally Long Producer Name That Keeps Going')
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    await expectNoA11yViolations(baseElement);
  });
});
