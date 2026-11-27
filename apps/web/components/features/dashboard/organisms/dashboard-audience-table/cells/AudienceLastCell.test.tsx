import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceLastCell } from './AudienceLastCell';
import { NowMsProvider } from './NowMsContext';

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

function renderCell(lastSeenAt: string | null, dir?: 'rtl') {
  return render(
    <NowMsProvider>
      <div dir={dir}>
        <AudienceLastCell lastSeenAt={lastSeenAt} />
      </div>
    </NowMsProvider>
  );
}

describe('AudienceLastCell certificate', () => {
  it.each([
    [10_000, 'now'],
    [5 * 60_000, '5m'],
    [3 * 60 * 60_000, '3h'],
    [4 * 24 * 60 * 60_000, '4d'],
  ])('formats %ims ago as %s', async (ms, label) => {
    const { container } = renderCell(ago(ms));
    expect(await screen.findByText(label)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders an em dash when the fan was never seen or the date is invalid', async () => {
    const never = renderCell(null);
    expect(screen.getByText('—')).toBeInTheDocument();
    await expectNoA11yViolations(never.container);
    never.unmount();

    renderCell('not-a-date');
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders an em dash before the client clock mounts', () => {
    render(<AudienceLastCell lastSeenAt={ago(5 * 60_000)} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders inside an RTL document', async () => {
    const { container } = renderCell(ago(2 * 60 * 60_000), 'rtl');
    expect(await screen.findByText('2h')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders through the kit RelativeTimeCell (tabular tertiary text)', async () => {
    renderCell(ago(5 * 60_000));
    expect(await screen.findByText('5m')).toHaveClass(
      'tabular-nums',
      'text-tertiary-token'
    );
  });
});
