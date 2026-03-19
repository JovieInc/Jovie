import { describe, expect, it, vi } from 'vitest';

import { SuggestedPrompts } from '@/components/jovie/components/SuggestedPrompts';
import { fastRender } from '@/tests/utils/fast-render';

describe('SuggestedPrompts', () => {
  it('renders updated default prompts', () => {
    const onSelect = vi.fn();
    const { getByText, queryByText } = fastRender(
      <SuggestedPrompts onSelect={onSelect} />
    );

    // New defaults
    expect(getByText('Write me a bio')).toBeTruthy();
    expect(getByText('Show my top insights')).toBeTruthy();

    // Removed suggestions should not appear
    expect(queryByText('Change profile photo')).toBeNull();
    expect(queryByText('How do I get paid?')).toBeNull();
    expect(queryByText(/Set up a link/)).toBeNull();
  });

  it('renders first-session prompts without removed suggestions', () => {
    const onSelect = vi.fn();
    const { getByRole, queryByText } = fastRender(
      <SuggestedPrompts
        onSelect={onSelect}
        isFirstSession
        latestReleaseTitle='Midnight Drive'
      />
    );

    // Kept suggestion
    expect(getByRole('button', { name: 'Preview my profile' })).toBeTruthy();

    // Removed suggestions should not appear
    expect(queryByText('How do I get paid?')).toBeNull();
    expect(queryByText(/Set up a link/)).toBeNull();
  });

  it('renders insight-backed prompts when provided', () => {
    const onSelect = vi.fn();
    const { getByRole, queryByText } = fastRender(
      <SuggestedPrompts
        onSelect={onSelect}
        suggestions={[
          {
            icon: 'MessageSquare',
            label: 'Which release is getting traction right now?',
            prompt: 'Which release is getting traction right now?',
            accent: 'blue',
          },
        ]}
      />
    );

    expect(
      getByRole('button', {
        name: 'Which release is getting traction right now?',
      })
    ).toBeTruthy();
    // Default prompts should not appear when custom suggestions are provided
    expect(queryByText('Write me a bio')).toBeNull();
  });

  it('always shows feedback suggestion', () => {
    const onSelect = vi.fn();
    const { getByText } = fastRender(<SuggestedPrompts onSelect={onSelect} />);
    expect(getByText('Share feedback')).toBeTruthy();
  });

  it('calls onSelect with prompt when clicked', () => {
    const onSelect = vi.fn();
    const { getByText } = fastRender(<SuggestedPrompts onSelect={onSelect} />);
    getByText('Write me a bio').closest('button')?.click();
    expect(onSelect).toHaveBeenCalledWith('Write me an artist bio.');
  });
});
