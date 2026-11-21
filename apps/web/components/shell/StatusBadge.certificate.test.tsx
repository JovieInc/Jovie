import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { type ReleaseStatus, STATUS_CHIP, StatusBadge } from './StatusBadge';

describe('StatusBadge certificate', () => {
  it.each<[ReleaseStatus, string]>([
    ['live', 'bg-primary-token/35'],
    ['scheduled', 'bg-warning/70'],
    ['announced', 'bg-accent/75'],
    ['draft', 'bg-primary-token/15'],
    ['hidden', 'bg-transparent'],
  ])(
    'renders the %s dot with a semantic token and no axe violations',
    async (status, dotClass) => {
      const { container } = render(<StatusBadge status={status} />);
      const chip = container.firstElementChild as HTMLElement;
      expect(chip).toHaveAttribute('title', STATUS_CHIP[status].tooltip);
      expect(screen.getByText(STATUS_CHIP[status].label)).toBeInTheDocument();
      expect(container.querySelector('[aria-hidden="true"]')).toHaveClass(
        dotClass
      );
      await expectNoA11yViolations(container);
    }
  );

  it('keeps no raw palette or white classes in the status map', () => {
    for (const cfg of Object.values(STATUS_CHIP)) {
      expect(cfg.dot).not.toMatch(/(white|amber|cyan)[-/]/);
    }
  });

  it('renders inside a right-to-left row', async () => {
    const { container } = render(
      <div dir='rtl'>
        <StatusBadge status='announced' className='ms-2' />
      </div>
    );
    expect(container.querySelector('[title]')).toHaveClass('ms-2');
    await expectNoA11yViolations(container);
  });
});
