import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ImportProgressBanner } from '@/components/dashboard/organisms/release-provider-matrix/ImportProgressBanner';

describe('ImportProgressBanner', () => {
  it('renders compact import status copy', () => {
    render(
      <ImportProgressBanner artistName='The 1975' importedCount={12} compact />
    );

    expect(screen.getByText('Importing The 1975')).toBeInTheDocument();
    expect(screen.getByText('· 12')).toBeInTheDocument();
  });
});
