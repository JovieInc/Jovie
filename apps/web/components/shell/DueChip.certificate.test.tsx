import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DueChip } from './DueChip';

const NOW = new Date('2026-09-29T12:00:00.000Z');

describe('DueChip certificate', () => {
  it('reads a soon-due task as an axe-clean relative label', async () => {
    const { container } = render(
      <DueChip dueIso='2026-10-01T12:00:00.000Z' now={NOW} />
    );
    expect(screen.getByText('Due in 2d')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders nothing for an unparseable due date', () => {
    const { container } = render(<DueChip dueIso='not-a-date' now={NOW} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('falls back to an absolute date for year-scale gaps', async () => {
    const { container } = render(
      <DueChip dueIso='2028-12-31T12:00:00.000Z' now={NOW} />
    );
    expect(screen.getByText('Dec 31, 2028')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps overdue and muted chips axe-clean in an RTL row', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <DueChip dueIso='2026-09-25T12:00:00.000Z' now={NOW} />
        <DueChip dueIso='2026-10-20T12:00:00.000Z' now={NOW} muted />
      </div>
    );
    expect(screen.getByText('Due 4d ago')).toBeInTheDocument();
    expect(screen.getByText('Due in 3w')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
