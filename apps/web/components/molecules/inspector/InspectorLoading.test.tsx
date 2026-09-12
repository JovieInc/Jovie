import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InspectorLoading } from './InspectorLoading';

describe('InspectorLoading', () => {
  it('renders the requested number of skeleton rows', () => {
    render(<InspectorLoading rows={3} />);

    expect(screen.getByTestId('inspector-loading')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(screen.getByText('Loading inspector')).toBeInTheDocument();
  });
});
