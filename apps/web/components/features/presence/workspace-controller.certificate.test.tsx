import { Input } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  PresenceWorkspaceBoundary,
  type PresenceWorkspaceScope,
} from './workspace-controller';

const SCOPE: PresenceWorkspaceScope = {
  actorId: 'actor-1',
  workspaceId: 'workspace-1',
  target: 'creator',
};

function Draft({ scope }: { readonly scope: PresenceWorkspaceScope }) {
  return (
    <PresenceWorkspaceBoundary scope={scope}>
      <Input aria-label='Workspace draft' />
    </PresenceWorkspaceBoundary>
  );
}

describe('PresenceWorkspaceBoundary certificate', () => {
  it('keeps a typed draft across re-renders in the same workspace', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<Draft scope={SCOPE} />);

    const field = screen.getByRole('textbox', { name: 'Workspace draft' });
    await user.type(field, 'Review the bio');
    rerender(<Draft scope={{ ...SCOPE }} />);

    expect(
      screen.getByRole('textbox', { name: 'Workspace draft' })
    ).toHaveValue('Review the bio');
    expect(
      screen.getByRole('textbox', { name: 'Workspace draft' })
    ).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('drops the draft when the actor, workspace or target changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Draft scope={SCOPE} />);

    for (const next of [
      { ...SCOPE, target: 'company' as const },
      { ...SCOPE, target: 'company' as const, workspaceId: 'workspace-2' },
      {
        ...SCOPE,
        target: 'company' as const,
        workspaceId: 'workspace-2',
        actorId: 'actor-2',
      },
    ]) {
      await user.type(
        screen.getByRole('textbox', { name: 'Workspace draft' }),
        'draft'
      );
      rerender(<Draft scope={next} />);
      expect(
        screen.getByRole('textbox', { name: 'Workspace draft' })
      ).toHaveValue('');
    }
  });

  it('renders nothing of its own around empty children', async () => {
    const { container } = render(
      <PresenceWorkspaceBoundary scope={SCOPE}>
        {null}
      </PresenceWorkspaceBoundary>
    );

    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('keeps an Arabic draft axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <PresenceWorkspaceBoundary scope={SCOPE}>
          <Input aria-label='مسودة مساحة العمل' defaultValue='ملاحظة' />
        </PresenceWorkspaceBoundary>
      </div>
    );

    expect(
      screen.getByRole('textbox', { name: 'مسودة مساحة العمل' })
    ).toHaveValue('ملاحظة');
    await expectNoA11yViolations(container);
  });
});
