import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import CompareIndexPage from './page';

describe('CompareIndexPage', () => {
  it('renders the compare hub heading and links to published comparisons', () => {
    render(<CompareIndexPage />);

    expect(
      screen.getByRole('heading', { name: 'Compare Jovie' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Linktree' })).toHaveAttribute(
      'href',
      `${APP_ROUTES.COMPARE}/linktree`
    );
    expect(screen.getByRole('link', { name: 'Linkfire' })).toHaveAttribute(
      'href',
      `${APP_ROUTES.COMPARE}/linkfire`
    );
  });
});
