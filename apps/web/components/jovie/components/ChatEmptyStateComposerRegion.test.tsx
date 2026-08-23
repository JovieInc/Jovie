import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CHAT_EMPTY_GREETING_STORAGE_KEY,
  CHAT_EMPTY_ROTATE_GREETINGS,
} from '../chat-empty-greeting';
import { ChatEmptyStateComposerRegion } from './ChatEmptyStateComposerRegion';

describe('ChatEmptyStateComposerRegion', () => {
  beforeEach(() => {
    sessionStorage.removeItem(CHAT_EMPTY_GREETING_STORAGE_KEY);
  });

  it('renders one locked greeting and no brand logo', () => {
    render(
      <ChatEmptyStateComposerRegion>
        <div data-testid='composer-child' />
      </ChatEmptyStateComposerRegion>
    );

    expect(screen.queryByTestId('chat-empty-state-logo')).toBeNull();
    expect(screen.getByTestId('chat-empty-state-greeting').textContent).toBe(
      "Let's get it"
    );
  });

  it('rotates through the locked set across empty-chat mounts', () => {
    const { unmount } = render(
      <ChatEmptyStateComposerRegion>
        <div data-testid='composer-child' />
      </ChatEmptyStateComposerRegion>
    );
    expect(screen.getByTestId('chat-empty-state-greeting').textContent).toBe(
      CHAT_EMPTY_ROTATE_GREETINGS[0]
    );
    unmount();

    render(
      <ChatEmptyStateComposerRegion>
        <div data-testid='composer-child' />
      </ChatEmptyStateComposerRegion>
    );
    expect(screen.getByTestId('chat-empty-state-greeting').textContent).toBe(
      CHAT_EMPTY_ROTATE_GREETINGS[1]
    );
  });

  it("never ships What's next? as the empty greeting", () => {
    render(
      <ChatEmptyStateComposerRegion>
        <div data-testid='composer-child' />
      </ChatEmptyStateComposerRegion>
    );

    expect(screen.queryByText("What's next?")).toBeNull();
    expect(screen.queryByText("What's next, Tim?")).toBeNull();
  });

  it('staggers the enter animation across greeting and composer', () => {
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

  it('allows a public entry flow to provide its own centered welcome', () => {
    render(
      <ChatEmptyStateComposerRegion hideWelcomeHeader>
        <div data-testid='public-entry'>Public entry</div>
      </ChatEmptyStateComposerRegion>
    );

    const region = screen.getByTestId('chat-empty-state-composer-region');
    expect(region.getAttribute('data-layout')).toBe('centered');
    expect(screen.getByTestId('public-entry')).toBeTruthy();
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

  it('keeps a stable dock while an empty-state affordance is temporarily hidden', () => {
    render(
      <ChatEmptyStateComposerRegion stableDocked>
        <div data-testid='composer-child' />
      </ChatEmptyStateComposerRegion>
    );

    expect(
      screen.getByTestId('chat-empty-state-composer-region')
    ).toHaveAttribute('data-layout', 'docked');
    expect(screen.getByTestId('chat-empty-state-above-scroll')).toBeTruthy();
  });

  it('fills the docked scroll region with the centered welcome when invited', () => {
    render(
      <ChatEmptyStateComposerRegion stableDocked showDockedWelcome>
        <div data-testid='composer-child' />
      </ChatEmptyStateComposerRegion>
    );

    const region = screen.getByTestId('chat-empty-state-composer-region');
    expect(region).toHaveAttribute('data-layout', 'docked');
    // Composer keeps its bottom-dock geometry — welcome never shifts it.
    expect(
      screen.getByTestId('chat-empty-state-centered-composer')
    ).toHaveAttribute('data-dock', 'bottom');

    const aboveScroll = screen.getByTestId('chat-empty-state-above-scroll');
    expect(aboveScroll.className).not.toContain('absolute');
    const welcome = screen.getByTestId('chat-empty-state-welcome');
    expect(welcome.className).toContain('items-center');
    expect(screen.queryByTestId('chat-empty-state-logo')).toBeNull();
    expect(screen.getByTestId('chat-empty-state-greeting').textContent).toBe(
      "Let's get it"
    );
  });

  it('keeps the docked scroll region blank when the welcome is suppressed', () => {
    render(
      <ChatEmptyStateComposerRegion
        stableDocked
        showDockedWelcome
        hideWelcomeHeader
      >
        <div data-testid='composer-child' />
      </ChatEmptyStateComposerRegion>
    );

    expect(screen.queryByTestId('chat-empty-state-welcome')).toBeNull();
    expect(screen.queryByTestId('chat-empty-state-logo')).toBeNull();
    expect(screen.queryByTestId('chat-empty-state-greeting')).toBeNull();
  });
});
