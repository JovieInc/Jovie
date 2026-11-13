import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { MARKETING_CTA_INTENTS } from '@/data/marketingCtaIntents';
import {
  MARKETING_FOOTER_COLUMNS,
  MARKETING_LEGAL_LINKS,
} from '@/data/marketingNavigation';
import {
  PRIVACY_CHOICES_HREF,
  PRIVACY_CHOICES_LABEL,
} from '@/lib/cookies/consent-state';
import { RootNotFoundFooter } from './RootNotFoundFooter';

describe('RootNotFoundFooter', () => {
  it('always shows the claim CTA in the expanded footer', () => {
    render(<RootNotFoundFooter />);

    const footer = screen.getByTestId('marketing-footer');
    expect(footer).toHaveAttribute('data-footer-variant', 'expanded');
    const cta = within(screen.getByTestId('marketing-footer-cta')).getByRole(
      'link',
      { name: MARKETING_CTA_INTENTS.claimProfile.label }
    );
    expect(cta).toHaveAttribute(
      'href',
      MARKETING_CTA_INTENTS.claimProfile.href
    );
  });

  it('lists every code-default footer column and link', () => {
    render(<RootNotFoundFooter />);

    const nav = screen.getByRole('navigation', { name: 'Footer' });
    expect(MARKETING_FOOTER_COLUMNS.length).toBeGreaterThan(0);
    for (const column of MARKETING_FOOTER_COLUMNS) {
      expect(within(nav).getByText(column.title)).toBeInTheDocument();
      for (const link of column.links) {
        const rendered = within(nav)
          .getAllByRole('link', { name: link.label })
          .some(anchor => anchor.getAttribute('href') === link.href);
        expect(rendered).toBe(true);
      }
    }
  });

  it('links the brand mark home and lists the legal row', () => {
    render(<RootNotFoundFooter />);

    expect(screen.getByRole('link', { name: 'Jovie Home' })).toHaveAttribute(
      'href',
      APP_ROUTES.HOME
    );
    const legal = screen.getByRole('navigation', { name: 'Legal' });
    expect(
      within(legal).getByRole('link', { name: PRIVACY_CHOICES_LABEL })
    ).toHaveAttribute('href', PRIVACY_CHOICES_HREF);
    for (const link of MARKETING_LEGAL_LINKS) {
      expect(
        within(legal).getByRole('link', { name: link.label })
      ).toHaveAttribute('href', link.href);
    }
  });

  it('renders no theme controls or other buttons', () => {
    render(<RootNotFoundFooter />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
