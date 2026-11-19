import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShareContext, ShareLaunchResult } from '@/lib/share/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PublicShareActionList, PublicShareMenu } from './PublicShareMenu';

const { launchMock, toastMock, isMobileMock } = vi.hoisted(() => ({
  launchMock:
    vi.fn<(id: string, context: ShareContext) => Promise<ShareLaunchResult>>(),
  toastMock: { success: vi.fn(), message: vi.fn(), error: vi.fn() },
  isMobileMock: vi.fn(() => false),
}));

vi.mock('@/lib/share/destinations', async importOriginal => {
  const original =
    await importOriginal<typeof import('@/lib/share/destinations')>();
  return {
    ...original,
    launchPublicShareDestination: (...args: Parameters<typeof launchMock>) =>
      launchMock(...args),
  };
});

vi.mock('@/components/feedback', () => ({ toast: toastMock }));

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => isMobileMock(),
}));

const context = {
  surfaceType: 'release',
  title: 'Midnight Drive',
  canonicalUrl: 'https://jovie.app/timwhite/midnight-drive',
  displayUrl: 'jovie.app/timwhite/midnight-drive',
  imageUrl: null,
  preparedText: 'Listen to Midnight Drive by Tim White on Jovie',
  emailSubject: 'Midnight Drive',
  emailBody: 'Listen to Midnight Drive on Jovie',
  asset: {
    kind: 'story',
    url: 'https://example.com/story.png',
    fileName: 'story.png',
    mimeType: 'image/png',
    width: 1080,
    height: 1920,
  },
  utmContext: {},
} as unknown as ShareContext;

describe('PublicShareMenu certificate', () => {
  beforeEach(() => {
    launchMock.mockReset();
    isMobileMock.mockReturnValue(false);
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture');
    Reflect.deleteProperty(HTMLElement.prototype, 'releasePointerCapture');
  });

  it('renders the share rows as design-system buttons with on-media tokens', async () => {
    const { container } = render(<PublicShareActionList context={context} />);

    const rows = screen.getAllByRole('button');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toHaveAttribute('data-slot', 'plain-button');
      expect(row).toHaveClass('text-on-media/88', 'active:bg-on-media/6');
    }
    await expectNoA11yViolations(container);
  });

  it('closes on success and explains a failed copy', async () => {
    const user = userEvent.setup();
    const onActionComplete = vi.fn();
    launchMock.mockResolvedValueOnce({ status: 'success' });
    launchMock.mockResolvedValueOnce({
      status: 'error',
      helperText: 'Could not copy the link.',
    });
    const { container } = render(
      <PublicShareActionList
        context={context}
        onActionComplete={onActionComplete}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Copy Link' }));
    expect(onActionComplete).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalledWith('Link copied');

    await user.click(screen.getByRole('button', { name: 'Copy Link' }));
    const helper = await screen.findByText('Could not copy the link.');
    expect(helper).toHaveClass('text-on-media/45');
    expect(toastMock.error).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('opens the mobile share drawer from a text trigger', async () => {
    isMobileMock.mockReturnValue(true);
    const user = userEvent.setup();
    const { baseElement } = render(
      <PublicShareMenu context={context} triggerVariant='text' title='Share' />
    );

    const trigger = screen.getByRole('button', { name: 'Share' });
    expect(trigger).toHaveAttribute('data-slot', 'plain-button');
    await user.click(trigger);
    expect(
      (await screen.findAllByText('Share this page')).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: 'Copy Link' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(baseElement);
  });

  it('opens the desktop menu from a long RTL pill trigger', async () => {
    const user = userEvent.setup();
    const title = 'مشاركة هذا الإصدار الموسع مع الجميع';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <PublicShareMenu context={context} title={title} />
      </div>
    );

    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: title }));
    expect(
      await screen.findByRole('menuitem', { name: /Copy Link/ })
    ).toBeInTheDocument();
    await expectNoA11yViolations(screen.getByRole('menu'));
  });
});
