import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SuggestedPrompts } from '@/components/jovie/components/SuggestedPrompts';
import { fastRender } from '@/tests/utils/fast-render';

describe('SuggestedPrompts', () => {
  it('renders default suggestions when custom suggestions are not provided', () => {
    const onSelect = vi.fn();
    const { getByRole } = fastRender(<SuggestedPrompts onSelect={onSelect} />);

    expect(getByRole('button', { name: 'Change profile photo' })).toBeDefined();
  });

  it('renders custom suggestions and calls onSelect with the prompt', () => {
    const onSelect = vi.fn();
    const { getByRole, queryByRole } = fastRender(
      <SuggestedPrompts
        onSelect={onSelect}
        suggestions={[
          {
            icon: 'Camera',
            label: 'Write a short bio',
            prompt: 'Help me write a short bio.',
            accent: 'purple',
          },
        ]}
      />
    );

    expect(queryByRole('button', { name: 'Change profile photo' })).toBeNull();

    const customSuggestion = getByRole('button', { name: 'Write a short bio' });
    fireEvent.click(customSuggestion);

    expect(onSelect).toHaveBeenCalledWith('Help me write a short bio.');
  });
});
