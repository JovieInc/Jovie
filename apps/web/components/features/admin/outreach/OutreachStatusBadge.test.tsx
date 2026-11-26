import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OutreachStatusBadge } from './OutreachStatusBadge';

describe('OutreachStatusBadge', () => {
  it.each([
    ['sent', 'sent'],
    ['failed', 'failed'],
    ['queued', 'queued'],
    ['skipped', 'skipped'],
  ])('renders the %s status as text', async (status, text) => {
    const { container } = render(<OutreachStatusBadge status={status} />);
    expect(screen.getByText(text)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('replaces underscores with spaces', async () => {
    const { container } = render(
      <OutreachStatusBadge status='pending_review' />
    );
    expect(screen.getByText('pending review')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders an unknown status without throwing', async () => {
    const { container } = render(<OutreachStatusBadge status='bounced' />);
    expect(screen.getByText('bounced')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
