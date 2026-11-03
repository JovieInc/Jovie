import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DemoDesignStudioShowcase } from './DemoDesignStudioShowcase';

vi.mock('@/lib/design-studio/registry', () => ({
  getDesignStudioItem: (id: string) =>
    id === 'lyrics-view'
      ? { preview: () => <h1>Lyrics preview</h1> }
      : undefined,
}));

describe('design studio demo preview', () => {
  it('renders the selected registered preview', () => {
    render(
      <DemoDesignStudioShowcase itemId='lyrics-view' testId='lyrics-preview' />
    );
    expect(
      screen.getByRole('heading', { name: 'Lyrics preview' })
    ).toBeVisible();
    expect(screen.getByTestId('lyrics-preview')).toBeVisible();
  });

  it('keeps missing preview IDs fail-closed', () => {
    expect(() =>
      DemoDesignStudioShowcase({ itemId: 'missing', testId: 'missing-preview' })
    ).toThrow('Missing Design Studio item: missing');
  });
});
