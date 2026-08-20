import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ValidationStatusIcon } from './ValidationStatusIcon';

const defaultProps = {
  showAvailability: true,
  checking: false,
  available: false,
  clientValid: true,
  hasError: false,
};

describe('ValidationStatusIcon', () => {
  it('uses the canonical muted spinner while checking availability', () => {
    render(<ValidationStatusIcon {...defaultProps} checking />);
    const spinner = screen.getByRole('status', { name: 'Loading' });
    expect(spinner).toHaveAttribute('data-size', 'sm');
    expect(spinner).toHaveAttribute('data-tone', 'muted');
  });

  it('renders no status when availability is hidden', () => {
    const { container } = render(
      <ValidationStatusIcon {...defaultProps} showAvailability={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
