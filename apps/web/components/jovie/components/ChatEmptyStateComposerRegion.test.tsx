import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHAT_EMPTY_HEADING,
  CHAT_EMPTY_ROTATE_SAMPLES,
  CHAT_EMPTY_SAMPLE_STORAGE_KEY,
  DESKTOP_CONTENT_GRID_ANCHOR,
} from '../chat-empty-starters';
import { ChatEmptyStateComposerRegion } from './ChatEmptyStateComposerRegion';

describe('ChatEmptyStateComposerRegion', () => {
  beforeEach(() => {
    sessionStorage.removeItem(CHAT_EMPTY_SAMPLE_STORAGE_KEY);
  });

  it('renders Just ask and a role-neutral executable sample, with no brand logo', () => {
    const onSelectSample = vi.fn();
    render(
      <ChatEmptyStateComposerRegion onSelectSample={onSelectSample}>
        <div data-testid='composer-child' />
      </ChatEmptyStateComposerRegion>
    );

    expect(screen.queryByTestId('chat-empty-state-logo')).toBeNull();
    expect(screen.getByTestId('chat-empty-state-greeting').textContent).toBe(
      CHAT_EMPTY_HEADING
    );
    expect(screen.queryByText(/artist/i)).toBeNull();
    expect(screen.getByTestId('chat-empty-state-sample-user').textContent).toBe(
      CHAT_EMPTY_ROTATE_SAMPLES[0].prompt
    );
    expect(
      screen.getByTestId('chat-empty-state-sample-reply').textContent
    ).toBe(CHAT_EMPTY_ROTATE_SAMPLES[0].reply);

    fireEvent.click(
      screen.getByRole('button', { name: 'Ask “Plan my next release”' })
    );
    expect(onSelectSample).toHaveBeenCalledExactlyOnceWith(
      CHAT_EMPTY_ROTATE_SAMPLES[0].prompt
    );
    expect(onSelectSample).toHaveBeenCalledWith(
      screen
        .getByTestId('chat-empty-state-sample')
        .getAttribute('data-sample-prompt')
    );
  });

  it('rotates the sample conversation across empty-chat mounts', () => {
    const { unmount } = render(
      <ChatEmptyStateComposerRegion onSelectSample={vi.fn()}>
        <div data-testid='composer-child' />
      </ChatEmptyStateComposerRegion>
    );
    expect(screen.getByTestId('chat-empty-state-sample-user').textContent).toBe(
      CHAT_EMPTY_ROTATE_SAMPLES[0].prompt
    );
    unmount();

    render(
      <ChatEmptyStateComposerRegion onSelectSample={vi.fn()}>
        <div data-testid='composer-child' />
      </ChatEmptyStateComposerRegion>
    );
    expect(screen.getByTestId('chat-empty-state-sample-user').textContent).toBe(
      CHAT_EMPTY_ROTATE_SAMPLES[1].prompt
    );
  });

  it("never ships What's next? or persona framing as the empty heading", () => {
    render(
      <ChatEmptyStateComposerRegion>
        <div data-testid='composer-child' />
      </ChatEmptyStateComposerRegion>
    );

    expect(screen.queryByText("What's next?")).toBeNull();
    expect(screen.queryByText("What's next, Tim?")).toBeNull();
    expect(screen.queryByText(/artist/i)).toBeNull();
    expect(screen.getByTestId('chat-empty-state-greeting').textContent).toBe(
      'Just ask'
    );
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

  it('fills the docked scroll region with Just ask without stacking a second top gap', () => {
    const onSelectSample = vi.fn();
    render(
      <ChatEmptyStateComposerRegion
        stableDocked
        showDockedWelcome
        onSelectSample={onSelectSample}
      >
        <div data-testid='composer-child' />
      </ChatEmptyStateComposerRegion>
    );

    const region = screen.getByTestId('chat-empty-state-composer-region');
    expect(region).toHaveAttribute('data-layout', 'docked');
    expect(region).toHaveAttribute(
      'data-grid-anchor',
      DESKTOP_CONTENT_GRID_ANCHOR
    );
    expect(region).toHaveAttribute('data-top-spacing-owner', 'none');
    expect(region.className).toContain('pt-0');
    expect(region.className).not.toContain('py-4');
    expect(region.className).not.toContain('py-8');
    // Composer keeps its bottom-dock geometry — welcome never shifts it.
    expect(
      screen.getByTestId('chat-empty-state-centered-composer')
    ).toHaveAttribute('data-dock', 'bottom');
    expect(
      screen.getByTestId('chat-empty-state-centered-composer')
    ).toHaveAttribute('data-grid-anchor', DESKTOP_CONTENT_GRID_ANCHOR);

    const aboveScroll = screen.getByTestId('chat-empty-state-above-scroll');
    expect(aboveScroll.className).not.toContain('absolute');
    const welcome = screen.getByTestId('chat-empty-state-welcome');
    expect(welcome.className).toContain('items-center');
    expect(welcome.className).toContain('min-h-40');
    expect(welcome.className).toContain('shrink-0');
    expect(screen.getByRole('heading', { name: 'Just ask' })).toBeTruthy();
    expect(screen.queryByTestId('chat-empty-state-logo')).toBeNull();
    expect(screen.getByTestId('chat-empty-state-greeting').textContent).toBe(
      'Just ask'
    );
    expect(screen.getByTestId('chat-empty-state-sample-user').textContent).toBe(
      CHAT_EMPTY_ROTATE_SAMPLES[0].prompt
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

  it('preserves focus order from the sample into the composer', () => {
    render(
      <ChatEmptyStateComposerRegion onSelectSample={vi.fn()}>
        <button type='button'>Composer</button>
      </ChatEmptyStateComposerRegion>
    );

    const sample = screen.getByTestId('chat-empty-state-sample-button');
    const composer = screen.getByRole('button', { name: 'Composer' });
    sample.focus();
    expect(sample).toHaveFocus();
    composer.focus();
    expect(composer).toHaveFocus();
  });
});
