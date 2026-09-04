import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { requireMarketingInformationPage } from '@/data/marketingInformationArchitecture';
import { MarketingInformationPage } from './MarketingInformationPage';

it('renders the registered page status, sections, and conversion actions', () => {
  const page = requireMarketingInformationPage(APP_ROUTES.PRODUCT);
  render(<MarketingInformationPage page={page} />);

  expect(
    screen.getByRole('heading', { level: 1, name: page.headline })
  ).toBeVisible();
  expect(screen.getByText(`${page.eyebrow} · Live`)).toBeVisible();
  for (const section of page.sections) {
    expect(
      screen.getByRole('heading', { level: 2, name: section.heading })
    ).toBeVisible();
    expect(screen.getByText(section.body)).toBeVisible();
  }
  expect(screen.getByRole('link', { name: 'Find Yourself' })).toHaveAttribute(
    'href',
    APP_ROUTES.START
  );
  expect(screen.getByRole('link', { name: 'See Pricing' })).toHaveAttribute(
    'href',
    APP_ROUTES.PRICING
  );
});
