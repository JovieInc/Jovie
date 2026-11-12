import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DSP_PROVIDER_IDS } from '@/lib/dsp-provider-metadata';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DspProviderIcon, PROVIDER_LABELS } from './DspProviderIcon';

describe('DspProviderIcon', () => {
  it('names every provider from the DSP registry', () => {
    for (const provider of DSP_PROVIDER_IDS) {
      expect(PROVIDER_LABELS[provider]).toBeTruthy();
    }
  });

  it('labels a streaming provider icon and hides the text label by default', async () => {
    const { container } = render(<DspProviderIcon provider='spotify' />);
    expect(screen.getByTitle('Spotify')).toBeInTheDocument();
    expect(screen.queryByText('Spotify')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('shows the label beside a non-streaming provider fallback icon', async () => {
    const { container } = render(
      <DspProviderIcon provider='genius' showLabel size='lg' />
    );
    expect(screen.getByText(PROVIDER_LABELS.genius)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders every provider with its label accessibly', async () => {
    const { container } = render(
      <div>
        {DSP_PROVIDER_IDS.map(provider => (
          <DspProviderIcon key={provider} provider={provider} showLabel />
        ))}
      </div>
    );
    for (const provider of DSP_PROVIDER_IDS) {
      expect(screen.getByText(PROVIDER_LABELS[provider])).toBeInTheDocument();
    }
    await expectNoA11yViolations(container);
  });

  it('stays accessible right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <DspProviderIcon provider='apple_music' showLabel />
      </div>
    );
    expect(screen.getByText(PROVIDER_LABELS.apple_music)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
