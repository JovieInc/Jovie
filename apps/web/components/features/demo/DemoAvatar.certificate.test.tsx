import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DemoAvatar } from './DemoAvatar';
import { DEMO_ASSIGNEES } from './demo-fixtures';

describe('DemoAvatar certificate', () => {
  it('shows initials, names the assignee and sizes from the prop', async () => {
    const [assignee] = DEMO_ASSIGNEES;
    const { container } = render(<DemoAvatar assignee={assignee} size={36} />);

    const avatar = screen.getByTitle(assignee.name);
    expect(avatar).toHaveTextContent(assignee.initials);
    expect(avatar).toHaveStyle({ width: '36px', height: '36px' });
    await expectNoA11yViolations(container);
  });

  it('keeps long initials and a row of avatars in RTL axe-clean', async () => {
    const { container } = render(
      <div dir='rtl'>
        {DEMO_ASSIGNEES.map(assignee => (
          <DemoAvatar key={assignee.id} assignee={assignee} />
        ))}
        <DemoAvatar
          assignee={{
            ...DEMO_ASSIGNEES[2],
            name: 'Mira Chen Okonkwo',
            initials: 'MCO',
          }}
        />
      </div>
    );

    expect(screen.getByTitle('Mira Chen Okonkwo')).toHaveTextContent('MCO');
    expect(container.querySelectorAll('[title]')).toHaveLength(
      DEMO_ASSIGNEES.length + 1
    );
    await expectNoA11yViolations(container);
  });
});
