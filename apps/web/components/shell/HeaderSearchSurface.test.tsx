import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HeaderSearchAdapter } from '@/contexts/HeaderActionsContext';
import { HeaderSearchSurface } from './HeaderSearchSurface';

function createAdapter(
  overrides: Partial<HeaderSearchAdapter> = {}
): HeaderSearchAdapter {
  return {
    key: 'releases',
    pills: [],
    onPillsChange: vi.fn(),
    artistOptions: ['Frank Ocean'],
    titleOptions: ['Pyramids'],
    albumOptions: ['Channel Orange'],
    totalCount: 12,
    visibleCount: 8,
    triggerLabel: 'Search Releases',
    ...overrides,
  };
}

describe('HeaderSearchSurface', () => {
  it('keeps the closed trigger on the compact header height', () => {
    render(
      <HeaderSearchSurface
        adapter={createAdapter()}
        isOpen={false}
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Search Releases' });
    expect(trigger.className).toContain('h-7');
    expect(trigger.className).toContain('min-h-7');
    expect(trigger.className).toContain('justify-start');
    expect(trigger.className).toContain('text-left');
  });

  it('keeps the open search surface on the same compact header height', () => {
    const { container } = render(
      <HeaderSearchSurface
        adapter={createAdapter()}
        isOpen
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const surface = container.firstElementChild;
    expect(surface?.className).toContain('h-7');
    expect(surface?.className).toContain('min-h-7');
    expect(surface?.className).toContain('items-center');
    expect(surface?.className).toContain('justify-start');
    expect(surface?.className).toContain('text-left');
    expect(screen.getByLabelText('Filter Search Releases')).toBeInTheDocument();
  });
});
