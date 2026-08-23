import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';

describe('ContentSectionHeader', () => {
  it('keeps h2 as the default section heading', () => {
    render(<ContentSectionHeader title='Section title' />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Section title' })
    ).toBeInTheDocument();
  });

  it('can provide the route h1 without introducing page-local title markup', () => {
    render(<ContentSectionHeader headingLevel='h1' title='Route title' />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Route title' })
    ).toBeInTheDocument();
  });

  it('keeps compact plain headers action-ready without a second owner', () => {
    render(
      <ContentSectionHeader
        density='compact'
        variant='plain'
        title='Campaign controls'
        subtitle='Compact and responsive without creating a second owner.'
        actions={<button type='button'>Review</button>}
      />
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Campaign controls' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
  });
});
