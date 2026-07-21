import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppFlagProvider, useAppFlag } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';

function FlagProbe({
  flagName,
}: {
  readonly flagName: keyof typeof APP_FLAG_DEFAULTS;
}) {
  const enabled = useAppFlag(flagName);
  return <div data-testid={`flag-${flagName}`}>{String(enabled)}</div>;
}

describe('AppFlagProvider partial snapshots', () => {
  it('mirrors DESIGN_V1 aliases from a trimmed payload', () => {
    render(
      <AppFlagProvider initialFlags={{ DESIGN_V1: false }}>
        <FlagProbe flagName='DESIGN_V1_RELEASES' />
      </AppFlagProvider>
    );

    expect(screen.getByTestId('flag-DESIGN_V1_RELEASES')).toHaveTextContent(
      'false'
    );
  });

  it('falls back to local defaults for flags omitted from the payload', () => {
    render(
      <AppFlagProvider initialFlags={{ DESIGN_V1: true }}>
        <FlagProbe flagName='ALBUM_ART_GENERATION' />
      </AppFlagProvider>
    );

    expect(screen.getByTestId('flag-ALBUM_ART_GENERATION')).toHaveTextContent(
      String(APP_FLAG_DEFAULTS.ALBUM_ART_GENERATION)
    );
  });
});
