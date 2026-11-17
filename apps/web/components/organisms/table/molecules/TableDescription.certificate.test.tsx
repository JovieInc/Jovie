import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TableDescription } from './TableDescription';

const TEXT =
  'Usage includes application hosting, image processing and scheduled jobs, well beyond the two-line preview.';

describe('TableDescription certificate', () => {
  it('stays axe-clean closed and with the full text open', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TableDescription text={TEXT} label='Hosting notes' />
    );

    expect(screen.getByText(TEXT)).toHaveClass('line-clamp-2');
    await expectNoA11yViolations(container);

    await user.click(
      screen.getByRole('button', { name: 'Read full Hosting notes' })
    );
    const dialog = await screen.findByRole('dialog', { name: 'Hosting notes' });
    expect(dialog).toHaveTextContent(TEXT);
    await expectNoA11yViolations(dialog);
  });

  it('renders nothing for empty text', () => {
    const { container } = render(<TableDescription text='' label='Notes' />);

    expect(container).toBeEmptyDOMElement();
  });

  it('stays axe-clean with RTL notes', async () => {
    const { container } = render(
      <div dir='rtl'>
        <TableDescription
          text='يشمل الاستخدام استضافة التطبيق.'
          label='ملاحظات'
        />
      </div>
    );

    expect(
      screen.getByRole('button', { name: 'Read full ملاحظات' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
