import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  PROFILES_TABLE_SKELETON_COLUMNS,
  ProfilesRouteSkeleton,
} from './ProfilesRouteSkeleton';

describe('ProfilesRouteSkeleton', () => {
  it('draws the Profiles toolbar and table header with rows held back, axe-clean', async () => {
    const { container } = render(<ProfilesRouteSkeleton />);

    const region = screen.getByLabelText('Loading Profiles');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(within(region).getByText('Profiles')).toBeInTheDocument();

    const headers = within(region).getAllByRole('columnheader');
    expect(headers.map(cell => cell.textContent)).toEqual(
      PROFILES_TABLE_SKELETON_COLUMNS.map(column => column.header)
    );

    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ProfilesRouteSkeleton />
      </div>
    );
    expect(screen.getByLabelText('Loading Profiles')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
