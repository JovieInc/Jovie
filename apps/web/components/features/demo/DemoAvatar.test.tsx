import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/lib/utils/color';
import { DemoAvatar } from './DemoAvatar';
import { DEMO_ASSIGNEES } from './demo-fixtures';

describe('DemoAvatar', () => {
  it.each(DEMO_ASSIGNEES)(
    'keeps $name initials readable on their color',
    assignee => {
      render(<DemoAvatar assignee={assignee} />);
      const avatar = screen.getByTitle(assignee.name);
      const channels = getComputedStyle(avatar).color.match(/\d+/g);
      expect(channels).toHaveLength(3);
      const foreground = `#${channels!
        .map(channel => Number(channel).toString(16).padStart(2, '0'))
        .join('')}`;

      expect(contrastRatio(foreground, assignee.color)).toBeGreaterThanOrEqual(
        4.5
      );
      expect(avatar).toHaveTextContent(assignee.initials);
      expect(avatar).toHaveStyle({ width: '20px', height: '20px' });
    }
  );
});
