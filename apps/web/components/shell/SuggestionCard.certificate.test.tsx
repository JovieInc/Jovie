import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SuggestionCard } from './SuggestionCard';

describe('SuggestionCard certificate', () => {
  it('fires act and dismiss handlers, axe-clean', async () => {
    const user = userEvent.setup();
    const onAct = vi.fn();
    const onDismiss = vi.fn();
    const { container } = render(
      <SuggestionCard
        title='Detroit listeners up 340%'
        body='A promoter reached out yesterday.'
        actionLabel='Review pitch'
        onAct={onAct}
        onDismiss={onDismiss}
      />
    );
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Detroit listeners up 340%',
      })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Review pitch/ }));
    expect(onAct).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('disables the action and hides dismiss without handlers', async () => {
    const { container } = render(
      <SuggestionCard
        title='Connect Spotify'
        body='Link it.'
        actionLabel='Connect'
      />
    );
    expect(screen.getByRole('button', { name: /Connect/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL copy axe-clean with a custom dismiss label', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const title =
      'Detroit listeners are up 340% this month across Spotify, Apple Music and YouTube';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <SuggestionCard
          title={title}
          body='تواصل منظم حفلات أمس. لدي عرض جاهز للمراجعة.'
          actionLabel='مراجعة العرض'
          dismissLabel='تجاهل'
          onAct={vi.fn()}
          onDismiss={onDismiss}
        />
      </div>
    );
    expect(screen.getByRole('heading', { name: title })).toHaveClass(
      'line-clamp-2'
    );
    await user.click(screen.getByRole('button', { name: 'تجاهل' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });
});
