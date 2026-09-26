import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConnectedReleaseEmptyState } from './ReleaseProviderMatrixNotices';

describe('ConnectedReleaseEmptyState', () => {
  it('uses the banned-icon-safe Layers glyph for the empty-state icon', () => {
    const { container } = render(
      <ConnectedReleaseEmptyState
        visible
        canCreateManualReleases
        isSyncing={false}
        onSync={vi.fn()}
        onCreateManual={vi.fn()}
      />
    );

    expect(screen.getByText('No Releases Yet')).toBeInTheDocument();
    const icon = container.querySelector(
      '[data-testid="releases-empty-state-connected"] svg'
    );
    expect(icon).toHaveClass('lucide-layers');
    expect(icon).not.toHaveClass('lucide-disc-3');
  });

  it('renders nothing when not visible', () => {
    const { container } = render(
      <ConnectedReleaseEmptyState
        visible={false}
        canCreateManualReleases
        isSyncing={false}
        onSync={vi.fn()}
        onCreateManual={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
