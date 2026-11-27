import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SkillChip } from './SkillChip';

describe('SkillChip', () => {
  it('renders a read-only chip without a remove button', async () => {
    const { container } = render(<SkillChip label='Release plan' />);

    expect(screen.getByTestId('skill-chip')).toHaveAttribute(
      'title',
      'Release plan'
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('removes the skill when the remove button is pressed', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const { container } = render(
      <SkillChip label='Release plan' onRemove={onRemove} />
    );

    await user.click(
      screen.getByRole('button', { name: 'Remove Release plan skill' })
    );

    expect(onRemove).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('uses a custom remove label and keeps focus off the chip on mouse down', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <SkillChip label='Plan' onRemove={onRemove} removeLabel='Drop plan' />
    );

    const button = screen.getByRole('button', { name: 'Drop plan' });
    await user.click(button);

    expect(button).toHaveAttribute('type', 'button');
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
