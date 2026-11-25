import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { AudienceMember } from '@/types';
import { AudienceMemberReferrers } from './AudienceMemberReferrers';

const mocks = vi.hoisted(() => ({
  copy: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/hooks/useClipboard', () => ({ copyToClipboard: mocks.copy }));
vi.mock('@/components/feedback', () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

const member = {
  id: 'aud-1',
  latestActions: [
    {
      label: 'link_click',
      sourceLabel: 'Instagram bio link',
      sourceKind: 'qr',
      sourceLinkCode: 'ig123',
      timestamp: '2026-08-31T17:05:00.000Z',
    },
  ],
  referrerHistory: [
    { url: 'https://instagram.com', timestamp: '2026-08-31T17:00:00.000Z' },
  ],
  utmParams: { source: 'newsletter', medium: 'email' },
  lastSeenAt: '2026-08-31T18:20:00.000Z',
} as unknown as AudienceMember;

describe('AudienceMemberReferrers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists action, UTM and referrer sources axe-clean', async () => {
    const { container } = render(<AudienceMemberReferrers member={member} />);
    expect(screen.getByText('Instagram bio link')).toBeVisible();
    expect(screen.getByText('newsletter / email')).toBeVisible();
    expect(screen.getByText('https://instagram.com')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('says so when no source data exists', async () => {
    const { container } = render(
      <AudienceMemberReferrers
        member={
          {
            ...member,
            latestActions: [],
            referrerHistory: [],
            utmParams: {},
          } as unknown as AudienceMember
        }
      />
    );
    expect(screen.getByText('No source data yet.')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('copies the source link and reports the result', async () => {
    mocks.copy.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    render(<AudienceMemberReferrers member={member} />);
    const copy = screen.getByRole('button', { name: 'Copy Link' });
    await userEvent.click(copy);
    expect(mocks.copy).toHaveBeenCalledWith(
      expect.stringContaining('/s/ig123')
    );
    expect(mocks.success).toHaveBeenCalledWith('Source link copied');
    await userEvent.click(copy);
    expect(mocks.error).toHaveBeenCalledWith('Unable to copy source link');
  });

  it('opens the source link in a new tab', async () => {
    const open = vi.spyOn(globalThis, 'open').mockImplementation(() => null);
    render(<AudienceMemberReferrers member={member} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open Link' }));
    expect(open).toHaveBeenCalledWith(
      expect.stringContaining('/s/ig123'),
      '_blank',
      'noopener,noreferrer'
    );
    open.mockRestore();
  });
});
