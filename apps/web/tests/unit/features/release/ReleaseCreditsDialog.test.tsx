import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SmartLinkCreditGroup } from '@/app/[username]/[slug]/_lib/data';

const mockMobile = vi.hoisted(() => ({ value: false }));

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => mockMobile.value,
}));

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name }: { name: string }) => (
    <span data-testid={`icon-${name}`} aria-hidden='true' />
  ),
}));

vi.mock('@/components/organisms/Dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div role='dialog'>{children}</div> : null,
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

import { ReleaseCreditsDialog } from '@/components/features/release/ReleaseCreditsDialog';

const CREDITS: SmartLinkCreditGroup[] = [
  {
    role: 'producer',
    label: 'Producer',
    entries: [
      {
        artistId: 'artist-1',
        name: 'Ada Producer',
        handle: 'ada',
        role: 'producer',
        position: 1,
      },
    ],
  },
];

describe('ReleaseCreditsDialog', () => {
  beforeEach(() => {
    mockMobile.value = false;
  });

  it('renders nothing without credit entries', () => {
    const { container } = render(<ReleaseCreditsDialog credits={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens credits through a frosted-ghost Button trigger', () => {
    render(<ReleaseCreditsDialog credits={CREDITS} />);

    const trigger = screen.getByRole('button', { name: 'View Credits' });
    expect(trigger).toHaveAttribute('data-variant', 'frosted-ghost');

    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Ada Producer')).toBeInTheDocument();
  });
});
