import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToolPartsRenderer } from '@/components/jovie/tool-ui';
import { fastRender } from '@/tests/utils/fast-render';

describe('ToolPartsRenderer tool failure presentation', () => {
  it('renders mapped recoverable copy for unprovisioned retouch failures', () => {
    fastRender(
      <ToolPartsRenderer
        variant='chat'
        parts={[
          {
            type: 'dynamic-tool',
            toolName: 'retouchImage',
            toolCallId: 'tool-retouch-1',
            state: 'output-available',
            output: {
              success: false,
              errorCode: 'TOOL_UNPROVISIONED',
              error: 'Retouch is not provisioned for this account.',
              retryable: true,
            },
          },
        ]}
      />
    );

    const row = screen.getByRole('alert');
    expect(row.getAttribute('data-tool-state')).toBe('failed');
    expect(row).toHaveAttribute('data-operation-status', 'failed');
    expect(row).toHaveTextContent(
      'Retouch is not provisioned for this account.'
    );
    expect(row).toHaveTextContent(/Ask Jovie for a manual workaround/i);
  });
});
