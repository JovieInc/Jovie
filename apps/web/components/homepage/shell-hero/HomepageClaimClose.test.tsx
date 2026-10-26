import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(marketing)/product/ProductClaimHandleForm', () => ({
  ProductClaimHandleForm: ({
    inputId,
    domain,
  }: {
    inputId: string;
    domain: string;
  }) => <input id={inputId} aria-label={domain} />,
}));

import { HomepageClaimClose } from './HomepageClaimClose';

afterEach(cleanup);

describe('HomepageClaimClose', () => {
  it('hosts the one real claim input the homepage contract expects', () => {
    render(<HomepageClaimClose />);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Claim your name.' })
    ).toBeInTheDocument();
    expect(
      document.querySelector('input#homepage-claim-handle')
    ).not.toBeNull();
    expect(document.getElementById('cta')).not.toBeNull();
  });
});
