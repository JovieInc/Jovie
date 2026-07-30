import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import {
  AdminPeopleRightPanelProvider,
  useAdminPeopleRightPanel,
} from '@/features/admin/AdminPeopleRightPanelProvider';

function RightPanelOutlet() {
  return <aside data-testid='global-right-rail'>{useRightPanel()}</aside>;
}

function AdminPeopleFixture() {
  const [selection, setSelection] = useState<'user' | 'feedback' | null>(null);
  useAdminPeopleRightPanel(
    selection ? (
      <div data-testid={`${selection}-detail-panel`}>
        {selection === 'user' ? 'User detail' : 'Feedback detail'}
      </div>
    ) : null
  );

  return (
    <main data-testid='admin-people-content'>
      <button type='button' onClick={() => setSelection('user')}>
        Open User
      </button>
      <button type='button' onClick={() => setSelection('feedback')}>
        Open Feedback
      </button>
      <button type='button' onClick={() => setSelection(null)}>
        Close Detail
      </button>
    </main>
  );
}

describe('AdminPeopleRightPanelProvider', () => {
  it('mounts the selected detail panel in the shell rail, outside table content', () => {
    render(
      <RightPanelProvider>
        <AdminPeopleRightPanelProvider>
          <AdminPeopleFixture />
        </AdminPeopleRightPanelProvider>
        <RightPanelOutlet />
      </RightPanelProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open User' }));
    const rail = screen.getByTestId('global-right-rail');
    expect(rail).toContainElement(screen.getByTestId('user-detail-panel'));
    expect(screen.getByTestId('admin-people-content')).not.toContainElement(
      screen.getByTestId('user-detail-panel')
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Feedback' }));
    expect(rail).toContainElement(screen.getByTestId('feedback-detail-panel'));
    expect(screen.queryByTestId('user-detail-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close Detail' }));
    expect(rail).toBeEmptyDOMElement();
  });
});
