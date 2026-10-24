import { LoadingSkeleton } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

// All three workspaces compose the canonical primitive inside their final layout.
describe('workspace Skeleton', () => {
  it('keeps the loading announcement on its owner and placeholders decorative', () => {
    const { container, rerender } = render(
      <section aria-label='Workspace'>
        <button type='button'>Refresh</button>
        <div role='status' aria-label='Loading content'>
          <LoadingSkeleton announce={false} height='h-5' width='w-48' />
          <LoadingSkeleton announce={false} />
        </div>
      </section>
    );
    const workspace = screen.getByRole('region');
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    expect(screen.getAllByRole('status')).toHaveLength(1);
    const placeholders = container.querySelectorAll('[data-slot="skeleton"]');
    expect(placeholders).toHaveLength(2);
    for (const placeholder of placeholders) {
      expect(placeholder).toHaveAttribute('aria-hidden', 'true');
      expect(placeholder).toHaveAttribute('data-state', 'shimmer');
    }
    rerender(
      <section aria-label='Workspace'>
        <button type='button'>Refresh</button>
        <p>Loaded content</p>
      </section>
    );
    expect(screen.getByRole('region')).toBe(workspace);
    expect(screen.getByRole('button', { name: 'Refresh' })).toBe(refresh);
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();
  });
});
