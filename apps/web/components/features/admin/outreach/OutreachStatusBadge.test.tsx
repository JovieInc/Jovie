import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OutreachStatusBadge } from './OutreachStatusBadge';

function variantOf(status: string) {
  const { container, unmount } = render(
    <OutreachStatusBadge status={status} />
  );
  const className = container.firstElementChild?.className ?? '';
  unmount();
  return className;
}

describe('OutreachStatusBadge', () => {
  it('shows the status with underscores as spaces', async () => {
    const { container } = render(
      <OutreachStatusBadge status='pending_review' />
    );
    expect(screen.getByText('pending review')).toBeInTheDocument();
    expect(container).toHaveTextContent(/^pending review$/);
    await expectNoA11yViolations(container);
  });

  it('gives a failed send its own badge treatment', async () => {
    const { container } = render(<OutreachStatusBadge status='failed' />);
    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(variantOf('failed')).not.toBe(variantOf('sent'));
    expect(variantOf('failed')).not.toBe(variantOf('queued'));
    await expectNoA11yViolations(container);
  });

  it('draws each known status differently from the others', () => {
    const variants = [
      'queued',
      'sent',
      'failed',
      'skipped',
      'pending_review',
    ].map(variantOf);
    expect(new Set(variants).size).toBe(variants.length);
  });

  it('falls back to the skipped treatment for an unknown status', async () => {
    const { container } = render(<OutreachStatusBadge status='on_hold' />);
    expect(screen.getByText('on hold')).toBeInTheDocument();
    expect(variantOf('on_hold')).toBe(variantOf('skipped'));
    await expectNoA11yViolations(container);
  });
});
