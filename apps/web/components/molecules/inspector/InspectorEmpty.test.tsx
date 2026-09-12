import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InspectorEmpty } from './InspectorEmpty';

describe('InspectorEmpty', () => {
  it('renders an inline note with the standard test id', () => {
    render(<InspectorEmpty message='No assets for this object.' />);

    expect(screen.getByTestId('inspector-empty')).toHaveTextContent(
      'No assets for this object.'
    );
  });
});
