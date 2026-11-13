import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ClaimAttributionLink } from './ClaimAttributionLink';

afterEach(() => globalThis.history.replaceState(null, '', '/'));

it('preserves the destination and follows safe campaign changes without cookies', async () => {
  const { container } = render(
    <ClaimAttributionLink href='/artist/claim?next=auth'>
      Claim
    </ClaimAttributionLink>
  );
  expect(screen.getByRole('link', { name: 'Claim' })).toHaveAttribute(
    'href',
    '/artist/claim?next=auth'
  );
  await expectNoA11yViolations(container);
  act(() =>
    globalThis.history.pushState(
      null,
      '',
      '/artist?utm_campaign=claim-link-outreach&redirect_url=https://evil.example'
    )
  );
  expect(screen.getByRole('link', { name: 'Claim' })).toHaveAttribute(
    'href',
    '/artist/claim?next=auth&utm_campaign=claim-link-outreach'
  );
  await expectNoA11yViolations(container);
  act(() =>
    globalThis.history.replaceState(null, '', '/artist?utm_source=claim_link')
  );
  expect(screen.getByRole('link', { name: 'Claim' })).toHaveAttribute(
    'href',
    '/artist/claim?next=auth&utm_source=claim_link'
  );
  await expectNoA11yViolations(container);
});
