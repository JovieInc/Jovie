import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { buildDspFindUrl } from '@/components/molecules/inspector/dsp-find-url';
import { DSP_LINKS_COPY, DSP_LINKS_FIXTURE } from '@/data/dspLinksCopy';
import { DspLinksLanding } from './DspLinksLanding';

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

describe('DspLinksLanding', () => {
  it('renders the live DSP rows in the hero with fixture links', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(globalThis, 'open').mockImplementation(() => null);
    render(<DspLinksLanding />);

    const hero = screen.getByTestId('marketing-section-hero');
    expect(hero.tagName).toBe('SECTION');
    expect(hero).toHaveAttribute(
      'data-marketing-variant',
      'split-screenshot-right'
    );
    expect(hero).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/app/(marketing)/product/dsp-links/DspLinksLanding.tsx'
    );
    expect(hero).toHaveAttribute('data-accent', 'ion');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      DSP_LINKS_COPY.headline
    );
    expect(screen.getByText(DSP_LINKS_COPY.support)).toBeVisible();

    const list = within(hero).getByTestId('dsp-links');
    expect(list).toBeVisible();
    expect(buildDspFindUrl('pandora', DSP_LINKS_FIXTURE.findQuery)).toBe(
      DSP_LINKS_FIXTURE.findUrl
    );

    for (const service of DSP_LINKS_FIXTURE.services) {
      if (!service.href) continue;
      const row = within(list).getByRole('link', { name: service.label });
      expect(row).toHaveAttribute('href', service.href);
      expect(row).toHaveAttribute('data-dsp-row', 'linked');
    }

    const missing = within(list).getByTestId('dsp-link-pandora');
    expect(missing).toHaveAttribute('data-dsp-row', 'missing');
    expect(
      within(missing).queryByRole('link', { name: 'Pandora' })
    ).not.toBeInTheDocument();
    await user.click(within(missing).getByRole('button', { name: 'Find' }));
    expect(open).toHaveBeenCalledWith(
      DSP_LINKS_FIXTURE.findUrl,
      '_blank',
      'noopener,noreferrer'
    );

    const panel = screen.getByTestId('dsp-links-panel');
    expect(panel).toHaveClass('rounded-3xl', 'border', 'border-subtle');

    for (const link of DSP_LINKS_COPY.links) {
      expect(screen.getByRole('link', { name: link.label })).toHaveAttribute(
        'href',
        link.href
      );
    }

    open.mockRestore();
  });
});
