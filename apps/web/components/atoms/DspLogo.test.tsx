import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DSP_LOGO_CONFIG, DspLogo } from './DspLogo';

describe('DspLogo', () => {
  it('renders a muted System B platform logo with tokenized brand color', () => {
    render(<DspLogo provider='spotify' />);

    const logo = screen.getByText('Spotify').closest('.system-b-dsp-logo');

    expect(logo).toHaveStyle({
      '--system-b-dsp-logo-brand-color': 'var(--color-brand-spotify)',
      '--system-b-dsp-logo-icon-size': '20px',
      '--system-b-dsp-logo-label-size': '15px',
    });
    expect(logo?.querySelector('svg')).toHaveClass('system-b-dsp-logo-icon');
    expect(screen.getByText('Spotify')).toHaveClass('system-b-dsp-logo-label');
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

  it('can render the canonical mark without a duplicate visible label', () => {
    const { container } = render(
      <DspLogo provider='spotify' showLabel={false} />
    );

    expect(container.querySelector('.system-b-dsp-logo-icon')).toBeVisible();
    expect(container.querySelector('.system-b-dsp-logo-label')).toBeNull();
  });

  it('can render the registry brand color at full emphasis', () => {
    const { container } = render(
      <DspLogo provider='spotify' emphasis='brand' showLabel={false} />
    );

    const logo = container.querySelector('.system-b-dsp-logo');
    const icon = container.querySelector('.system-b-dsp-logo-icon');
    expect(logo).toHaveStyle({
      color: 'var(--color-brand-spotify)',
      display: 'inline-flex',
    });
    expect(icon).toHaveStyle({
      width: '20px',
      height: '20px',
    });
  });

  it('renders nothing for an unmapped provider', () => {
    const { container } = render(<DspLogo provider='amazon' />);
    expect(container).toBeEmptyDOMElement();
  });
});
