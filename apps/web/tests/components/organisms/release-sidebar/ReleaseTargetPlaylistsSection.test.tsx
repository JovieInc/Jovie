import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jovie/ui', () => ({
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
}));

vi.mock('@/components/molecules/drawer', () => ({
  DrawerButton: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  DrawerSurfaceCard: ({
    children,
    className,
    testId,
    variant,
  }: {
    children?: React.ReactNode;
    className?: string;
    testId?: string;
    variant?: 'card' | 'flat';
  }) => (
    <div
      className={className}
      data-testid={testId}
      data-surface-variant={variant}
    >
      {children}
    </div>
  ),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const { ReleaseTargetPlaylistsSection } = await import(
  '@/components/organisms/release-sidebar/ReleaseTargetPlaylistsSection'
);

describe('ReleaseTargetPlaylistsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the draft visible and offers retry when save fails', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error('save failed'))
      .mockResolvedValueOnce(undefined);

    render(
      <ReleaseTargetPlaylistsSection
        releaseId='release-1'
        targetPlaylists={['Pollen']}
        onSave={onSave}
      />
    );

    const input = screen.getByTestId(
      'target-playlists-input-release-1'
    ) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'Pollen, Butter');
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Failed to save target playlists. Your draft is still here.'
      );
    });

    expect(input).toHaveValue('Pollen, Butter');
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(2);
    });
  });
});
