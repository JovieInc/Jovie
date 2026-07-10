import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EntityCard } from './EntityCard';
import type { EntityCardModel } from './types';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
    readonly [key: string]: unknown;
  }) => React.createElement('a', { href, ...props }, children),
}));

vi.mock('@/components/atoms/ImageWithFallback', () => ({
  ImageWithFallback: ({
    alt,
    src,
  }: {
    readonly alt: string;
    readonly src: string;
  }) => React.createElement('img', { alt, src }),
}));

const merchModel: EntityCardModel = {
  id: 'm1',
  kind: 'merch',
  href: '/tim/merch/m1',
  imageUrl: 'https://cdn.test/tee.jpg',
  imageAlt: 'Tour Tee',
  eyebrow: 'Merch',
  title: 'Tour Tee 2026',
  meta: 'Premium tee',
  status: { label: 'Live', tone: 'live' },
  price: { display: '$45.00', profit: '$11.87' },
  cta: { label: 'Buy', href: '/tim/merch/m1' },
};

describe('EntityCard', () => {
  it('links the whole card and renders title, price and CTA', () => {
    render(<EntityCard model={merchModel} treatment='detailed' />);
    expect(screen.getByTestId('entity-card-merch')).toHaveAttribute(
      'href',
      '/tim/merch/m1'
    );
    expect(
      screen.getByRole('heading', { name: 'Tour Tee 2026' })
    ).toBeInTheDocument();
    expect(screen.getByText('$45.00')).toBeInTheDocument();
    expect(screen.getByText('Buy')).toBeInTheDocument();
  });

  it('hides the status pill in the compact treatment (progressive disclosure)', () => {
    render(<EntityCard model={merchModel} treatment='compact' />);
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
    render(<EntityCard model={merchModel} treatment='detailed' />);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders a date pill instead of an image for shows without artwork', () => {
    const show: EntityCardModel = {
      id: 's1',
      kind: 'show',
      title: 'The Echo',
      imageAlt: 'The Echo',
      datePill: { month: 'Jul', day: '4' },
    };
    render(<EntityCard model={show} treatment='compact' />);
    expect(screen.getByText('Jul')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders a plain container when there is no href or cta target', () => {
    const noLink: EntityCardModel = {
      id: 'x',
      kind: 'music',
      title: 'Demo',
      imageAlt: 'Demo',
    };
    render(<EntityCard model={noLink} />);
    const el = screen.getByTestId('entity-card-music');
    expect(el.tagName).toBe('DIV');
  });

  it('renders interactive CTAs as real controls instead of a whole-card link', () => {
    const onCalendar = vi.fn();
    const interactive: EntityCardModel = {
      id: 't1',
      kind: 'show',
      title: 'Live',
      imageAlt: 'The Venue',
      interactive: true,
      cta: {
        label: 'Get Tickets',
        href: 'https://tickets.test/show',
        external: true,
      },
      secondaryCta: {
        label: 'Add To Calendar',
        onClick: onCalendar,
      },
    };

    render(<EntityCard model={interactive} treatment='detailed' />);
    const card = screen.getByTestId('entity-card-show');
    expect(card.tagName).toBe('DIV');
    const tickets = screen.getByRole('link', { name: 'Get Tickets' });
    const calendar = screen.getByRole('button', { name: 'Add To Calendar' });
    expect(tickets).toHaveAttribute('href', 'https://tickets.test/show');
    expect(tickets.className).toContain('h-11');
    expect(calendar.className).toContain('h-11');
    fireEvent.click(calendar);
    expect(onCalendar).toHaveBeenCalledTimes(1);
  });

  it('locks shaped cards to a fixed aspect ratio with clipped overflow (#11899)', () => {
    render(
      <EntityCard model={merchModel} treatment='compact' shape='standard' />
    );
    const card = screen.getByTestId('entity-card-merch');
    expect(card.className).toContain('aspect-card-standard');
    expect(card.className).toContain('overflow-hidden');
  });

  it('keeps the CTA footer anchored outside the clipped text zone when shaped', () => {
    render(<EntityCard model={merchModel} treatment='big' shape='standard' />);
    const cta = screen.getByText('Buy');
    // The footer row (CTA's parent) carries the bottom anchor and never sits
    // inside the overflow-hidden text block, so the button cannot shift or
    // clip regardless of title/metadata length.
    const footer = cta.parentElement as HTMLElement;
    expect(footer.className).toContain('mt-auto');
    expect(footer.className).toContain('shrink-0');
    expect(footer.className).not.toContain('overflow-hidden');
    // Title lives in the clipped text zone.
    const title = screen.getByRole('heading', { name: 'Tour Tee 2026' });
    expect((title.parentElement as HTMLElement).className).toContain(
      'overflow-hidden'
    );
  });

  it('keeps legacy content-driven sizing when no shape is provided', () => {
    render(<EntityCard model={merchModel} treatment='compact' />);
    const card = screen.getByTestId('entity-card-merch');
    expect(card.className).not.toContain('aspect-card-standard');
    expect(card.className).not.toContain('aspect-square');
  });

  it('renders fallback text when cta.label is empty', () => {
    const onAction = vi.fn();
    const emptyLabel: EntityCardModel = {
      id: 'e1',
      kind: 'show',
      title: 'Show',
      imageAlt: 'Venue',
      interactive: true,
      cta: {
        label: '',
        onClick: onAction,
      },
    };

    render(<EntityCard model={emptyLabel} treatment='compact' />);
    const button = screen.getByRole('button');
    expect(button).not.toHaveTextContent('');
    expect(button).toHaveTextContent('Action');
  });
});
