import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { type ClusterChip, ClusterFilterChips } from './ClusterFilterChips';

const CLUSTERS: ClusterChip[] = [
  { slug: 'streaming', displayName: 'Streaming' },
  { slug: 'social', displayName: 'Social' },
  { slug: 'press', displayName: 'Press' },
];

describe('ClusterFilterChips', () => {
  it('renders nothing when there are no clusters', async () => {
    const { container } = render(
      <ClusterFilterChips clusters={[]} selectedSlugs={[]} onChange={vi.fn()} />
    );
    expect(screen.queryByTestId('cluster-filter-chips')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('presses All when nothing is filtered and adds a cluster on click', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ClusterFilterChips
        clusters={CLUSTERS}
        selectedSlugs={[]}
        onChange={onChange}
      />
    );
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Social' }));
    expect(onChange).toHaveBeenCalledWith(['social']);
  });

  it('removes a selected cluster and clears every filter from All', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ClusterFilterChips
        clusters={CLUSTERS}
        selectedSlugs={['social', 'press']}
        onChange={onChange}
      />
    );
    expect(screen.getByRole('button', { name: 'Social' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Social' }));
    expect(onChange).toHaveBeenLastCalledWith(['press']);
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
