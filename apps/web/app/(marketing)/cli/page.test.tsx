import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JOVIE_CLI_COPY, JOVIE_CLI_SOURCE_URL } from '@/data/jovieCliCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import CliPage from './page';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    prefetch?: boolean;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('CLI landing page', () => {
  it('renders one canonical hero and only implemented public commands', () => {
    render(<CliPage />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByTestId('marketing-section-hero')).toBeVisible();
    expect(screen.getByTestId('marketing-section-feature-grid')).toBeVisible();
    expect(screen.getByTestId('marketing-section-cta')).toBeVisible();

    for (const command of JOVIE_CLI_COPY.commands.items) {
      expect(screen.getByText(command.title)).toBeVisible();
    }
  });

  it('keeps the npm installation flow gated on a real registry receipt', () => {
    render(<CliPage />);

    expect(screen.getByText('Publication Pending')).toBeVisible();
    expect(screen.getByText(/@jovie\/cli is not yet public/)).toBeVisible();
    expect(screen.getByText(/npm view @jovie\/cli version/)).toBeVisible();
    expect(
      screen.queryByText(/available now|install now|published now/i)
    ).not.toBeInTheDocument();
  });

  it('wraps long command lines on mobile without changing desktop formatting', () => {
    const { container } = render(<CliPage />);

    const commandBlocks = container.querySelectorAll('pre code');
    expect(commandBlocks).toHaveLength(2);
    for (const commandBlock of commandBlocks) {
      expect(commandBlock).toHaveClass(
        'whitespace-pre-wrap',
        'break-all',
        'sm:whitespace-pre',
        'sm:break-normal'
      );
    }
  });

  it('repeats the same source and API actions through the hero and terminal CTA', () => {
    render(<CliPage />);

    const sourceLinks = screen.getAllByRole('link', {
      name: JOVIE_CLI_COPY.cta.primaryLabel,
    });
    const apiLinks = screen.getAllByRole('link', {
      name: JOVIE_CLI_COPY.cta.secondaryLabel,
    });

    expect(sourceLinks).toHaveLength(2);
    expect(apiLinks).toHaveLength(2);
    for (const link of sourceLinks) {
      expect(link).toHaveAttribute('href', JOVIE_CLI_SOURCE_URL);
    }
    for (const link of apiLinks) {
      expect(link).toHaveAttribute('href', '/developers');
    }
  });

  it('has no automated accessibility violations', async () => {
    const { container } = render(<CliPage />);

    await expectNoA11yViolations(container);
  });
});
