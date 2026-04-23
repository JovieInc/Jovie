import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClusterFilterChips } from '@/components/features/dashboard/release-tasks/ClusterFilterChips';

const CLUSTERS = [
  { slug: 'editorial-pitching', displayName: 'Editorial Pitching' },
  { slug: 'dj-promotion', displayName: 'DJ Promotion' },
  { slug: 'press-epk', displayName: 'Press & EPK' },
];

describe('ClusterFilterChips', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders All + one chip per cluster', () => {
    render(
      <ClusterFilterChips
        clusters={CLUSTERS}
        selectedSlugs={[]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    for (const c of CLUSTERS) {
      expect(screen.getByTestId(`cluster-chip-${c.slug}`)).toBeInTheDocument();
    }
  });

  it('All is selected when no chips are active', () => {
    render(
      <ClusterFilterChips
        clusters={CLUSTERS}
        selectedSlugs={[]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('toggles a chip on click', () => {
    const onChange = vi.fn();
    render(
      <ClusterFilterChips
        clusters={CLUSTERS}
        selectedSlugs={[]}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByTestId('cluster-chip-editorial-pitching'));
    expect(onChange).toHaveBeenCalledWith(['editorial-pitching']);
  });

  it('removes a chip when clicked again', () => {
    const onChange = vi.fn();
    render(
      <ClusterFilterChips
        clusters={CLUSTERS}
        selectedSlugs={['editorial-pitching']}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByTestId('cluster-chip-editorial-pitching'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('All button clears all selections', () => {
    const onChange = vi.fn();
    render(
      <ClusterFilterChips
        clusters={CLUSTERS}
        selectedSlugs={['editorial-pitching', 'dj-promotion']}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('returns nothing when clusters is empty', () => {
    const { container } = render(
      <ClusterFilterChips clusters={[]} selectedSlugs={[]} onChange={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });
});
