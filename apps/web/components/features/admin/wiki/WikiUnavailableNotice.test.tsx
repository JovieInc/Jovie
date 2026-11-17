import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WikiUnavailableNotice } from './WikiUnavailableNotice';

describe('WikiUnavailableNotice', () => {
  it('explains which setting turns the wiki on', async () => {
    const { container } = render(<WikiUnavailableNotice />);

    expect(screen.getByText('Wiki source not configured.')).toBeVisible();
    expect(screen.getByText('GBRAIN_API_KEY').tagName).toBe('CODE');
    expect(screen.getByText(/to enable the company wiki\./)).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean inside a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <WikiUnavailableNotice />
      </div>
    );

    expect(screen.getByText('Wiki source not configured.')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
