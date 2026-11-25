import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingTerminalCta } from './MarketingTerminalCta';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
    readonly prefetch?: boolean;
    readonly [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const baseProps = {
  title: 'Keep your release moving.',
  body: 'One adaptive profile for every drop.',
  ctaLabel: 'Request Access',
  ctaHref: '/signup',
  testId: 'terminal-cta',
  penContractId: MARKETING_PEN_CONTRACT_IDS.shell.finalCta,
} as const;

describe('MarketingTerminalCta', () => {
  it('renders the heading, body and primary action with no a11y violations', async () => {
    const { container } = render(<MarketingTerminalCta {...baseProps} />);
    expect(
      screen.getByRole('heading', { name: 'Keep your release moving.' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Request Access' })
    ).toHaveAttribute('href', '/signup');
    await expectNoA11yViolations(container);
  });

  it('keeps the standard surface and copy on media tokens, not palette white or black', () => {
    render(<MarketingTerminalCta {...baseProps} />);
    const section = screen.getByTestId('terminal-cta');
    expect(section).toHaveClass('bg-ink-on-media');
    expect(section.className).not.toMatch(/(^|\s)(dark:)?bg-black/);
    expect(screen.getByText(baseProps.body).className).toContain(
      'text-on-media/'
    );
    expect(screen.getByText(baseProps.body).className).not.toContain(
      'text-white'
    );
  });

  it('renders the secondary action and delivers its click', async () => {
    const onClick = vi.fn((event: React.MouseEvent) => event.preventDefault());
    const { container } = render(
      <div onClickCapture={onClick}>
        <MarketingTerminalCta
          {...baseProps}
          variant='cinematic'
          secondaryLabel='Talk to us'
          secondaryHref='/support'
        />
      </div>
    );
    const secondary = screen.getByRole('link', { name: /Talk to us/ });
    expect(secondary).toHaveAttribute('href', '/support');
    fireEvent.click(secondary);
    expect(onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('omits the body and secondary action when they are not provided', async () => {
    const { container } = render(
      <MarketingTerminalCta {...baseProps} body={undefined} />
    );
    expect(screen.queryByText(baseProps.body)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    await expectNoA11yViolations(container);
  });
});
