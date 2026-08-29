import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({
    alt = '',
    priority: _priority,
    ...props
  }: ComponentProps<'img'>) => {
    void _priority;
    return <img alt={alt} {...props} />;
  },
}));

import { HomeV1Design } from './HomeV1Design';

describe('HomeV1Design', () => {
  it('exposes a named semantic subsection below the hero heading', () => {
    render(<HomeV1Design />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Release Work, Finally Organized.',
      })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

    const requestHeading = screen.getByRole('heading', {
      level: 2,
      name: /Tell Jovie what you are releasing next\./,
    });

    expect(requestHeading).toHaveClass(
      'text-mid',
      'leading-6',
      'text-white/78'
    );
    expect(
      screen.getByRole('region', {
        name: /Tell Jovie what you are releasing next\./,
      })
    ).toContainElement(requestHeading);
  });

  it('keeps the request-access links and trust strip in raw server HTML', () => {
    const rawDocument = new DOMParser().parseFromString(
      renderToStaticMarkup(<HomeV1Design />),
      'text/html'
    );

    expect(
      Array.from(rawDocument.querySelectorAll('h1, h2')).map(
        heading => `${heading.tagName}:${heading.textContent?.trim()}`
      )
    ).toEqual([
      'H1:Release Work, Finally Organized.',
      'H2:Tell Jovie what you are releasing next. Your request becomes the context we use to shape setup, profile work, and the launch queue.',
    ]);
    expect(
      rawDocument.querySelectorAll('a[href*="/start?starter_prompt="]')
    ).toHaveLength(6);
    expect(rawDocument.body.textContent).toContain('Plan my next release');
    expect(rawDocument.body.textContent).toContain(
      'Built for artists and teams replacing scattered release work'
    );
  });
});
