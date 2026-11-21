import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DSP_LOGO_CONFIG, DspLogo, DspServiceIcon } from './DspLogo';

describe('DspLogo', () => {
  it('renders a muted System B platform logo with tokenized brand color', async () => {
    const { container } = render(<DspLogo provider='spotify' />);

    const logo = screen.getByText('Spotify').closest('.system-b-dsp-logo');

    expect(logo).toHaveStyle({
      '--system-b-dsp-logo-brand-color': 'var(--color-brand-spotify)',
      '--system-b-dsp-logo-icon-size': '20px',
      '--system-b-dsp-logo-label-size': '15px',
    });
    expect(logo?.querySelector('svg')).toHaveClass('system-b-dsp-logo-icon');
    expect(screen.getByText('Spotify')).toHaveClass('system-b-dsp-logo-label');
    await expectNoA11yViolations(container);
  });

  it('keeps exported DSP colors on design tokens, not raw brand hex values', () => {
    expect(DSP_LOGO_CONFIG.spotify.color).toBe('var(--color-brand-spotify)');
    expect(DSP_LOGO_CONFIG.tidal.color).toBe('var(--color-text-primary-token)');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const source = readFileSync(resolve(__dirname, 'DspLogo.tsx'), 'utf8');

    expect(source).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
  });

  it('scales the icon and label from the height prop', () => {
    render(<DspLogo height={32} provider='apple_music' />);

    const logo = screen.getByText('Apple Music').closest('.system-b-dsp-logo');

    expect(logo).toHaveStyle({
      '--system-b-dsp-logo-brand-color': 'var(--color-brand-apple)',
      '--system-b-dsp-logo-icon-size': '32px',
      '--system-b-dsp-logo-label-size': '24px',
    });
  });

  it('renders nothing for an unmapped provider', () => {
    const { container } = render(<DspLogo provider='amazon' />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('DspServiceIcon', () => {
  it('renders DSP_LOGO_CONFIG path with System B brand class and skips unknowns', () => {
    const { container, rerender } = render(
      <DspServiceIcon provider='spotify' />
    );
    const svg = container.querySelector('svg[data-dsp-icon="spotify"]');
    expect(svg?.querySelector('path')).toHaveAttribute(
      'd',
      DSP_LOGO_CONFIG.spotify.iconPath
    );
    expect(svg).toHaveClass('system-b-dsp-service-icon');
    expect(svg).toHaveAttribute('data-dsp-icon', 'spotify');
    rerender(<DspServiceIcon provider='not-a-dsp' />);
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps a single style={} in DspLogo.tsx (System B inline-style ratchet)', () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const source = readFileSync(resolve(__dirname, 'DspLogo.tsx'), 'utf8');
    const styleHits = source.match(/style=\{/g) ?? [];
    expect(styleHits).toHaveLength(1);
  });
});
