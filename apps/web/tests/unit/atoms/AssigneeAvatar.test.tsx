import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AssigneeAvatar } from '@/components/atoms/AssigneeAvatar';
import { expectNoA11yViolations } from '../../utils/a11y';

const mockAssignee = {
  name: 'Jane Doe',
  initials: 'JD',
  color: '#3b82f6',
};

describe('AssigneeAvatar', () => {
  it('renders with correct aria-label from assignee.name', () => {
    render(<AssigneeAvatar assignee={mockAssignee} />);
    const avatar = screen.getByRole('img', { name: 'Jane Doe' });
    expect(avatar).toBeInTheDocument();
  });

  it('renders initials inside aria-hidden span', () => {
    render(<AssigneeAvatar assignee={mockAssignee} />);
    const span = screen.getByText('JD');
    expect(span.tagName).toBe('SPAN');
    expect(span).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders with correct background color from assignee.color', () => {
    render(<AssigneeAvatar assignee={mockAssignee} />);
    const avatar = screen.getByRole('img', { name: 'Jane Doe' });
    expect(avatar).toHaveStyle({ backgroundColor: '#3b82f6' });
  });

  it('uses default size=20', () => {
    render(<AssigneeAvatar assignee={mockAssignee} />);
    const avatar = screen.getByRole('img', { name: 'Jane Doe' });
    expect(avatar).toHaveStyle({ width: '20px', height: '20px' });
  });

  it('renders with custom size', () => {
    render(<AssigneeAvatar assignee={mockAssignee} size={32} />);
    const avatar = screen.getByRole('img', { name: 'Jane Doe' });
    expect(avatar).toHaveStyle({ width: '32px', height: '32px' });
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<AssigneeAvatar assignee={mockAssignee} />);
    await expectNoA11yViolations(container);
  });
});
