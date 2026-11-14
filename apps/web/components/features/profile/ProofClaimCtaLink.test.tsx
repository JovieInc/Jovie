import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  ProofClaimCtaLink,
  proofClaimFooterClassName,
} from './ProofClaimCtaLink';

const emitProofClaimEvent = vi.fn();
const rememberProofClaimAttribution = vi.fn();

vi.mock('@/lib/acquisition/proof-claim-client', () => ({
  emitProofClaimEvent: (...args: unknown[]) => emitProofClaimEvent(...args),
  rememberProofClaimAttribution: () => rememberProofClaimAttribution(),
}));

// Clicks stay on the page: jsdom cannot navigate to another document.
const stayOnPage = (event: MouseEvent) => event.preventDefault();

describe('ProofClaimCtaLink', () => {
  beforeEach(() => {
    emitProofClaimEvent.mockClear();
    rememberProofClaimAttribution.mockClear();
    document.addEventListener('click', stayOnPage);
    return () => document.removeEventListener('click', stayOnPage);
  });

  it('renders the taste-safe proof CTA and emits claim_started on click', () => {
    render(
      <ProofClaimCtaLink
        href='/waitlist?campaign=proof-to-claim'
        label='Request access'
        ariaLabel='Request access — get your Jovie from the Tim White profile'
      />
    );

    const cta = screen.getByTestId('proof-claim-cta');
    expect(cta).toHaveAttribute('href', '/waitlist?campaign=proof-to-claim');
    expect(cta).toHaveAccessibleName(
      'Request access — get your Jovie from the Tim White profile'
    );
    expect(cta).toHaveTextContent('Request access');
    expect(screen.queryByText(/unclaimed/i)).toBeNull();

    fireEvent.click(cta);
    expect(rememberProofClaimAttribution).toHaveBeenCalled();
    expect(emitProofClaimEvent).toHaveBeenCalledWith(
      'claim_started',
      expect.objectContaining({
        destination: '/waitlist?campaign=proof-to-claim',
        label: 'Request access',
      })
    );
  });

  it('gives the footer claim link at least a 24px hit area', () => {
    // Production audit 2026-09-28: the claim footer CTA measured 163x20,
    // below the WCAG 2.2 target-size floor. The visual stays text-sized.
    expect(proofClaimFooterClassName().split(' ')).toContain('min-h-6');
  });

  it('keeps the footer action brighter than its muted brand prefix', () => {
    const classes = proofClaimFooterClassName().split(' ');
    // on-media is the fixed #ffffff in light and dark, so the footer stays
    // white on the dark profile stage in both themes.
    expect(classes).toContain('text-on-media/88');
    expect(classes).toContain('hover:text-on-media');
    expect(classes).toContain('focus-visible:ring-on-media/70');
    expect(classes).not.toContain('text-on-media/55');
  });

  it('merges a caller class after the footer classes', () => {
    expect(proofClaimFooterClassName('mt-2').split(' ').at(-1)).toBe('mt-2');
  });

  it('names a footer link with no aria-label after its visible label and records the click', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ProofClaimCtaLink
        href='/claim'
        label='Claim yours'
        className={proofClaimFooterClassName()}
      />
    );

    const cta = screen.getByRole('link', { name: 'Claim yours' });
    expect(cta).toHaveAttribute('data-testid', 'proof-claim-cta');
    await user.click(cta);
    expect(rememberProofClaimAttribution).toHaveBeenCalledTimes(1);
    expect(emitProofClaimEvent).toHaveBeenCalledWith('claim_started', {
      destination: '/claim',
      label: 'Claim yours',
    });
    await expectNoA11yViolations(container);
  });

  it('draws custom children in place of the label and keeps the label as its name', async () => {
    const { container } = render(
      <ProofClaimCtaLink href='/claim' label='Get yours' testId='custom-cta'>
        <span>Jovie</span>
        <span>Get yours</span>
      </ProofClaimCtaLink>
    );

    const cta = screen.getByTestId('custom-cta');
    expect(cta).toHaveAccessibleName('Get yours');
    expect(cta.children).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('keeps a long label whole inside a narrow column', async () => {
    const label =
      'Request early access to your own Jovie profile for every release, tour date and fan update';
    const { container } = render(
      <div className='w-64'>
        <ProofClaimCtaLink
          href='/claim'
          label={label}
          className={proofClaimFooterClassName()}
        />
      </div>
    );

    expect(screen.getByRole('link', { name: label })).toHaveTextContent(label);
    await expectNoA11yViolations(container);
  });

  it('activates from the keyboard in a right-to-left page', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ProofClaimCtaLink
          href='/claim'
          label='اطلب الوصول'
          className={proofClaimFooterClassName()}
        />
      </div>
    );

    await user.tab();
    const cta = screen.getByRole('link', { name: 'اطلب الوصول' });
    expect(cta).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(emitProofClaimEvent).toHaveBeenCalledWith(
      'claim_started',
      expect.objectContaining({ label: 'اطلب الوصول' })
    );
    await expectNoA11yViolations(container);
  });
});
