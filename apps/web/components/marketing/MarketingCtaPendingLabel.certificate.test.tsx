import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingCtaPendingLabel } from './MarketingCtaPendingLabel';

const { useLinkStatus } = vi.hoisted(() => ({
  useLinkStatus: vi.fn(() => ({ pending: false })),
}));

vi.mock('next/link', () => ({
  default: ({ children }: { readonly children: ReactNode }) => children,
  useLinkStatus,
}));

function renderCta(children: ReactNode, dir?: 'rtl') {
  const onClick = vi.fn((event: { preventDefault: () => void }) =>
    event.preventDefault()
  );
  const view = render(
    <div dir={dir} lang={dir ? 'ar' : undefined}>
      <a href='/signup' className='relative inline-flex' onClick={onClick}>
        <MarketingCtaPendingLabel>{children}</MarketingCtaPendingLabel>
      </a>
    </div>
  );
  return { ...view, onClick };
}

describe('MarketingCtaPendingLabel certificate', () => {
  beforeEach(() => {
    useLinkStatus.mockReturnValue({ pending: false });
  });

  it('keeps the link name and stays clickable while idle', async () => {
    const user = userEvent.setup();
    const { container, onClick } = renderCta('Get started');

    await user.click(screen.getByRole('link', { name: 'Get started' }));

    expect(onClick).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('hides the spinner layer from assistive tech while pending', async () => {
    useLinkStatus.mockReturnValue({ pending: true });
    const { container } = renderCta('Get started');

    expect(screen.getByTestId('spinner').parentElement).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(screen.getByText('Get started')).toHaveClass('opacity-0');
    await expectNoA11yViolations(container);
  });

  it('renders long and Arabic labels without losing the layers', async () => {
    const long = renderCta(
      'Claim your workspace and import every release from your catalog'
    );
    expect(screen.getByText(/Claim your workspace/)).toBeVisible();
    await expectNoA11yViolations(long.container);
    long.unmount();

    const rtl = renderCta('ابدأ الآن', 'rtl');
    expect(screen.getByText('ابدأ الآن')).toBeVisible();
    await expectNoA11yViolations(rtl.container);
  });
});
