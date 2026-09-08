import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NoirIonWorkspaceStatesSpecimen } from './NoirIonWorkspaceStatesSpecimen';
import storyMeta, { Compact } from './NoirIonWorkspaceStatesSpecimen.stories';

describe('NoirIonWorkspaceStatesSpecimen', () => {
  it('renders the workspace state matrix with bounded table header anatomy', () => {
    render(<NoirIonWorkspaceStatesSpecimen />);

    expect(
      screen.getByTestId('noir-ion-workspace-states-specimen')
    ).toBeInTheDocument();
    expect(screen.getByTestId('noir-ion-specimen-table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { hidden: true })).toHaveClass(
      'whitespace-nowrap'
    );
    expect(screen.getByTestId('noir-ion-specimen-skeleton')).toHaveClass(
      'motion-reduce:animate-none'
    );
  });

  it('keeps its Storybook story bound to the production component', () => {
    const source = readFileSync(
      resolve(__dirname, './NoirIonWorkspaceStatesSpecimen.tsx'),
      'utf8'
    );

    expect(storyMeta.component).toBe(NoirIonWorkspaceStatesSpecimen);
    expect(Compact).toEqual({});
    expect(source).toContain("<th className='whitespace-nowrap' scope='col'>");
  });
});
