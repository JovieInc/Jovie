import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingChatEmptyIntro } from '@/components/features/onboarding/OnboardingChatEmptyIntro';
import {
  ONBOARDING_ENTRY_SUPPORT,
  ONBOARDING_ENTRY_TITLE,
  ONBOARDING_STARTER_SUGGESTIONS,
} from '@/lib/onboarding/empty-state';

describe('OnboardingChatEmptyIntro', () => {
  it('renders concise entry copy, composer, and stable starters', () => {
    const onSelectSuggestion = vi.fn();

    render(
      <OnboardingChatEmptyIntro
        composer={<div data-testid='test-composer' />}
        mode='blank'
        onSelectSuggestion={onSelectSuggestion}
      />
    );

    expect(screen.getByTestId('onboarding-empty-intro')).toBeTruthy();
    expect(screen.getByText(ONBOARDING_ENTRY_TITLE)).toBeTruthy();
    expect(screen.getByText(ONBOARDING_ENTRY_SUPPORT)).toBeTruthy();
    expect(screen.getByTestId('test-composer')).toBeTruthy();
    expect(screen.getByTestId('onboarding-starter-suggestions')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-sign-in-skip')).toBeNull();
    expect(
      screen.getByTestId('onboarding-starter-suggestions').parentElement
    ).toHaveClass('min-h-[7.5rem]');

    for (const suggestion of ONBOARDING_STARTER_SUGGESTIONS) {
      expect(
        screen.getByRole('button', { name: suggestion.label })
      ).toBeTruthy();
    }
  });

  it('submits the selected starter prompt', () => {
    const onSelectSuggestion = vi.fn();
    const [firstSuggestion] = ONBOARDING_STARTER_SUGGESTIONS;

    render(
      <OnboardingChatEmptyIntro
        composer={<div />}
        mode='blank'
        onSelectSuggestion={onSelectSuggestion}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: firstSuggestion.label })
    );

    expect(onSelectSuggestion).toHaveBeenCalledWith(firstSuggestion.prompt);
  });

  it('dims suggestions while the slash picker is open', () => {
    const { container } = render(
      <OnboardingChatEmptyIntro
        composer={<div />}
        mode='blank'
        onSelectSuggestion={vi.fn()}
        dimmed
      />
    );

    const suggestions = container.querySelector(
      '[data-testid="onboarding-starter-suggestions"]'
    );
    expect(suggestions?.className).toContain('opacity-0');
    expect(suggestions?.getAttribute('inert')).not.toBeNull();
  });

  it('replaces blank controls with one stable handoff status', () => {
    render(
      <OnboardingChatEmptyIntro
        composer={<div data-testid='test-composer' />}
        mode='spotify_handoff'
        onSelectSuggestion={vi.fn()}
      />
    );

    expect(screen.getByText('Getting Your Artist Ready')).toBeTruthy();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Preparing your first message'
    );
    expect(screen.queryByTestId('onboarding-starter-suggestions')).toBeNull();
    expect(screen.queryByTestId('onboarding-sign-in-skip')).toBeNull();
  });
});
