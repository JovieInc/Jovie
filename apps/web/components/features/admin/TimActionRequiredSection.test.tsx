import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
    expect(screen.getByText('Nothing needs you.')).toBeInTheDocument();
    expect(screen.queryByText('Needs Tim')).not.toBeInTheDocument();
  });

  it('does not keep raw red-* priority/overdue classes in source (JOV-6773)', () => {
    const source = readFileSync(
      resolve(__dirname, './TimActionRequiredSection.tsx'),
      'utf8'
    );
    expect(source).not.toMatch(/\bred-\d/);
    expect(source).toContain('text-error');
  });
});
