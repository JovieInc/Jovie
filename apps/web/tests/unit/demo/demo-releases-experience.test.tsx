import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const runDemoAction = vi.fn(() => Promise.resolve());

vi.mock('@/components/demo/demo-actions', () => ({
  runDemoAction,
}));

const { DemoReleasesExperience } = await import(
  '@/components/demo/DemoReleasesExperience'
);

describe('DemoReleasesExperience', () => {
  it('renders fixture data and opens the selected release in the drawer', () => {
    render(<DemoReleasesExperience />);

    expect(screen.getByText('Release matrix')).toBeInTheDocument();
    expect(screen.getAllByText('Night Drive').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('Static Skies'));

    expect(screen.getAllByText('Static Skies').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('Apple Music link is missing and requires attention.')
        .length
    ).toBeGreaterThan(0);
  });

  it('triggers no-op actions for primary demo controls', () => {
    render(<DemoReleasesExperience />);

    fireEvent.click(screen.getByRole('button', { name: 'Add release' }));

    expect(runDemoAction).toHaveBeenCalledWith(
      expect.objectContaining({
        successMessage: expect.stringContaining('Draft created locally'),
      })
    );
  });
});
