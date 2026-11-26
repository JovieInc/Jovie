import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { InfoPopover } from './InfoPopover';

describe('InfoPopover certificate', () => {
  it('opens with only the required props, closes on Escape and is axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <InfoPopover label='About downloads'>Helper copy.</InfoPopover>
    );
    await expectNoA11yViolations(container);

    const trigger = screen.getByRole('button', { name: 'About downloads' });
    await user.click(trigger);
    expect(screen.getByTestId('inspector-info-popover')).toHaveTextContent(
      'Helper copy.'
    );
    await expectNoA11yViolations(document.body);

    await user.keyboard('{Escape}');
    expect(screen.queryByText('Helper copy.')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('shows long helper copy in full', async () => {
    const user = userEvent.setup();
    const copy =
      'Email gate to file. Only attested recordings can go live, and every download is logged against the release so you can see who collected the file and when they joined your list.';
    const { container } = render(
      <InfoPopover label='About downloads'>{copy}</InfoPopover>
    );

    await user.click(screen.getByRole('button', { name: 'About downloads' }));

    expect(screen.getByText(copy)).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('renders Arabic copy in an Arabic document', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <InfoPopover label='حول التنزيلات'>
          تبقى نصوص المساعدة خلف أيقونة المعلومات.
        </InfoPopover>
      </div>
    );

    await user.click(screen.getByRole('button', { name: 'حول التنزيلات' }));

    expect(
      screen.getByText('تبقى نصوص المساعدة خلف أيقونة المعلومات.')
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
