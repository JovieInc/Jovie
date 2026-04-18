import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ImportProgressBanner } from '@/features/dashboard/organisms/release-provider-matrix/ImportProgressBanner';

describe('ImportProgressBanner', () => {
  it('renders compact import status with total when known', () => {
    render(
      <ImportProgressBanner
        artistName='The 1975'
        importedCount={12}
        totalCount={30}
        compact
      />
    );

    expect(screen.getByText('Importing The 1975')).toBeInTheDocument();
    expect(screen.getByText('· 12/30')).toBeInTheDocument();
  });

  it('renders compact import status without total when unknown', () => {
    render(
      <ImportProgressBanner
        artistName='The 1975'
        importedCount={12}
        totalCount={0}
        compact
      />
    );

    expect(screen.getByText('Importing The 1975')).toBeInTheDocument();
    expect(screen.getByText('· 12')).toBeInTheDocument();
  });
});
