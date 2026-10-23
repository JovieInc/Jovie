import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRE_SAVE_COPY, PRE_SAVE_FIXTURE } from '@/data/preSaveCopy';
import { PreSaveLanding } from './PreSaveLanding';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const NOW = new Date('2031-04-16T16:00:00.000Z');

describe('PreSaveLanding', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders the live countdown in the hero with the fixture release', () => {
    render(<PreSaveLanding />);

    const hero = screen.getByTestId('marketing-section-hero');
    expect(hero.tagName).toBe('SECTION');
    expect(hero).toHaveAttribute(
      'data-marketing-variant',
      'split-screenshot-right'
    );
    expect(hero).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/app/(marketing)/product/pre-save/PreSaveLanding.tsx'
    );
    expect(hero).toHaveAttribute('data-accent', 'ion');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      PRE_SAVE_COPY.headline
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute(
      'data-wrap',
      'editorial-title'
    );
    expect(screen.getByText(PRE_SAVE_COPY.support)).toBeVisible();

    const countdown = within(hero).getByTestId('pre-save-countdown');
    expect(countdown).toBeVisible();
    expect(
      within(countdown).getByText(PRE_SAVE_FIXTURE.releaseTitle)
    ).toBeVisible();
    expect(within(countdown).getByText('1')).toBeVisible();
    expect(within(countdown).getByText('YR')).toBeVisible();

    const panel = screen.getByTestId('pre-save-panel');
    expect(panel).toHaveClass('rounded-3xl', 'border', 'border-subtle');

    for (const link of PRE_SAVE_COPY.links) {
      expect(screen.getByRole('link', { name: link.label })).toHaveAttribute(
        'href',
        link.href
      );
    }
  });
});
