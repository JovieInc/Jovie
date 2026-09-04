import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AudienceTableHeader } from './AudienceTableHeader';

type Props = React.ComponentProps<typeof AudienceTableHeader>;

function renderHeader(overrides: Partial<Props> = {}) {
  const onSortChange = vi.fn();
  const result = render(
    <table>
      <AudienceTableHeader
        mode='members'
        sort='visits'
        direction='desc'
        headerCheckboxState={false}
        selectedCount={0}
        headerElevated={false}
        totalCount={12}
        onSortChange={onSortChange}
        onToggleSelectAll={vi.fn()}
        bulkActions={[{ label: 'Export', onClick: vi.fn() }]}
        {...overrides}
      />
    </table>
  );

  return { ...result, onSortChange };
}

describe('AudienceTableHeader', () => {
  it('renders member table headings as bounded one-line cells', () => {
    const { container, onSortChange } = renderHeader();

    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('12 people')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Visits/ }));
    expect(onSortChange).toHaveBeenCalledWith('visits');

    const headings = Array.from(container.querySelectorAll('th'));
    expect(headings.length).toBeGreaterThan(0);
    expect(
      headings.every(heading => heading.className.includes('whitespace-nowrap'))
    ).toBe(true);
  });

  it('switches to subscriber headings without dropping the one-line contract', () => {
    const { container } = renderHeader({
      mode: 'subscribers',
      sort: 'email',
      totalCount: 1,
    });

    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(screen.getByText('1 person')).toBeInTheDocument();
    expect(
      Array.from(container.querySelectorAll('th')).every(heading =>
        heading.className.includes('whitespace-nowrap')
      )
    ).toBe(true);
  });
});
