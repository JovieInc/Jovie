import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ISRC_COPY, ISRC_FIXTURE } from '@/data/isrcCopy';
import { IsrcLanding } from './IsrcLanding';

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

describe('IsrcLanding', () => {
  it('renders the live ISRC field in the hero with fixture codes', async () => {
    render(<IsrcLanding />);

    const hero = screen.getByTestId('marketing-section-hero');
    expect(hero.tagName).toBe('SECTION');
    expect(hero).toHaveAttribute(
      'data-marketing-variant',
      'split-screenshot-right'
    );
    expect(hero).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/app/(marketing)/product/isrc/IsrcLanding.tsx'
    );
    expect(hero.closest('[data-accent="ion"]')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      ISRC_COPY.headline
    );
    expect(screen.getByText(ISRC_COPY.support)).toBeVisible();

    const editor = within(hero).getByTestId('isrc-editor');
    expect(editor).toBeVisible();
    expect(within(editor).getByText(ISRC_FIXTURE.releaseTitle)).toBeVisible();
    const primary = within(editor).getByRole('button', { name: /Edit ISRC/ });
    expect(primary).toHaveTextContent(ISRC_FIXTURE.primaryIsrc);
    expect(
      within(editor).getByRole('button', { name: 'Copy ISRC' })
    ).toBeEnabled();
    expect(within(editor).getByText(ISRC_FIXTURE.tracks[0].isrc)).toBeVisible();

    const panel = screen.getByTestId('isrc-panel');
    expect(panel).toHaveClass('marketing-rounded-frame', 'border');

    for (const link of ISRC_COPY.links) {
      expect(screen.getByRole('link', { name: link.label })).toHaveAttribute(
        'href',
        link.href
      );
    }

    fireEvent.click(primary);
    const invalid = within(editor).getByRole('textbox', { name: 'Edit ISRC' });
    fireEvent.change(invalid, { target: { value: 'NOPE' } });
    fireEvent.blur(invalid);

    await waitFor(() => {
      expect(
        within(editor).getByRole('button', { name: /Edit ISRC/ })
      ).toHaveTextContent(ISRC_FIXTURE.primaryIsrc);
    });

    fireEvent.click(within(editor).getByRole('button', { name: /Edit ISRC/ }));
    const next = within(editor).getByRole('textbox', { name: 'Edit ISRC' });
    fireEvent.change(next, { target: { value: 'us-rc1-7607840' } });
    fireEvent.blur(next);

    await waitFor(() => {
      expect(
        within(editor).getByRole('button', { name: /Edit ISRC/ })
      ).toHaveTextContent('USRC17607840');
    });
  });
});
