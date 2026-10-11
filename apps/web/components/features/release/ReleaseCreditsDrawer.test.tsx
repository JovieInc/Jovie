import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SmartLinkCreditGroup } from '@/app/[username]/[slug]/_lib/data';
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

describe('ReleaseCreditsDrawer', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the credits dialog with grouped entries when open', () => {
    render(
      <ReleaseCreditsDrawer
        open
        onOpenChange={vi.fn()}
        credits={credits}
        presentation='modal'
      />
    );

    expect(screen.getByRole('dialog', { name: 'Credits' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Credits' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Producer' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ada Lovelace' })).toHaveAttribute(
      'href',
      '/ada'
    );
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('renders nothing when every credit group is empty', () => {
    const { container } = render(
      <ReleaseCreditsDrawer
        open
        onOpenChange={vi.fn()}
        credits={[{ role: 'producer', label: 'PRODUCER', entries: [] }]}
        presentation='modal'
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('dismisses via the modal overlay', () => {
    const onOpenChange = vi.fn();
    render(
      <ReleaseCreditsDrawer
        open
        onOpenChange={onOpenChange}
        credits={credits}
        presentation='modal'
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Close Modal Overlay' })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
