import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AlbumArtOptionPicker } from '@/components/features/dashboard/organisms/album-art/AlbumArtOptionPicker';

describe('AlbumArtOptionPicker', () => {
  const baseProps = {
    title: 'Album Art',
    description: 'Generate a new cover.',
    result: null,
    selectedOptionId: null,
    onSelectOption: vi.fn(),
    onGenerate: vi.fn(),
  };

  it('shows the brand kit selector when multiple series templates are available', () => {
    render(
      <AlbumArtOptionPicker
        {...baseProps}
        onUseSeriesTemplate={vi.fn()}
        brandKitOptions={[
          { id: 'brand-kit-default', name: 'Armada', isDefault: true },
          { id: 'brand-kit-alt', name: 'Spinnin', isDefault: false },
        ]}
        selectedBrandKitId='brand-kit-default'
        onSelectBrandKit={vi.fn()}
      />
    );

    expect(screen.getByText('Series Template')).toBeInTheDocument();
    expect(screen.getByText('Armada')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Use Series Template' })
    ).toBeInTheDocument();
  });

  it('hides the brand kit selector when there is only one available template', () => {
    render(
      <AlbumArtOptionPicker
        {...baseProps}
        onUseSeriesTemplate={vi.fn()}
        brandKitOptions={[
          { id: 'brand-kit-default', name: 'Armada', isDefault: true },
        ]}
        selectedBrandKitId='brand-kit-default'
        onSelectBrandKit={vi.fn()}
      />
    );

    expect(screen.queryByText('Series Template')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Use Series Template' })
    ).toBeInTheDocument();
  });
});
