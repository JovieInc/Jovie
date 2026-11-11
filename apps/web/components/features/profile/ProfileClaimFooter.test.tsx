import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfileClaimFooter } from './ProfileClaimFooter';

const useIsAuthenticated = vi.fn(() => false);
const track = vi.fn();
const emitProofClaimEvent = vi.fn();

vi.mock('@/hooks/useIsAuthenticated', () => ({
  useIsAuthenticated: () => useIsAuthenticated(),
}));

vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => track(...args),
}));
vi.mock('@/lib/acquisition/proof-claim-client', () => ({
  emitProofClaimEvent: (...args: unknown[]) => emitProofClaimEvent(...args),
  rememberProofClaimAttribution: vi.fn(),
}));

// Clicks stay on the page: jsdom cannot navigate to another document.
const stayOnPage = (event: MouseEvent) => event.preventDefault();

describe('ProfileClaimFooter', () => {
  beforeEach(() => {
    useIsAuthenticated.mockReturnValue(false);
    track.mockClear();
    emitProofClaimEvent.mockClear();
    document.addEventListener('click', stayOnPage);
    return () => document.removeEventListener('click', stayOnPage);
  });

  it('renders the proof-to-claim Request access CTA without calling the profile unclaimed', () => {
    render(
      <ProfileClaimFooter
        href='/waitlist?campaign=proof-to-claim'
        label='Request access'
        proofClaim
      />
    );
    const cta = screen.getByTestId('profile-claim-footer-cta');
    expect(cta).toHaveAttribute('href', '/waitlist?campaign=proof-to-claim');
    expect(cta).toHaveAccessibleName('Jovie · Request access');
    expect(screen.getByText('Request access')).toBeInTheDocument();
    expect(screen.queryByText(/unclaimed/i)).toBeNull();
  });

  it('makes the action the brightest part of the line, not the brand', () => {
    render(<ProfileClaimFooter href='/claim' label='Claim yours' proofClaim />);
    const cta = screen.getByTestId('profile-claim-footer-cta');
    const brand = screen.getByText('Jovie');
    // The label inherits the link colour; the brand sits a step quieter. All
    // three use on-media, the fixed #ffffff, over the dark profile stage.
    expect(cta.className).toContain('text-on-media/88');
    expect(cta.className).not.toContain('text-on-media/55');
    expect(brand.className).toContain('text-on-media/55');
    expect(screen.getByText('·')).toHaveClass('text-on-media/30');
  });

  it('renders nothing for a signed-in viewer or when disabled', () => {
    useIsAuthenticated.mockReturnValue(true);
    const { container, rerender } = render(
      <ProfileClaimFooter href='/claim' />
    );
    expect(container).toBeEmptyDOMElement();

    useIsAuthenticated.mockReturnValue(false);
    rerender(<ProfileClaimFooter href='/claim' enabled={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('falls back to the default label and tracks a plain footer click', async () => {
    const user = userEvent.setup();
    const { container } = render(<ProfileClaimFooter href='/claim' />);

    const cta = screen.getByTestId('profile-claim-footer-cta');
    expect(cta).toHaveAttribute('href', '/claim');
    expect(cta).toHaveTextContent('Claim Your Profile');
    await user.click(cta);
    expect(track).toHaveBeenCalledWith('profile_claim_footer_click', {
      destination: '/claim',
    });
    expect(emitProofClaimEvent).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('sends a proof click through the claim funnel instead of the footer event', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ProfileClaimFooter href='/w' label='Request access' proofClaim />
    );

    await user.click(
      screen.getByRole('link', { name: 'Jovie · Request access' })
    );
    expect(emitProofClaimEvent).toHaveBeenCalledWith(
      'claim_started',
      expect.objectContaining({ destination: '/w', label: 'Request access' })
    );
    expect(track).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('keeps a long label whole on its centered line', async () => {
    const label =
      'Request early access to your own Jovie profile for every release and tour date';
    const { container } = render(
      <div className='w-80'>
        <ProfileClaimFooter href='/claim' label={label} className='flex' />
      </div>
    );

    expect(screen.getByTestId('profile-claim-footer')).toHaveClass(
      'justify-center'
    );
    expect(screen.getByText(label)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps brand, separator and label in reading order in a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ProfileClaimFooter
          href='/claim'
          label='اطلب الوصول'
          className='flex'
        />
      </div>
    );

    expect(screen.getByTestId('profile-claim-footer-cta').textContent).toBe(
      'Jovie·اطلب الوصول'
    );
    await expectNoA11yViolations(container);
  });
});
