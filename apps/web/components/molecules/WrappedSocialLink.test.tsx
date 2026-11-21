import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const wrap = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));
vi.mock('@/lib/queries', () => ({
  useWrapLinkMutation: () => ({ mutate: wrap.mutate, isPending: wrap.isPending }),
}));
vi.mock('@/components/atoms/SocialIcon', () => ({
  SocialIcon: () => <svg aria-hidden='true' />,
}));

import {
  LegacySocialLink,
  WrappedDSPButton,
  WrappedSocialLink,
} from './WrappedSocialLink';

describe('WrappedSocialLink', () => {
  beforeEach(() => {
    wrap.mutate.mockReset();
    wrap.isPending = false;
  });

  it('skips wrapping for internal links', async () => {
    const { container } = render(
      <WrappedSocialLink href='/listen' platform='website'>
        Listen now
      </WrappedSocialLink>
    );

    expect(wrap.mutate).not.toHaveBeenCalled();
    expect(await screen.findByRole('link')).toHaveAttribute('href', '/listen');
    expect(screen.getByText('Listen now')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('wraps an external link and routes normal links through /go', async () => {
    wrap.mutate.mockImplementation((_input, options) =>
      options.onSuccess({ kind: 'normal', shortId: 'abc', titleAlias: 'My IG' })
    );
    const { container } = render(
      <WrappedSocialLink href='https://instagram.com/jovie' platform='instagram' />
    );

    const link = await screen.findByRole('link');
    expect(link).toHaveAttribute('href', '/go/abc');
    expect(link).toHaveAttribute('data-link-kind', 'normal');
    expect(link).toHaveAttribute('rel', 'noreferrer noopener ugc nofollow');
    await expectNoA11yViolations(container);
  });

  it('routes sensitive links through /out with a verification badge', async () => {
    wrap.mutate.mockImplementation((_input, options) =>
      options.onSuccess({ kind: 'sensitive', shortId: 'xyz', titleAlias: 'Fan page' })
    );
    const { container } = render(
      <WrappedSocialLink href='https://example.com/x' platform='website' />
    );

    expect(await screen.findByText('Verification Required')).toHaveClass(
      'bg-warning-subtle'
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/out/xyz');
    await expectNoA11yViolations(container);
  });

  it('falls back to the original url when wrapping fails', async () => {
    wrap.mutate.mockImplementation((_input, options) => options.onError());
    render(<WrappedSocialLink href='https://example.com/x' platform='website' />);

    expect(await screen.findByRole('link')).toHaveAttribute(
      'href',
      'https://example.com/x'
    );
  });

  it('shows the original link while the wrap request is pending', async () => {
    wrap.isPending = true;
    const { container } = render(
      <WrappedSocialLink href='https://example.com/x' platform='website' />
    );

    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/x');
    await expectNoA11yViolations(container);
  });

  it('labels the DSP button and the legacy link', async () => {
    const { container } = render(
      <>
        <WrappedDSPButton href='/listen' platform='Spotify'>
          Spotify
        </WrappedDSPButton>
        <LegacySocialLink href='https://example.com/x' platform='website'>
          Legacy
        </LegacySocialLink>
      </>
    );

    expect(screen.getByRole('link', { name: 'Listen on Spotify' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /link$/ })).toHaveAttribute(
      'rel',
      'noreferrer noopener ugc nofollow'
    );
    await expectNoA11yViolations(container);
  });
});
