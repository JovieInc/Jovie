import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimActionRequiredSection } from './TimActionRequiredSection';

describe('TimActionRequiredSection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('labels founder decisions as Needs You', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          issues: [],
          fetchedAt: '2026-09-27T00:00:00.000Z',
          available: true,
          observation: 'empty',
          errorMessage: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    render(<TimActionRequiredSection />);

    expect(await screen.findByText('Needs You')).toBeInTheDocument();
    expect(screen.getByText('Nothing needs Tim.')).toBeInTheDocument();
    expect(screen.queryByText('Needs Tim')).not.toBeInTheDocument();
  });
});
