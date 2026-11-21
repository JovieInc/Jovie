import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CopyableMonospaceCell } from './CopyableMonospaceCell';

describe('CopyableMonospaceCell', () => {
  it('keeps the visible value inside the accessible name (label-content-name-mismatch)', async () => {
    const { container } = render(
      <CopyableMonospaceCell value='USRC17607839' label='ISRC' />
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('data-slot', 'plain-button');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAccessibleName('Copy ISRC: USRC17607839');
    expect(button).toHaveTextContent('USRC17607839');
    await expectNoA11yViolations(container);
  });

  it('renders an em dash placeholder when there is no value', async () => {
    const { container } = render(
      <CopyableMonospaceCell value={null} label='ISRC' />
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('—')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('copies the value and announces success', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CopyableMonospaceCell value='USRC17607839' label='ISRC' size='sm' />
    );
    await user.click(
      screen.getByRole('button', { name: 'Copy ISRC: USRC17607839' })
    );
    expect(await navigator.clipboard.readText()).toBe('USRC17607839');
    expect(screen.getByText('ISRC copied')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps a long identifier accessible in right-to-left content', async () => {
    const value = 'USRC17607839-EXTENDED-CATALOG-ID';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <CopyableMonospaceCell value={value} label='المعرف' maxWidth={80} />
      </div>
    );
    expect(
      screen.getByRole('button', { name: `Copy المعرف: ${value}` })
    ).toHaveTextContent(value);
    await expectNoA11yViolations(container);
  });
});
