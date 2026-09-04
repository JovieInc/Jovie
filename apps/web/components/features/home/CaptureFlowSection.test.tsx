import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CaptureFlowSection } from './CaptureFlowSection';

describe('CaptureFlowSection', () => {
  it('renders bounded capture and return-visit copy', () => {
    render(<CaptureFlowSection />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'New fans subscribe. Returning fans listen.',
      })
    ).toHaveClass('line-clamp-2');
    expect(screen.getByText('First visit')).toBeInTheDocument();
    expect(screen.getByText('Return visit')).toBeInTheDocument();
  });
});
