import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { INSTANT_MERCH_COPY as copy } from '@/data/instantMerchCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CREATE_MERCH_HREF, InstantMerchLanding } from './InstantMerchLanding';

vi.mock('next/image', () => ({
  default: (props: { readonly alt?: string; readonly src?: unknown }) => (
    <img
      alt={props.alt ?? ''}
      src={typeof props.src === 'string' ? props.src : ''}
    />
  ),
}));

vi.mock('@/lib/queries/useConfirmChatMerchActionMutation', () => ({
  useConfirmChatMerchActionMutation: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('InstantMerchLanding', () => {
  it('routes both CTAs into the authenticated merch conversation', () => {
    render(<InstantMerchLanding />);

    expect(screen.getByTestId('instant-merch-primary-cta')).toHaveAttribute(
      'href',
      CREATE_MERCH_HREF
    );
    expect(screen.getByTestId('instant-merch-final-cta')).toHaveAttribute(
      'href',
      CREATE_MERCH_HREF
    );
    expect(CREATE_MERCH_HREF).toBe('/app/chat?q=Make%20me%20merch');
  });

  it('never clamps the hero headline (JOV-7154)', () => {
    render(<InstantMerchLanding />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe(copy.hero.title);
    expect(heading.className).not.toMatch(/line-clamp-/);
    expect(heading.className).not.toMatch(/marketing-h1-max-two-lines/);
    expect(heading.getAttribute('style') ?? '').not.toMatch(
      /max-block-size|webkit-line-clamp/i
    );
  });

  it('shows garment mockups from the canonical merch pipeline, not album art', () => {
    render(<InstantMerchLanding />);

    const cards = screen.getAllByTestId('chat-merch-option-card');
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      const image = card.querySelector('img');
      expect(image).toBeTruthy();
      expect(image?.getAttribute('src')).toMatch(
        /^\/images\/merch\/[a-z-]+-mockup\.webp$/
      );
      expect(image?.getAttribute('src')).not.toContain('/img/releases/');
    }
  });

  it('keeps the landing composition responsive at the layout boundaries', () => {
    render(<InstantMerchLanding />);

    expect(screen.getByTestId('marketing-section-how-it-works')).toHaveClass(
      'py-16',
      'sm:py-20'
    );
    expect(screen.getByTestId('marketing-section-feature-grid')).toHaveClass(
      'py-16',
      'sm:py-20'
    );
    expect(screen.getByText('Describe the drop').closest('div')).toBeTruthy();
    expect(screen.getByText('Choose a direction').closest('div')).toBeTruthy();
    expect(
      screen.getByText('Approve the next step').closest('div')
    ).toBeTruthy();
  });

  it('has no axe violations in the rendered marketing surface', async () => {
    const { container } = render(<InstantMerchLanding />);

    await expectNoA11yViolations(container);
  });
});
