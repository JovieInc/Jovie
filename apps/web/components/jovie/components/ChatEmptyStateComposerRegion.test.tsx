import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChatEmptyStateComposerRegion } from './ChatEmptyStateComposerRegion';

describe('ChatEmptyStateComposerRegion', () => {
  it('renders the circle brand logo as ambient texture', () => {
    render(
      <ChatEmptyStateComposerRegion>
        <div data-testid='composer-child' />
      </ChatEmptyStateComposerRegion>
    );

    const logo = screen.getByTestId('chat-empty-state-logo');
    expect(logo.style.opacity).toBe('0.18');
    expect(logo.getAttribute('aria-hidden')).toBe('true');
  });

  it('greets by display name when provided', () => {
    render(
      <ChatEmptyStateComposerRegion greetingName='Tim'>
        <div data-testid='composer-child' />
      </ChatEmptyStateComposerRegion>
    );

    expect(screen.getByTestId('chat-empty-state-greeting').textContent).toBe(
      'Hi, Tim'
    );
  });

  it('falls back to a generic greeting without a display name', () => {
    render(
      <ChatEmptyStateComposerRegion greetingName='  '>
        <div data-testid='composer-child' />
      </ChatEmptyStateComposerRegion>
    );

    expect(screen.getByTestId('chat-empty-state-greeting').textContent).toBe(
      'Hi there'
    );
  });

  it('staggers the enter animation across logo, greeting, and composer', () => {
    render(
      <ChatEmptyStateComposerRegion>
        <div data-testid='composer-child' />
      </ChatEmptyStateComposerRegion>
    );

    const region = screen.getByTestId('chat-empty-state-composer-region');
    expect(region.className).toContain('chat-stagger');
  });

  it('hides the welcome header when an above slot is provided', () => {
    render(
      <ChatEmptyStateComposerRegion above={<div data-testid='above-slot' />}>
        <div data-testid='composer-child' />
      </ChatEmptyStateComposerRegion>
    );

    expect(screen.getByTestId('above-slot')).toBeTruthy();
    expect(screen.queryByTestId('chat-empty-state-logo')).toBeNull();
    expect(screen.queryByTestId('chat-empty-state-greeting')).toBeNull();
  });

  it('docks the composer below a scrollable above slot (no mid-viewport absolute clip)', () => {
    render(
      <ChatEmptyStateComposerRegion
        above={
          <div data-testid='above-slot'>
            <div>First Task Card</div>
            <div>Second Task Card</div>
          </div>
        }
      >
        <div data-testid='composer-child' />
      </ChatEmptyStateComposerRegion>
    );

    const region = screen.getByTestId('chat-empty-state-composer-region');
    expect(region.getAttribute('data-layout')).toBe('docked');
    expect(region.className).toContain('flex-col');
    expect(region.className).not.toContain('justify-center');

    const aboveScroll = screen.getByTestId('chat-empty-state-above-scroll');
    expect(aboveScroll.className).toContain('overflow-y-auto');
    expect(aboveScroll.className).toContain('flex-1');
    // Absolute mid-viewport stacking was the clip source — must not return.
    expect(aboveScroll.className).not.toContain('absolute');
    expect(aboveScroll.className).not.toContain('bottom-1/2');

    const composer = screen.getByTestId('chat-empty-state-centered-composer');
    expect(composer.getAttribute('data-dock')).toBe('bottom');
    expect(composer.className).toContain('shrink-0');
    expect(screen.getByTestId('composer-child')).toBeTruthy();
  });
});
