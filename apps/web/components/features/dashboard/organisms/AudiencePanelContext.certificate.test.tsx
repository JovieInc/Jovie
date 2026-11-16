import { Button } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  type AudiencePanelMode,
  AudiencePanelProvider,
  ControlledAudiencePanelProvider,
  useAudiencePanel,
} from './AudiencePanelContext';

const PANELS = ['contact', 'analytics', 'ai-crawlers'] as const;

function PanelButtons() {
  const { mode, toggle, open, close } = useAudiencePanel();
  return (
    <div>
      {PANELS.map(panel => (
        <Button
          key={panel}
          size='sm'
          onClick={() => toggle(panel)}
          aria-pressed={mode === panel}
        >
          {panel}
        </Button>
      ))}
      <Button size='sm' onClick={() => open('analytics')}>
        Open analytics
      </Button>
      <Button size='sm' onClick={close}>
        Close
      </Button>
      <output aria-label='Active panel'>{mode ?? 'none'}</output>
    </div>
  );
}

describe('AudiencePanelContext certificate', () => {
  it('toggles, opens and closes panels through the uncontrolled provider', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AudiencePanelProvider>
        <PanelButtons />
      </AudiencePanelProvider>
    );
    const active = screen.getByLabelText('Active panel');
    expect(active).toHaveTextContent('none');
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'contact' }));
    expect(active).toHaveTextContent('contact');
    expect(screen.getByRole('button', { name: 'contact' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await user.click(screen.getByRole('button', { name: 'contact' }));
    expect(active).toHaveTextContent('none');
    await user.click(screen.getByRole('button', { name: 'Open analytics' }));
    await user.click(screen.getByRole('button', { name: 'Open analytics' }));
    expect(active).toHaveTextContent('analytics');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(active).toHaveTextContent('none');
    await expectNoA11yViolations(container);
  });

  it('reports every change to the controlled owner', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    function Owner() {
      const [mode, setMode] = useState<AudiencePanelMode | null>('analytics');
      return (
        <ControlledAudiencePanelProvider
          mode={mode}
          onModeChange={next => {
            onModeChange(next);
            setMode(next);
          }}
        >
          <PanelButtons />
        </ControlledAudiencePanelProvider>
      );
    }
    const { container } = render(<Owner />);

    await user.click(screen.getByRole('button', { name: 'analytics' }));
    expect(onModeChange).toHaveBeenLastCalledWith(null);
    await user.click(screen.getByRole('button', { name: 'ai-crawlers' }));
    expect(onModeChange).toHaveBeenLastCalledWith('ai-crawlers');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onModeChange).toHaveBeenLastCalledWith(null);
    await expectNoA11yViolations(container);
  });

  it('throws a clear error outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<PanelButtons />)).toThrow(
      'useAudiencePanel must be used within AudiencePanelProvider'
    );
    spy.mockRestore();
  });
});
