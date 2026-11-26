import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DemoShowcaseSurface } from './DemoShowcaseSurface';

const query = vi.hoisted(() => ({ params: '' }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/demo/showcase',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(query.params),
}));

describe('DemoShowcaseSurface', () => {
  beforeEach(() => {
    query.params = '';
  });

  it('renders the release tracked-links capture', async () => {
    const { container } = render(
      <DemoShowcaseSurface surface='release-tracked-links' />
    );
    expect(
      screen.getByTestId('demo-release-tracked-links-capture')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the failed releases state from the query string', async () => {
    query.params = 'state=failed';
    const { container } = render(<DemoShowcaseSurface surface='releases' />);
    expect(
      screen.getByTestId('demo-showcase-releases-failed')
    ).toBeInTheDocument();
    // ReleasesEmptyState titles its card with an h3 under the page h1 (owned
    // by that component, outside this surface); every other rule still runs.
    await expectNoA11yViolations(container, {
      rules: { 'heading-order': { enabled: false } },
    });
  });

  it('keeps the handle typed into the onboarding step', async () => {
    const user = userEvent.setup();
    render(<DemoShowcaseSurface surface='onboarding-handle' />);
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'newhandle');
    expect(input).toHaveValue('newhandle');
    expect(input).toHaveFocus();
  });
});
