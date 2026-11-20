import { Button } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ContentSectionHeader } from './ContentSectionHeader';

describe('ContentSectionHeader', () => {
  it('renders an h2 section heading by default and an h1 for routes', () => {
    const { rerender } = render(<ContentSectionHeader title='Catalog' />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Catalog'
    );

    rerender(<ContentSectionHeader title='All artists' headingLevel='h1' />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'All artists'
    );
  });

  it('omits the subtitle and actions slots when they are not given', () => {
    const { container } = render(<ContentSectionHeader title='Catalog' />);
    expect(container.querySelectorAll('p')).toHaveLength(0);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('truncates a long title so it never pushes the actions off the row', () => {
    render(
      <ContentSectionHeader title='A very long section title' actions='x' />
    );
    expect(screen.getByRole('heading')).toHaveClass('truncate');
  });

  it('keeps its actions operable without axe violations', async () => {
    const onReview = vi.fn();
    const { container } = render(
      <ContentSectionHeader
        title='Campaign controls'
        subtitle='Compact and responsive.'
        density='compact'
        actions={<Button onClick={onReview}>Review</Button>}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(onReview).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Compact and responsive.')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
