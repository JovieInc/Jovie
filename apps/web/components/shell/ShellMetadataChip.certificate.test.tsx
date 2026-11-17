import { render, screen } from '@testing-library/react';
import { Calendar } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  ShellMetadataChip,
  type ShellMetadataChipTone,
} from './ShellMetadataChip';

describe('ShellMetadataChip certificate', () => {
  it.each<[ShellMetadataChipTone, string]>([
    ['neutral', 'text-tertiary-token'],
    ['soon', 'text-accent-text/90'],
    ['warning', 'text-warning-text/90'],
    ['danger', 'text-primary-token'],
    ['muted', 'text-quaternary-token'],
  ])(
    'renders the %s tone with semantic tokens and no axe violations',
    async (tone, textClass) => {
      const { container } = render(
        <ShellMetadataChip tone={tone}>Status</ShellMetadataChip>
      );
      const chip = container.firstElementChild as HTMLElement;
      expect(chip).toHaveClass(textClass);
      expect(chip.className).not.toMatch(/(cyan|amber)-\d/);
      await expectNoA11yViolations(container);
    }
  );

  it('renders an icon without a dot for partial metadata', async () => {
    const { container } = render(
      <ShellMetadataChip
        tone='soon'
        icon={<Calendar data-testid='chip-icon' aria-hidden='true' />}
      >
        Drops Apr 27
      </ShellMetadataChip>
    );
    expect(screen.getByTestId('chip-icon')).toBeInTheDocument();
    expect(container.querySelector('.rounded-full')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps a long label on one line with its dot and title', async () => {
    const { container } = render(
      <ShellMetadataChip
        tone='warning'
        dotClassName='bg-warning/70'
        dotBorderClassName='border-warning'
        title='Waiting on review'
      >
        Waiting on distributor metadata review
      </ShellMetadataChip>
    );
    const chip = container.firstElementChild as HTMLElement;
    expect(chip).toHaveClass('whitespace-nowrap');
    expect(chip).toHaveAttribute('title', 'Waiting on review');
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).toHaveClass('bg-warning/70', 'border', 'border-warning');
    await expectNoA11yViolations(container);
  });

  it('renders inside a right-to-left row', async () => {
    const { container } = render(
      <div dir='rtl'>
        <ShellMetadataChip contentClassName='label'>مسودة</ShellMetadataChip>
      </div>
    );
    expect(screen.getByText('مسودة')).toHaveClass('label');
    await expectNoA11yViolations(container);
  });
});
