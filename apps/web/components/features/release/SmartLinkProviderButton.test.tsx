import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  SMART_LINK_PRIMARY_PROVIDER_BUTTON_CLASSNAME,
  SMART_LINK_SECONDARY_PROVIDER_BUTTON_CLASSNAME,
  SmartLinkProviderButton,
} from './SmartLinkProviderButton';

const SECONDARY_REST_FILL_TOKENS = [
  'bg-white/10',
  'bg-white/15',
  'bg-surface-1',
  'bg-surface-2',
  'bg-btn-secondary',
  'backdrop-blur-sm',
] as const;

const MOTION_TOKENS = [
  'hover:scale',
  'active:scale',
  'hover:-translate',
  'hover:translate',
  'animate-bounce',
  'transition-transform',
] as const;

const CONSUMER_PATHS = [
  'components/features/home/SeeItInActionCarousel.tsx',
  'components/features/home/ReleasePhoneContent.tsx',
  'components/features/home/AutomaticReleaseSmartlinksSection.tsx',
  'components/features/profile/StaticListenInterface.tsx',
  'app/r/[slug]/ReleaseLandingPage.tsx',
  'app/[username]/[slug]/sounds/SoundsLandingPage.tsx',
] as const;

describe('SmartLinkProviderButton', () => {
  it('exposes the canonical provider key for a non-Spotify action', () => {
    render(
      <SmartLinkProviderButton
        label='Apple Music'
        providerKey='apple_music'
        onClick={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Open Apple Music' })
    ).toHaveAttribute('data-dsp-provider', 'apple_music');
  });

  it('keeps secondary DSP rows transparent at rest with tokenized interaction fills only', () => {
    render(
      <SmartLinkProviderButton
        label='Apple Music'
        providerKey='apple_music'
        onClick={vi.fn()}
      />
    );

    const button = screen.getByRole('button', { name: 'Open Apple Music' });
    expect(button).toHaveClass('bg-transparent');
    expect(button).toHaveClass('min-h-11');
    expect(button).toHaveClass('hover:bg-interactive-hover');
    expect(button).toHaveClass('focus-visible:bg-interactive-hover');
    expect(button).toHaveClass('active:bg-interactive-active');
    expect(button).toHaveClass('transition-colors');
    expect(button).toHaveClass('duration-subtle');
    expect(button).not.toHaveClass('bg-white/10');
    expect(button).not.toHaveClass('hover:bg-white/15');
    expect(button).not.toHaveClass('backdrop-blur-sm');
    expect(button.className).not.toMatch(
      /(?:^|\s)(?:hover:scale|active:scale|hover:-?translate|animate-bounce|transition-transform)(?:\s|$)/
    );
  });

  it('does not apply the secondary transparency rule to the primary Stream Now CTA', () => {
    render(
      <SmartLinkProviderButton
        label='Stream Now'
        providerKey='spotify'
        href='https://open.spotify.com'
        primary
      />
    );

    const link = screen.getByRole('link', { name: 'Open Stream Now' });
    expect(link).toHaveClass('bg-btn-primary');
    expect(link).toHaveClass('min-h-13');
    expect(link).not.toHaveClass('bg-transparent');
    expect(link).not.toHaveClass('hover:bg-interactive-hover');
  });

  it('locks the secondary class contract against a persistent rest fill', () => {
    expect(SMART_LINK_SECONDARY_PROVIDER_BUTTON_CLASSNAME).toContain(
      'bg-transparent'
    );
    expect(SMART_LINK_SECONDARY_PROVIDER_BUTTON_CLASSNAME).toContain(
      'hover:bg-interactive-hover'
    );
    expect(SMART_LINK_SECONDARY_PROVIDER_BUTTON_CLASSNAME).toContain(
      'focus-visible:bg-interactive-hover'
    );
    expect(SMART_LINK_SECONDARY_PROVIDER_BUTTON_CLASSNAME).toContain(
      'active:bg-interactive-active'
    );
    expect(SMART_LINK_SECONDARY_PROVIDER_BUTTON_CLASSNAME).toContain(
      'min-h-11'
    );
    expect(SMART_LINK_SECONDARY_PROVIDER_BUTTON_CLASSNAME).toContain(
      'transition-colors'
    );
    expect(SMART_LINK_SECONDARY_PROVIDER_BUTTON_CLASSNAME).not.toContain(
      'transition-['
    );

    for (const token of SECONDARY_REST_FILL_TOKENS) {
      expect(SMART_LINK_SECONDARY_PROVIDER_BUTTON_CLASSNAME).not.toContain(
        token
      );
    }
    for (const token of MOTION_TOKENS) {
      expect(SMART_LINK_SECONDARY_PROVIDER_BUTTON_CLASSNAME).not.toContain(
        token
      );
    }

    expect(SMART_LINK_PRIMARY_PROVIDER_BUTTON_CLASSNAME).toContain(
      'bg-btn-primary'
    );
    expect(SMART_LINK_PRIMARY_PROVIDER_BUTTON_CLASSNAME).not.toContain(
      'bg-transparent'
    );
  });

  it('keeps listen and marketing SmartLink consumers from reintroducing a rest fill', () => {
    const webRoot = resolve(__dirname, '../../..');

    for (const relativePath of CONSUMER_PATHS) {
      const source = readFileSync(resolve(webRoot, relativePath), 'utf8');
      expect(source).not.toMatch(
        /SmartLinkProviderButton[\s\S]{0,400}className=['"][^'"]*(?:bg-white\/10|bg-surface-1|hover:bg-white\/15)/
      );
    }
  });
});
