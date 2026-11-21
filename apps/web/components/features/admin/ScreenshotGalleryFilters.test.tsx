import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FilterChip } from './ScreenshotGalleryFilters';

describe('FilterChip', () => {
  it('reflects pressed state, fires onSelect and is axe-clean', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { container } = render(
      <FilterChip
        label='Investor Ready'
        pressed
        idleTone='bg-surface-1'
        onSelect={onSelect}
      />
    );
    const chip = screen.getByRole('button', { name: 'Investor Ready' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(chip).toHaveAttribute('data-slot', 'plain-button');
    await user.click(chip);
    expect(onSelect).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });
});
