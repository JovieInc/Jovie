import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  AdminPeopleRightPanelProvider,
  useAdminPeopleRightPanel,
} from './AdminPeopleRightPanelProvider';

function ShellRail() {
  const panel = useRightPanel();
  return <aside aria-label='Detail rail'>{panel}</aside>;
}

function Tab({ label }: { readonly label: string }) {
  useAdminPeopleRightPanel(<p>{label} detail</p>);
  return <p>{label} tab</p>;
}

function Tabs() {
  const [tab, setTab] = useState<'creators' | 'waitlist' | null>('creators');
  return (
    <>
      <button type='button' onClick={() => setTab('waitlist')}>
        Waitlist
      </button>
      <button type='button' onClick={() => setTab(null)}>
        Close tab
      </button>
      {tab === 'creators' ? <Tab label='Creators' /> : null}
      {tab === 'waitlist' ? <Tab label='Waitlist' /> : null}
    </>
  );
}

function renderShell() {
  return render(
    <RightPanelProvider>
      <AdminPeopleRightPanelProvider>
        <Tabs />
      </AdminPeopleRightPanelProvider>
      <ShellRail />
    </RightPanelProvider>
  );
}

describe('AdminPeopleRightPanelProvider certificate', () => {
  it('sends the active tab detail to the shared shell rail', async () => {
    const { container } = renderShell();

    expect(screen.getByText('Creators tab')).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Detail rail' })
    ).toHaveTextContent('Creators detail');
    await expectNoA11yViolations(container);
  });

  it('swaps the rail when another tab takes over and clears it on unmount', async () => {
    const user = userEvent.setup();
    const { container } = renderShell();
    const rail = screen.getByRole('complementary', { name: 'Detail rail' });

    await user.click(screen.getByRole('button', { name: 'Waitlist' }));
    expect(rail).toHaveTextContent('Waitlist detail');
    expect(rail).not.toHaveTextContent('Creators detail');

    await user.click(screen.getByRole('button', { name: 'Close tab' }));
    expect(rail).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('renders long and RTL children unchanged', async () => {
    const long =
      'Admin People tab content with a deliberately long description of every creator row';
    const { container } = render(
      <RightPanelProvider>
        <AdminPeopleRightPanelProvider>
          <p>{long}</p>
          <p dir='rtl' lang='ar'>
            محتوى علامة تبويب الأشخاص
          </p>
        </AdminPeopleRightPanelProvider>
      </RightPanelProvider>
    );

    expect(screen.getByText(long)).toBeInTheDocument();
    expect(screen.getByText('محتوى علامة تبويب الأشخاص')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('rejects a tab that registers outside the provider', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    expect(() =>
      render(
        <RightPanelProvider>
          <Tab label='Orphan' />
        </RightPanelProvider>
      )
    ).toThrow(
      'useAdminPeopleRightPanel must be used within AdminPeopleRightPanelProvider'
    );
    consoleError.mockRestore();
  });
});
