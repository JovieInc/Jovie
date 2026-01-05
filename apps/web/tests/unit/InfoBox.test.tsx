import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InfoBox } from '@/components/molecules/InfoBox';

describe('InfoBox', () => {
  it('renders title and content with default styling', () => {
    render(
      <InfoBox title='Information'>
        <p>Test content</p>
      </InfoBox>
    );

    const container = screen.getByText('Information').closest('div');
    expect(screen.getByText('Information')).toBeInTheDocument();
    expect(screen.getByText('Test content')).toBeInTheDocument();
    expect(container).toHaveClass('bg-blue-50', 'border-blue-200');
  });

  it('applies variant styling when provided', () => {
    render(
      <InfoBox title='Error' variant='error'>
        <p>Something went wrong</p>
      </InfoBox>
    );

    const container = screen.getByText('Error').closest('div');
    expect(container).toHaveClass('bg-red-50', 'border-red-200');
  });

  it('renders without a title when omitted', () => {
    render(
      <InfoBox>
        <p>Content only</p>
      </InfoBox>
    );

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('Content only')).toBeInTheDocument();
  });

  it('merges custom className into the container', () => {
    render(
      <InfoBox className='custom-info'>
        <p>Custom content</p>
      </InfoBox>
    );

    // Find the outer container (has rounded-lg border p-4 from InfoBox)
    const container = screen
      .getByText('Custom content')
      .closest('div')?.parentElement;
    expect(container).toHaveClass('custom-info');
  });
});
