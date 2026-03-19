import { describe, expect, it, vi } from 'vitest';

import { SuggestedPrompts } from '@/components/jovie/components/SuggestedPrompts';
import { fastRender } from '@/tests/utils/fast-render';

describe('SuggestedPrompts', () => {
  it('renders default prompts when first-session mode is off', () => {
    const onSelect = vi.fn();
    const { getByText, queryByText } = fastRender(
      <SuggestedPrompts onSelect={onSelect} />
    );

    expect(getByText('Change profile photo')).toBeTruthy();
    expect(queryByText('Preview my profile')).toBeNull();
  });

  it('renders first-session prompts with release title personalization', () => {
    const onSelect = vi.fn();
    const { getByRole } = fastRender(
      <SuggestedPrompts
        onSelect={onSelect}
        isFirstSession
        latestReleaseTitle='Midnight Drive'
      />
    );

    expect(
      getByRole('button', { name: 'Set up a link for “Midnight Drive”' })
    ).toBeTruthy();
    expect(getByRole('button', { name: 'Preview my profile' })).toBeTruthy();
    expect(getByRole('button', { name: 'How do I get paid?' })).toBeTruthy();
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
    expect(queryByText('Change profile photo')).toBeNull();
  });

  it('calls onSelect with prompt when clicked', () => {
    const onSelect = vi.fn();
    const { getByText } = fastRender(<SuggestedPrompts onSelect={onSelect} />);
    getByText('Change profile photo').closest('button')?.click();
    expect(onSelect).toHaveBeenCalledWith('Help me change my profile photo.');
  });
});
