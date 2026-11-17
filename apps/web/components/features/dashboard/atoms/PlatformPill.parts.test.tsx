import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  CollapsedContent,
  ExpandedContent,
  PillIcon,
  PillShimmer,
  TrailingContent,
} from './PlatformPill.parts';

describe('PlatformPill.parts', () => {
  it('renders the shimmer only when shown, hidden from assistive tech', async () => {
    const { container, rerender } = render(<PillShimmer show={false} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<PillShimmer show />);
    const shimmer = container.querySelector('span');
    expect(shimmer).toHaveAttribute('aria-hidden', 'true');
    expect(shimmer?.style.backgroundImage).toContain('--color-on-media');
    await expectNoA11yViolations(container);
  });

  it('renders the icon chip hidden from assistive tech with its style', async () => {
    const { container } = render(
      <PillIcon platformIcon='spotify' style={{ opacity: 0.5 }} />
    );
    const chip = container.firstElementChild as HTMLElement;
    expect(chip).toHaveAttribute('aria-hidden', 'true');
    expect(chip.style.opacity).toBe('0.5');
    await expectNoA11yViolations(container);
  });

  it('hides collapsed text until hover unless expanded by default', async () => {
    const { container, rerender } = render(
      <CollapsedContent defaultExpanded={false} primaryText='Spotify' />
    );
    expect(screen.getByText('Spotify')).toHaveClass('max-w-0', 'opacity-0');

    rerender(<CollapsedContent defaultExpanded primaryText='Spotify' />);
    expect(screen.getByText('Spotify')).toHaveClass('max-w-48', 'opacity-100');
    await expectNoA11yViolations(container);
  });

  it('shows primary text alone when the optional parts are missing', async () => {
    const { container } = render(<ExpandedContent primaryText='Spotify' />);
    expect(screen.getByText('Spotify')).not.toHaveClass('truncate');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it('truncates long text and shows the badge and suffix', async () => {
    const long = 'The Extremely Long Official Artist Name Of This Profile';
    const { container } = render(
      <ExpandedContent
        primaryText={long}
        secondaryText={`${long} again`}
        badgeText='New'
        suffix='↗'
      />
    );
    expect(screen.getByText(long)).toHaveClass('truncate');
    expect(screen.getByText(`${long} again`)).toHaveClass('truncate');
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('↗')).toHaveAttribute('aria-hidden', 'true');
    await expectNoA11yViolations(container);
  });

  it('ignores whitespace-only secondary text', () => {
    render(<ExpandedContent primaryText='Spotify' secondaryText='   ' />);
    expect(screen.queryByText(/^\s+$/)).not.toBeInTheDocument();
  });

  it('drops trailing content while collapsed', async () => {
    const { container, rerender } = render(
      <TrailingContent collapsed>
        <span>2.3M</span>
      </TrailingContent>
    );
    expect(screen.queryByText('2.3M')).not.toBeInTheDocument();

    rerender(
      <TrailingContent collapsed={false}>
        <span>2.3M</span>
      </TrailingContent>
    );
    expect(screen.getByText('2.3M')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders right-to-left Arabic text', async () => {
    const { container } = render(
      <div dir='rtl'>
        <ExpandedContent primaryText='سبوتيفاي' secondaryText='الفنان' />
      </div>
    );
    expect(screen.getByText('سبوتيفاي')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
