import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingChatEmptyIntro } from '@/components/features/onboarding/OnboardingChatEmptyIntro';
import {
  ONBOARDING_STARTER_SUGGESTIONS,
  ONBOARDING_WELCOME_MESSAGE,
} from '@/lib/onboarding/empty-state';

vi.mock('@/components/jovie/components', () => ({
  ChatMessage: ({
    parts,
  }: {
    readonly parts: Array<{ type: 'text'; text: string }>;
  }) => (
    <div data-testid='chat-message'>
      {parts.map(part => part.text).join('')}
    </div>
  ),
}));

describe('OnboardingChatEmptyIntro', () => {
  it('renders welcome message, starter cards, and sign-in skip', () => {
    const onSelectSuggestion = vi.fn();

    render(
      <OnboardingChatEmptyIntro onSelectSuggestion={onSelectSuggestion} />
    );

    expect(screen.getByTestId('onboarding-empty-intro')).toBeTruthy();
    expect(screen.getByText(ONBOARDING_WELCOME_MESSAGE)).toBeTruthy();
    expect(screen.getByTestId('onboarding-starter-suggestions')).toBeTruthy();
    expect(screen.getByTestId('onboarding-sign-in-skip')).toHaveAttribute(
      'href',
      '/signin'
    );

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
      <OnboardingChatEmptyIntro onSelectSuggestion={onSelectSuggestion} />
    );

    fireEvent.click(
      screen.getByRole('button', { name: firstSuggestion.label })
    );

    expect(onSelectSuggestion).toHaveBeenCalledWith(firstSuggestion.prompt);
  });

  it('dims suggestions while the slash picker is open', () => {
    const { container } = render(
      <OnboardingChatEmptyIntro onSelectSuggestion={vi.fn()} dimmed />
    );

    const suggestions = container.querySelector(
      '[data-testid="onboarding-starter-suggestions"]'
    );
    expect(suggestions?.className).toContain('opacity-0');
    expect(suggestions?.getAttribute('inert')).not.toBeNull();
  });
});
