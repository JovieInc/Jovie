import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageToolbar } from '@/components/organisms/table';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WorkspacePage } from './WorkspacePage';

describe('WorkspacePage', () => {
  it('renders the toolbar before the workspace content', async () => {
    const { container } = render(
      <WorkspacePage
        frame='none'
        toolbar={<PageToolbar start={<span>3 items</span>} />}
      >
        <div>Workspace content</div>
      </WorkspacePage>
    );

    const status = screen.getByText('3 items');
    const content = screen.getByText('Workspace content');

    expect(status.compareDocumentPosition(content)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    await expectNoA11yViolations(container);
  });
});
