import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  SMART_LINK_SECONDARY_PROVIDER_BUTTON_CLASSNAME,
  SmartLinkProviderButton,
} from './SmartLinkProviderButton';

describe('SmartLinkProviderButton certificate', () => {
  it('renders the action row as a design-system button that fires its handler', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <SmartLinkProviderButton
        label='Apple Music'
        providerKey='apple_music'
        onClick={onClick}
      />
    );

    const button = screen.getByRole('button', { name: 'Open Apple Music' });
    expect(button).toHaveAttribute('data-slot', 'plain-button');
    expect(button).toHaveAttribute('type', 'button');
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('keeps the disabled row inert', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <SmartLinkProviderButton
        label='Deezer'
        providerKey='deezer'
        onClick={onClick}
        disabled
      />
    );

    const button = screen.getByRole('button', { name: 'Open Deezer' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('outlines secondary rows with the on-media token', async () => {
    const { container } = render(
      <SmartLinkProviderButton
        label='Spotify'
        href='https://open.spotify.com'
        providerKey='spotify'
      />
    );

    expect(SMART_LINK_SECONDARY_PROVIDER_BUTTON_CLASSNAME).toContain(
      'ring-on-media/8'
    );
    expect(screen.getByRole('link', { name: 'Open Spotify' })).toHaveClass(
      'ring-on-media/8'
    );
    await expectNoA11yViolations(container);
  });

  it('renders a static row with no link or handler, a long label and RTL', async () => {
    const label = 'Apple Music Classical with Spatial Audio and Lossless';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <SmartLinkProviderButton label={label} providerKey='apple_music' />
      </div>
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(label)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the primary CTA filled', async () => {
    const { container } = render(
      <SmartLinkProviderButton
        label='Stream Now'
        href='https://open.spotify.com'
        providerKey='spotify'
        primary
      />
    );

    expect(screen.getByRole('link', { name: 'Open Stream Now' })).toHaveClass(
      'bg-btn-primary'
    );
    await expectNoA11yViolations(container);
  });
});
