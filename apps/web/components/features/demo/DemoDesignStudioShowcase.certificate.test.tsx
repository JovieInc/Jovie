import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DemoDesignStudioShowcase } from './DemoDesignStudioShowcase';

vi.mock('@/lib/design-studio/registry', () => ({
  getDesignStudioItem: (id: string) =>
    id === 'lyrics-view'
      ? {
          preview: () => (
            <section aria-label='Lyrics'>
              <h1>Lyrics preview</h1>
              <p>Line one of the song</p>
            </section>
          ),
        }
      : undefined,
}));

describe('DemoDesignStudioShowcase certificate', () => {
  it('renders the registered preview axe-clean in its test frame', async () => {
    const { container } = render(
      <DemoDesignStudioShowcase itemId='lyrics-view' testId='lyrics-preview' />
    );

    const frame = screen.getByTestId('lyrics-preview');
    expect(frame).toContainElement(
      screen.getByRole('region', { name: 'Lyrics' })
    );
    expect(
      screen.getByRole('heading', { name: 'Lyrics preview' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
