import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const { flags } = vi.hoisted(() => ({
  flags: { SHOW_PRODUCT_DEMO_VIDEO: true },
}));

vi.mock('@/lib/flags/marketing-static', () => ({ FEATURE_FLAGS: flags }));

import { DemoVideoPage } from './DemoVideoPage';

describe('DemoVideoPage certificate', () => {
  beforeEach(() => {
    flags.SHOW_PRODUCT_DEMO_VIDEO = true;
  });

  it('renders the headline, player and both calls to action axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = render(<DemoVideoPage />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Jovie Turns Artist Signals Into Execution',
      })
    ).toBeInTheDocument();
    const download = screen.getByRole('link', { name: 'Download demo' });
    expect(download).toHaveAttribute('download', 'jovie-demo.mp4');
    const tryIt = screen.getByRole('link', { name: 'Try it free' });
    expect(tryIt).toHaveAttribute('href', '/start');

    download.focus();
    await user.tab();
    expect(tryIt).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('renders nothing while the demo video is off', async () => {
    flags.SHOW_PRODUCT_DEMO_VIDEO = false;
    const { container } = render(<DemoVideoPage />);

    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean inside a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <DemoVideoPage />
      </div>
    );

    expect(screen.getByTestId('demo-video-page')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
