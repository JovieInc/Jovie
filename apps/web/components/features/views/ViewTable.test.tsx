import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ViewTable } from './ViewTable';

describe('ViewTable', () => {
  it('renders headers and cells as text', () => {
    render(
      <ViewTable
        caption='Fans'
        columns={[
          { key: 'city', label: 'City' },
          { key: 'fans', label: 'Fans' },
        ]}
        rows={[{ city: '<b>LA</b>', fans: 120 }]}
      />
    );
    expect(screen.getByText('City')).toBeInTheDocument();
    expect(screen.getByText('<b>LA</b>')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
  });
});
