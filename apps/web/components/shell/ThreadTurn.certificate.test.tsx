import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ThreadTurn } from './ThreadTurn';

describe('ThreadTurn certificate', () => {
  it('renders a two-speaker exchange axe-clean', async () => {
    const { container } = render(
      <div>
        <ThreadTurn speaker='me'>Show me my top tracks</ThreadTurn>
        <ThreadTurn speaker='jovie'>Here is what I found.</ThreadTurn>
        <ThreadTurn speaker='jovie' subtle>
          Generating…
        </ThreadTurn>
      </div>
    );
    expect(screen.getByText('Show me my top tracks')).toHaveClass(
      'max-w-[70%]'
    );
    expect(screen.getByText('Here is what I found.')).toHaveClass(
      'text-secondary-token'
    );
    expect(screen.getByText('Generating…')).toHaveClass('text-tertiary-token');
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL bubbles axe-clean', async () => {
    const long =
      'Can you pull together every playlist add from the last ninety days, group them by curator and territory, and flag the editorial ones?';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ThreadTurn speaker='me'>{long}</ThreadTurn>
        <ThreadTurn speaker='me'>أرني أفضل مقاطعي</ThreadTurn>
      </div>
    );
    expect(screen.getByText(long).parentElement).toHaveClass('justify-end');
    expect(screen.getByText('أرني أفضل مقاطعي')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
